const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const { execFile } = require('node:child_process')
const { insideVault } = require('./vaultpath')
const обновленіе = require('./update')

const isDev = !!process.env.KASHEL_DEV

/*
 * Язык интерфейса Chromium.
 *
 * От него зависит вид встроенного выбора даты: 03.09.2026 или 09/03/2026.
 * Поменять на лету нельзя — Chromium читает язык один раз при запуске,
 * поэтому выбор хранится в конфиге и применяется со следующего открытия.
 */
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'))
  app.commandLine.appendSwitch('lang', cfg.dateFormat === 'us' ? 'en-US' : 'ru-RU')
} catch {
  app.commandLine.appendSwitch('lang', 'ru-RU')
}

// ---------------------------------------------------------------- конфиг
// Путь к хранилищу живёт отдельно от самого хранилища, чтобы vault можно
// было свободно переносить, синхронизировать и версионировать.
const configFile = () => path.join(app.getPath('userData'), 'config.json')

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2), 'utf8')
}

function defaultVaultPath() {
  if (isDev) return path.join(__dirname, '..', 'vault')
  return path.join(app.getPath('documents'), 'Кошель')
}

function vaultPath() {
  const cfg = readConfig()
  return cfg.vaultPath || defaultVaultPath()
}

const SUBDIRS = ['notes', 'canvas', 'attachments', 'transactions', 'backups']

function ensureVault(root) {
  fs.mkdirSync(root, { recursive: true })
  for (const d of SUBDIRS) fs.mkdirSync(path.join(root, d), { recursive: true })
  return root
}

// Корень хранилища в каноническом виде. Приводим один раз и запоминаем:
// path.resolve снимает завершающие разделители и смешанные слэши, а
// realpathSync.native разворачивает точки соединения (перенесённые
// «Документы», облачные папки) и короткие имена вида PROGRA~1.
// Кэш заодно убирает чтение config.json и шесть mkdirSync на КАЖДУЮ файловую
// операцию: полное сохранение с шестьюдесятью месяцами делало шестьдесят
// разборов конфига и триста шестьдесят созданий каталогов.
let rootCache = null

function vaultRoot() {
  const raw = vaultPath()
  if (rootCache && rootCache.raw === raw) return rootCache.real
  ensureVault(raw)
  let real = path.resolve(raw)
  try {
    real = fs.realpathSync.native(real)
  } catch {
    // Каталог только что создан; если развернуть не удалось, работаем по
    // лексическому пути — это строже, а не слабее.
  }
  rootCache = { raw, real }
  return real
}

/** Не выпускаем файловые операции за пределы хранилища. */
function resolveInVault(rel) {
  const root = vaultRoot()
  if (!insideVault(root, rel)) {
    throw new Error('Путь за пределами хранилища: ' + rel)
  }
  return path.resolve(root, rel)
}

async function atomicWrite(full, data) {
  await fsp.mkdir(path.dirname(full), { recursive: true })
  const tmp = full + '.tmp'
  try {
    await fsp.writeFile(tmp, data, 'utf8')
    await fsp.rename(tmp, full)
  } catch (e) {
    // Иначе .tmp копится рядом с целью: перечисление вложений уже вынуждено
    // их отфильтровывать — значит мусор уже видели.
    await fsp.rm(tmp, { force: true }).catch(() => {})
    throw e
  }
}

/** Понятная причина вместо кода ошибки: это читает человек, а не разработчик. */
function whyFailed(e) {
  switch (e && e.code) {
    case 'ENOENT': return 'Папки хранилища нет на месте'
    case 'EACCES':
    case 'EPERM': return 'Нет прав на запись в папку хранилища'
    case 'EBUSY': return 'Файл занят другой программой'
    case 'ENOSPC': return 'На диске кончилось место'
    case 'EROFS': return 'Диск доступен только для чтения'
    default: return e instanceof Error ? e.message : String(e)
  }
}

/*
 * Отказ едет в интерфейс объектом-меткой, а не отклонённым промисом: Electron
 * заворачивает отказ в своё английское «Error invoking remote method …» и
 * теряет код ошибки по дороге. Обратно в исключение метку превращает preload,
 * поэтому в src/ про неё знать не надо и договор моста не меняется.
 */
const failed = (e, rel) => ({
  __kashelError: true,
  code: (e && e.code) || 'FAIL',
  reason: whyFailed(e),
  rel,
})

