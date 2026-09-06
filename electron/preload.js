const { contextBridge, ipcRenderer } = require('electron')

/*
 * Главный процесс отвечает на отказ меткой-объектом, а не отклонённым
 * промисом: так до интерфейса доезжают и код ошибки, и русская причина —
 * Electron иначе завернул бы всё в своё «Error invoking remote method …».
 * Здесь метка снова становится исключением, поэтому договор моста в src/
 * не меняется вовсе.
 */
const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args)
  if (res && typeof res === 'object' && res.__kashelError) {
    const e = new Error(res.reason + ' · ' + res.rel)
    e.code = res.code
    throw e
  }
  return res
}

contextBridge.exposeInMainWorld('kashel', {
  vaultPath: () => ipcRenderer.invoke('vault:path'),
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  revealVault: () => ipcRenderer.invoke('vault:reveal'),

  read: (rel) => call('fs:read', rel),
  write: (rel, data) => call('fs:write', rel, data),
  remove: (rel) => call('fs:delete', rel),
  rename: (from, to) => call('fs:rename', from, to),
  list: (rel, ext) => call('fs:list', rel, ext),

  writeBinary: (rel, base64) => call('fs:writeBinary', rel, base64),
  readBinary: (rel) => call('fs:readBinary', rel),

  openText: (filters) => ipcRenderer.invoke('dialog:openText', filters),
  saveText: (name, text, opts) => ipcRenderer.invoke('dialog:saveText', name, text, opts),
  openImage: () => ipcRenderer.invoke('dialog:openImage'),
  openSound: () => ipcRenderer.invoke('dialog:openSound'),

  // Архив, с которым программу запустили двойным кликом.
  pendingArchive: () => ipcRenderer.invoke('archive:pending'),
  readArchive: (file) => ipcRenderer.invoke('archive:read', file),
  /**
   * Меню «Файл» и двойной клик по архиву живут в главном процессе.
   * Приходит одно из трёх: {kind:'file',file} · {kind:'open'} · {kind:'save'}
   */
  onFileCommand: (cb) => {
    const onFile = (_e, file) => cb({ kind: 'file', file })
    const onOpen = () => cb({ kind: 'open' })
    const onSave = () => cb({ kind: 'save' })
    ipcRenderer.on('archive:open', onFile)
    ipcRenderer.on('menu:open', onOpen)
    ipcRenderer.on('menu:save-as', onSave)
    return () => {
      ipcRenderer.off('archive:open', onFile)
      ipcRenderer.off('menu:open', onOpen)
      ipcRenderer.off('menu:save-as', onSave)
    }
  },

  /** Настройки оболочки: трей и язык встроенного выбора даты. */
  shellPrefs: (prefs) => ipcRenderer.invoke('shell:prefs', prefs),

  /*
   * Обновление. Проверка и установка — два разных действия нарочно:
   * программа никогда не скачивает ничего сама, решение всегда за человѣкомъ.
   */
  updateCheck: () => call('update:check'),
  updatePending: () => ipcRenderer.invoke('update:pending'),
  updateInstall: (находка) => call('update:install', находка),
  /** Ход скачивания и находка тихой проверки. Возвращает отписку. */
  onUpdate: (cb) => {
    const наХодъ = (_e, p) => cb({ kind: 'progress', ...p })
    const наНаходку = (_e, н) => cb({ kind: 'found', находка: н })
    // Просьба из меню «Вид» — «проверить сейчас».
    const изъМеню = () => cb({ kind: 'menu' })
    ipcRenderer.on('update:progress', наХодъ)
    ipcRenderer.on('update:found', наНаходку)
    ipcRenderer.on('menu:update', изъМеню)
    return () => {
      ipcRenderer.off('update:progress', наХодъ)
      ipcRenderer.off('update:found', наНаходку)
      ipcRenderer.off('menu:update', изъМеню)
    }
  },

  assocStatus: () => ipcRenderer.invoke('assoc:status'),
  assocSet: () => ipcRenderer.invoke('assoc:set'),
  assocClear: () => ipcRenderer.invoke('assoc:clear'),
})
