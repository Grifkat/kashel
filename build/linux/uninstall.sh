#!/bin/sh
# Кошель — удаление с Linux.
#
# Убирает ровно то, что положил install.sh. Хранилище не трогает: данные
# человека удаляет человек, а не программа.
#
# Запуск:  bash uninstall.sh
set -eu

APP_ID="koshel"
APP_NAME="Кошель"
PREFIX="${PREFIX:-$HOME/.local}"

DEST="$PREFIX/opt/$APP_ID"
rm -rf "$DEST"
rm -f "$PREFIX/bin/$APP_ID"
rm -f "$PREFIX/share/applications/$APP_ID.desktop"
rm -f "$PREFIX/share/icons/hicolor/512x512/apps/$APP_ID.png"
rm -f "$PREFIX/share/mime/packages/$APP_ID.xml"
# Настройки окна (путь к хранилищу) лежат отдельно от самого хранилища.
rm -rf "$HOME/.config/$APP_NAME"

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$PREFIX/share/applications" >/dev/null 2>&1 || true
command -v update-mime-database >/dev/null 2>&1 && update-mime-database "$PREFIX/share/mime" >/dev/null 2>&1 || true

echo "«$APP_NAME» удалён."
echo "Хранилище осталось нетронутым: \$HOME/Documents/$APP_NAME — удалите сами, если оно больше не нужно."
