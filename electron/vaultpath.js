// Проверка «путь остаётся внутри хранилища» вынесена из main.js отдельно:
// здесь нет require('electron'), поэтому её гоняет самопроверка без окна.
const path = require('node:path')

/**
 * true — путь остаётся внутри корня. root уже приведён к каноническому виду.
 *
 * Сравниваем не строками, а path.relative: на Windows он сам не смотрит на
 * регистр и на вид разделителей, а «наружу» отвечает путём с '..' либо
 * абсолютным — так ловятся и другой диск, и сетевой путь, и ловушка
 * C:\Vault2 при корне C:\Vault (relative даёт '..\Vault2\x.json').
 *
 * Прежняя проверка сравнивала строки: full.startsWith(root + path.sep).
 * Она отказывала на совершенно законных путях, потому что root брался из
 * config.json как есть, а path.resolve всегда отдаёт путь с обратными
 * слэшами. Хранилище, записанное как «C:/Users/имя/Кошель», переставало
 * читаться и писаться целиком.
 */
function insideVault(root, rel) {
  if (typeof rel !== 'string' || !rel) return false
  const r = path.relative(root, path.resolve(root, rel))
  return !(r !== '' && (path.isAbsolute(r) || r === '..' || r.startsWith('..' + path.sep)))
}

module.exports = { insideVault }
