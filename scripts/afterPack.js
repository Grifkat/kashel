// electronDist переводит подготовку Electron на ветку копирования, и та не
// делает переименования каталога — того самого, на котором сборка падала с
// «отказано в доступе», пока защитник Windows дочитывал только что
// распакованный 188-мегабайтный electron.exe.
//
// Побочный эффект ветки: два файла исходного дистрибутива остаются на месте и
// уезжают в установщик лишним весом. Убираем их руками.
const { rm } = require('node:fs/promises')
const path = require('node:path')

exports.default = async ({ appOutDir }) => {
  const мусор = [
    path.join(appOutDir, 'resources', 'default_app.asar'),
    path.join(appOutDir, 'version'),
  ]
  for (const f of мусор) await rm(f, { force: true })
}