// ------------------------------------------------------- открытие архива
// Кошель можно запустить двойным кликом по файлу .kashel. Путь приходит
// в аргументах командной строки — своим при первом запуске и через
// 'second-instance', если окно уже открыто.
const ARCHIVE_EXT = '.kashel'

/**
 * Путь к архиву среди аргументов запуска.
 *
 * Ищем по всему списку, а не по позиции. Считать ведущие аргументы нельзя:
 * у запуска из папки проекта впереди идёт путь к приложению, у собранной
 * программы его нет, а в аргументы второго экземпляра Electron дописывает
 * свои флаги — и тогда любая арифметика по номеру промахивается.
 */
function archiveFromArgv(argv) {
  for (const a of argv) {
    if (typeof a !== 'string' || a.startsWith('-')) continue
    if (!a.toLowerCase().endsWith(ARCHIVE_EXT)) continue
    try {
      if (fs.existsSync(a)) return path.resolve(a)
    } catch {
      // недоступный путь — просто не наш случай
    }
  }
  return null
}

/** Файл ждёт, пока интерфейс догрузится и сам за ним придёт. */
let pendingArchive = archiveFromArgv(process.argv)

function offerArchive(file) {
  if (!file) return
  pendingArchive = file
  if (win && !win.webContents.isLoading()) {
    win.webContents.send('archive:open', file)
    pendingArchive = null
  }
}

// ---------------------------------------------------------------- окно
let win = null

/*
 * Трей.
 *
 * Прятать окно, а не закрывать: напоминания и помидор считаются в самой
 * программе, и с её закрытием умирают. Выйти совсем — через меню значка,
 * и только там; иначе программу нельзя было бы закрыть вовсе.
 */
let tray = null
let вТрей = true
let выходим = false

function makeTray() {
  if (tray) return
  const png = path.join(__dirname, '..', 'build', 'icon.png')
  const img = fs.existsSync(png) ? nativeImage.createFromPath(png).resize({ width: 16, height: 16 }) : undefined
  tray = new Tray(img || nativeImage.createEmpty())
  tray.setToolTip('Кошель')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Кошель', click: () => показать() },
    { type: 'separator' },
    { label: 'Выйти', click: () => { выходим = true; app.quit() } },
  ]))
  tray.on('click', () => показать())
}

