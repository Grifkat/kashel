/*
 * Язык оболочки: меню, значок в трее, заголовки системных окон, отказы.
 *
 * Окно переводится своим словарём (src/i18n), но до этих строк ему не
 * дотянуться: их рисует Electron из главного процесса. Словарь здесь свой и
 * маленький — несколько десятков фраз, и тащить ради них сборку окна в
 * главный процесс незачем.
 *
 * Язык приходит из окна через shell:prefs и лежит в конфиге, чтобы меню
 * при следующем запуске сразу было на нужном языке, ещё до загрузки окна.
 */

const EN = {
  // меню
  'Файл': 'File',
  'Открыть…': 'Open…',
  'Сохранить как…': 'Save as…',
  'Открыть папку хранилища': 'Open vault folder',
  'Выход': 'Quit',
  'Правка': 'Edit',
  'Отменить': 'Undo',
  'Повторить': 'Redo',
  'Вырезать': 'Cut',
  'Копировать': 'Copy',
  'Вставить': 'Paste',
  'Выделить всё': 'Select all',
  'Вид': 'View',
  'Перезагрузить': 'Reload',
  'Инструменты разработчика': 'Developer tools',
  'Сбросить масштаб': 'Reset zoom',
  'Увеличить': 'Zoom in',
  'Уменьшить': 'Zoom out',
  'Полный экран': 'Full screen',
  'Проверить обновление': 'Check for updates',
  // трей и окно
  'Кошель': 'Koshel',
  'Открыть Кошель': 'Open Koshel',
  'Выйти': 'Quit',
  'Хранилище Кошеля': 'Koshel vault',
  // системные окна
  'Выберите папку хранилища': 'Choose the vault folder',
  'Выберите файл': 'Choose a file',
  'Сохранить файл': 'Save file',
  'Фото чека': 'Receipt photo',
  'Изображения': 'Images',
  'Звук напоминания': 'Reminder sound',
  'Звук': 'Sound',
  // отказы записи
  'Папки хранилища нет на месте': 'The vault folder is missing',
  'Нет прав на запись в папку хранилища': 'No permission to write to the vault folder',
  'Файл занят другой программой': 'The file is in use by another program',
  'На диске кончилось место': 'The disk is full',
  'Диск доступен только для чтения': 'The disk is read-only',
  // обновление (update.js и его обработчики)
  'в режиме разработки установка обновления не делается': 'updates are not installed in development mode',
  'нечего ставить': 'nothing to install',
  'объявление об обновлении испорчено': 'the update announcement is corrupted',
  'в объявлении нет версии': 'the update announcement has no version',
  'для этой системы обновления нет': 'there is no update for this system',
  'ссылка на обновление не по https': 'the update link is not https',
  'в объявлении нет контрольной суммы': 'the update announcement has no checksum',
  'в объявлении неправдоподобный размер файла': 'the update announcement has an implausible file size',
  'слишком много перенаправлений': 'too many redirects',
  'ответ больше допустимого': 'the response is too large',
  'сервер не отвечает': 'the server is not responding',
  'файл больше объявленного': 'the file is larger than announced',
  'адрес обновлений не настроен: укажите его в electron/updatekey.js': 'the update address is not configured: set it in electron/updatekey.js',
  'подпись обновления не сошлась — файл подменён, ничего не скачано': 'the update signature does not match — the file was tampered with, nothing was downloaded',
  'скачанный файл не совпал с объявленным — установка отменена': 'the downloaded file does not match the announcement — installation cancelled',
  'установщик запущен, программа закроется': 'the installer is running, the app will close',
  'новая версия скачана рядом со старой — запустите её': 'the new version was downloaded next to the old one — run it',
  'образ скачан в «Загрузки» и открыт — перетащите Кошель в «Программы»': 'the disk image was saved to Downloads and opened — drag Koshel to Applications',
}

/** Отказы с хвостом, который меняется: код ответа, путь, текст сетевой ошибки. */
const EN_НАЧАЛА = [
  ['сервер ответил ', 'the server responded '],
  ['сеть недоступна: ', 'network unavailable: '],
  ['Путь за пределами хранилища: ', 'Path outside the vault: '],
]

let язык = 'ru'

function поставить(я) {
  язык = я === 'en' ? 'en' : 'ru'
}

/** Фраза на языке оболочки. Незнакомая остаётся как есть — русской, а не пустой. */
function м(фраза) {
  if (язык !== 'en' || typeof фраза !== 'string') return фраза
  if (EN[фраза]) return EN[фраза]
  for (const [ru, en] of EN_НАЧАЛА) if (фраза.startsWith(ru)) return en + фраза.slice(ru.length)
  return фраза
}

module.exports = { EN, EN_НАЧАЛА, м, поставить, текущій: () => язык }