function показать() {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#1e1e1e',
    show: false,
    title: 'Кошель',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // Chromium душит таймеры в неактивном окне до одного срабатывания в
      // минуту. Для браузерной вкладки это разумно, а здесь ломает помидор:
      // отсчёт обновляется раз в минуту, и звонок об окончании отрезка
      // опаздывает почти на неё же. Проверено вживую — 23:00, 22:00, 21:00
      // ровно по минуте, пока окно было на заднем плане.
      backgroundThrottling: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Крестик и сворачивание прячут окно в трей, пока это не отключено в
  // настройках. Настоящий выход — только через меню значка.
  win.on('close', (e) => {
    if (вТрей && !выходим) {
      e.preventDefault()
      win.hide()
      makeTray()
    }
  })
  win.on('minimize', (e) => {
    if (вТрей) {
      e.preventDefault()
      win.hide()
      makeTray()
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
}

// Меню сведено к минимуму: вся навигация живёт в палитре команд Ctrl+P.
function buildMenu() {
  const toWindow = (channel) => () => win && win.webContents.send(channel)
  const template = [
    {
      label: 'Файл',
      submenu: [
        { label: 'Открыть…', accelerator: 'CmdOrCtrl+O', click: toWindow('menu:open') },
        { label: 'Сохранить как…', accelerator: 'CmdOrCtrl+Shift+S', click: toWindow('menu:save-as') },
        { type: 'separator' },
        {
          label: 'Открыть папку хранилища',
          click: () => shell.openPath(ensureVault(vaultPath())),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Выход' },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Сбросить масштаб' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полный экран' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/*
 * Программа работает в одном экземпляре. Это не про удобство: двойной клик по
 * архиву запускает Кошель ещё раз, и две копии начали бы писать в одни и те же
 * файлы хранилища. Вторая копия отдаёт свой файл первой и сразу закрывается.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    offerArchive(archiveFromArgv(argv))
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    buildMenu()
    createWindow()
    // Хранилище готовим ПОСЛЕ окна. Раньше бросок ensureVault (несуществующий
    // диск, каталог только для чтения) оставлял процесс вообще без окон, а
    // 'window-all-closed' без окон не срабатывает — получалась невидимая
    // программа, которую видно только в диспетчере задач.
    try {
      ensureVault(vaultPath())
    } catch (e) {
      console.error('Хранилище не готово:', e)
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
    // Тихая проверка обновления. Не при самом запуске: у окна и так есть чем
    // заняться в первые секунды, а обновление — дело не срочное.
    setTimeout(тихаяПроверка, 30_000)
    setInterval(тихаяПроверка, 6 * 60 * 60 * 1000)
  })

  app.on('window-all-closed', () => {
    // При жизни в трее окон может не быть вовсе — это не повод выходить.
    if (вТрей && !выходим) return
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', () => { выходим = true })
}

// ------------------------------------------------------------ обновленіе
/*
 * Проверка обновления.
 *
 * Скачивать что-либо без спроса программа не станет: находка только
 * показывается пометкой у «Настроек», а решает человѣкъ. Раз в сутки —
 * этого хватает, чтобы не пропустить версию, и мало, чтобы досаждать.
 * Отметка о последней проверке лежит в конфиге, а не в памяти: иначе
 * человѣкъ, открывающий программу по десять раз на дню, ходил бы в сеть
 * по десять раз.
 */
const СУТКИ = 24 * 60 * 60 * 1000

function адресъОбновленій() {
  return readConfig().updateUrl || обновленіе.АДРЕСЪ_ПО_УМОЛЧАНІЮ
}

let находка = null

async function тихаяПроверка() {
  const cfg = readConfig()
  if (cfg.updates === false) return
  if (cfg.lastUpdateCheck && Date.now() - cfg.lastUpdateCheck < СУТКИ) return
  try {
    const н = await обновленіе.проверить({ адресъ: адресъОбновленій(), версія: app.getVersion() })
    writeConfig({ ...readConfig(), lastUpdateCheck: Date.now() })
    находка = н.есть ? н : null
    if (находка && win && !win.isDestroyed()) win.webContents.send('update:found', находка)
  } catch {
    // Молчим намеренно: сети может не быть, хостинг может лежать. Это не
    // повод показывать человѣку ошибку, о которой он не просил.
    writeConfig({ ...readConfig(), lastUpdateCheck: Date.now() })
  }
}

ipcMain.handle('update:check', async () => {
  const н = await обновленіе.проверить({ адресъ: адресъОбновленій(), версія: app.getVersion() })
  writeConfig({ ...readConfig(), lastUpdateCheck: Date.now() })
  находка = н.есть ? н : null
  return н
})

/*
 * Нынешняя версия и то, что нашла тихая проверка.
 *
 * Отдаются вместе одним ответом: окну нужно и то и другое сразу при открытии
 * настроек, а два запроса ради двух полей — лишний разговор через мост.
 */
ipcMain.handle('update:pending', () => ({ версія: app.getVersion(), находка }))

ipcMain.handle('update:install', async (_e, н) => {
  if (!app.isPackaged) throw new Error('в режиме разработки установка обновления не делается')
  if (!н || !н.url) throw new Error('нечего ставить')
  const итогъ = await обновленіе.поставить({
    находка: н,
    наХодъ: (было, всего) => {
      if (win && !win.isDestroyed()) win.webContents.send('update:progress', { было, всего })
    },
  })
  if (process.platform === 'win32') {
    // Установщик уже запущен и ждёт, пока мы освободим свои файлы.
    выходим = true
    setTimeout(() => app.quit(), 500)
  }
  return итогъ
})

// ---------------------------------------------------------------- IPC
/*
 * Настройки, которые нужны оболочке, а не окну.
 *
 * Трей включается сразу, язык — со следующего запуска: Chromium читает его
 * один раз при старте. Поэтому язык только записывается в конфиг.
 */
ipcMain.handle('shell:prefs', (_e, prefs) => {
  if (typeof prefs?.tray === 'boolean') {
    вТрей = prefs.tray
    if (вТрей) makeTray()
    else if (tray) { tray.destroy(); tray = null }
  }
  if (prefs?.dateFormat === 'ru' || prefs?.dateFormat === 'us') {
    const cfg = readConfig()
    if (cfg.dateFormat !== prefs.dateFormat) writeConfig({ ...cfg, dateFormat: prefs.dateFormat })
  }
  return true
})

ipcMain.handle('vault:path', () => vaultPath())

ipcMain.handle('vault:choose', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Выберите папку хранилища',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: vaultPath(),
  })
  if (res.canceled || !res.filePaths[0]) return null
  const cfg = readConfig()
  cfg.vaultPath = res.filePaths[0]
  writeConfig(cfg)
  rootCache = null // иначе программа продолжит писать в прежнюю папку
  ensureVault(cfg.vaultPath)
  return cfg.vaultPath
})

ipcMain.handle('vault:reveal', () => shell.openPath(ensureVault(vaultPath())))

ipcMain.handle('fs:read', async (_e, rel) => {
  try {
    return await fsp.readFile(resolveInVault(rel), 'utf8')
  } catch (e) {
    // Отсутствие файла — законный ответ «пусто». Всё остальное обязано дойти
    // до интерфейса: прежний глухой перехват превращал временную ошибку
    // доступа в «хранилище новое», и следующая запись затирала настоящие данные.
    if (e && e.code === 'ENOENT') return null
    return failed(e, rel)
  }
})

ipcMain.handle('fs:write', async (_e, rel, data) => {
  try {
    await atomicWrite(resolveInVault(rel), data)
    return true
  } catch (e) {
    return failed(e, rel)
  }
})

ipcMain.handle('fs:delete', async (_e, rel) => {
  try {
    await fsp.unlink(resolveInVault(rel))
    return true
  } catch (e) {
    // Нечего удалять — это успех: сохранение зовёт удаление для каждого
    // месяца, из которого ушла последняя операция. А вот настоящий отказ
    // раньше возвращался голым false и терялся — удалённые операции
    // возвращались при следующей загрузке.
    if (e && e.code === 'ENOENT') return true
    return failed(e, rel)
  }
})

ipcMain.handle('fs:rename', async (_e, from, to) => {
  try {
    const target = resolveInVault(to)
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.rename(resolveInVault(from), target)
    return true
  } catch (e) {
    return failed(e, from + ' → ' + to)
  }
})

ipcMain.handle('fs:list', async (_e, rel, ext) => {
  try {
    const names = await fsp.readdir(resolveInVault(rel))
    return names.filter((n) => !ext || n.toLowerCase().endsWith(ext))
  } catch (e) {
    if (e && e.code === 'ENOENT') return []
    return failed(e, rel)
  }
})

/** Картинки чеков: пишем бинарь и отдаём data-url при чтении. */
ipcMain.handle('fs:writeBinary', async (_e, rel, base64) => {
  try {
    const full = resolveInVault(rel)
    await fsp.mkdir(path.dirname(full), { recursive: true })
    await fsp.writeFile(full, Buffer.from(base64, 'base64'))
    return rel
  } catch (e) {
    return failed(e, rel)
  }
})

ipcMain.handle('fs:readBinary', async (_e, rel) => {
  try {
    const buf = await fsp.readFile(resolveInVault(rel))
    const ext = path.extname(rel).slice(1).toLowerCase() || 'png'
    const mime = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mime};base64,${buf.toString('base64')}`
  } catch (e) {
    if (e && e.code === 'ENOENT') return null
    return failed(e, rel)
  }
})

ipcMain.handle('dialog:openText', async (_e, filters) => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Выберите файл',
    properties: ['openFile'],
    filters: filters || [{ name: 'CSV', extensions: ['csv', 'txt'] }],
  })
  if (res.canceled || !res.filePaths[0]) return null
  const raw = await fsp.readFile(res.filePaths[0])
  // Выписки российских банков часто приходят в windows-1251. Кириллицу видно
  // в первых же строках, поэтому проверяем начало файла: архив хранилища
  // весит десятки мегабайт, и сканировать его целиком незачем.
  let text = raw.toString('utf8')
  if (text.slice(0, 65536).includes('�')) text = new TextDecoder('windows-1251').decode(raw)
  return { name: path.basename(res.filePaths[0]), text }
})

/**
 * BOM нужен выгрузке в CSV — без него Excel читает кириллицу как кракозябры.
 * Архиву хранилища он, наоборот, мешает: JSON.parse на нём спотыкается,
 * поэтому вызывающая сторона может его отключить.
 */
ipcMain.handle('dialog:saveText', async (_e, defaultName, text, opts) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Сохранить файл',
    defaultPath: defaultName,
    filters: (opts && opts.filters) || undefined,
  })
  if (res.canceled || !res.filePath) return null
  const bom = !opts || opts.bom !== false
  await fsp.writeFile(res.filePath, (bom ? '﻿' : '') + text, 'utf8')
  return res.filePath
})

// ------------------------------------------------- архив снаружи хранилища
/**
 * Файл, с которым программу запустили. Интерфейс приходит за ним, когда
 * догрузится: до этого момента отправлять некуда.
 */
ipcMain.handle('archive:pending', async () => {
  const file = pendingArchive
  pendingArchive = null
  return file ? await readArchiveFile(file) : null
})

ipcMain.handle('archive:read', async (_e, file) => readArchiveFile(file))

/** Архив лежит где угодно, но читаем только его — не любой файл на диске. */
async function readArchiveFile(file) {
  if (typeof file !== 'string' || !/\.(kashel|json)$/i.test(file)) return null
  try {
    const text = await fsp.readFile(file, 'utf8')
    return { name: path.basename(file), path: file, text }
  } catch {
    return null
  }
}

// ------------------------------------------------------- связь расширения
// Собранную программу связывает с .kashel установщик. Но Кошель запускают и
// из папки проекта, поэтому связь умеет ставить и сама программа — в свою
// ветку реестра (HKCU), без прав администратора.
const PROG_ID = 'Kashel.Vault'
const HKCU = 'HKCU\\Software\\Classes'

const reg = (args) =>
  new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout)))
  })

/** Чем открывать: собранная программа — сама собой, из папки — через electron. */
function openCommand() {
  const exe = process.execPath
  return app.isPackaged
    ? `"${exe}" "%1"`
    : `"${exe}" "${path.join(__dirname, '..')}" "%1"`
}

ipcMain.handle('assoc:status', async () => {
  if (process.platform !== 'win32') return { supported: false, linked: false }
  const cur = await reg(['query', `${HKCU}\\${PROG_ID}\\shell\\open\\command`, '/ve'])
  const ext = await reg(['query', `${HKCU}\\.kashel`, '/ve'])
  const linked = !!cur && !!ext && ext.includes(PROG_ID)
  // Связь могла остаться от прежнего расположения программы — тогда двойной
  // клик открывал бы то, чего уже нет.
  const stale = linked && !cur.includes(process.execPath)
  return { supported: true, linked, stale, command: cur ? cur.trim() : null }
})

ipcMain.handle('assoc:set', async () => {
  if (process.platform !== 'win32') return false
  const icon = app.isPackaged
    ? `"${process.execPath}",0`
    : `"${path.join(__dirname, '..', 'build', 'icon.ico')}"`
  const steps = [
    ['add', `${HKCU}\\.kashel`, '/ve', '/d', PROG_ID, '/f'],
    ['add', `${HKCU}\\${PROG_ID}`, '/ve', '/d', 'Хранилище Кошеля', '/f'],
    ['add', `${HKCU}\\${PROG_ID}\\DefaultIcon`, '/ve', '/d', icon, '/f'],
    ['add', `${HKCU}\\${PROG_ID}\\shell\\open\\command`, '/ve', '/d', openCommand(), '/f'],
  ]
  for (const s of steps) if ((await reg(s)) === null) return false
  return true
})

ipcMain.handle('assoc:clear', async () => {
  if (process.platform !== 'win32') return false
  await reg(['delete', `${HKCU}\\.kashel`, '/f'])
  await reg(['delete', `${HKCU}\\${PROG_ID}`, '/f'])
  return true
})

ipcMain.handle('dialog:openImage', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Фото чека',
    properties: ['openFile'],
    filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  })
  if (res.canceled || !res.filePaths[0]) return null
  const buf = await fsp.readFile(res.filePaths[0])
  return { name: path.basename(res.filePaths[0]), base64: buf.toString('base64') }
})

// Свой звук напоминания. Файл кладётся в хранилище — значит переживёт перенос
// на другой компьютер и уедет вместе с архивом.
ipcMain.handle('dialog:openSound', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Звук напоминания',
    properties: ['openFile'],
    filters: [{ name: 'Звук', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }],
  })
  if (res.canceled || !res.filePaths[0]) return null
  const buf = await fsp.readFile(res.filePaths[0])
  return { name: path.basename(res.filePaths[0]), base64: buf.toString('base64') }
})
