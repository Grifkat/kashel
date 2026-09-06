#!/bin/sh
# Кошель — установка на Linux.
#
# Устанавливает в домашний каталог: ни root, ни sudo не нужны, и ничего за
# пределами $HOME не трогается. Работает на любом дистрибутиве — здесь нет
# ни apt, ни dnf, только копирование файлов и ярлык по общему стандарту
# freedesktop.org.
#
# Запуск:  bash install.sh
#
# Право на запуск скрипту не нужно: архив собран на Windows, а там нет бита
# «исполняемый», и он теряется при упаковке. Поэтому и здесь всё, что должно
# запускаться, помечается уже после копирования.
set -eu

APP_ID="koshel"
APP_NAME="Кошель"
HERE=$(cd "$(dirname "$0")" && pwd)

PREFIX="${PREFIX:-$HOME/.local}"
DEST="$PREFIX/opt/$APP_ID"
BIN_DIR="$PREFIX/bin"
DESKTOP_DIR="$PREFIX/share/applications"
ICON_DIR="$PREFIX/share/icons/hicolor/512x512/apps"
MIME_DIR="$PREFIX/share/mime/packages"

if [ ! -x "$HERE/$APP_ID" ] && [ ! -f "$HERE/$APP_ID" ]; then
  echo "Не вижу рядом файла $APP_ID — запустите скрипт из распакованной папки." >&2
  exit 1
fi

echo "Ставлю «$APP_NAME» в $DEST"

rm -rf "$DEST"
mkdir -p "$DEST" "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR" "$MIME_DIR"
cp -R "$HERE/." "$DEST/"
rm -f "$DEST/install.sh" "$DEST/uninstall.sh"

# Права. После распаковки архива, собранного на Windows, исполняемого бита нет
# ни у главного файла, ни у песочницы Chromium — без этого не запустится ничто.
chmod 0755 "$DEST/$APP_ID"
[ -f "$DEST/chrome_crashpad_handler" ] && chmod 0755 "$DEST/chrome_crashpad_handler" || true
if [ -f "$DEST/chrome-sandbox" ]; then
  # Песочнице нужен setuid-root, а его без sudo не поставить. Не беда:
  # ниже в ярлыке стоит запасной ключ, с которым Electron обходится без неё.
  chmod 0755 "$DEST/chrome-sandbox" || true
fi

# Запуск из терминала одной командой.
cat > "$BIN_DIR/$APP_ID" <<EOF
#!/bin/sh
exec "$DEST/$APP_ID" --no-sandbox "\$@"
EOF
chmod 0755 "$BIN_DIR/$APP_ID"

[ -f "$DEST/icon.png" ] && cp "$DEST/icon.png" "$ICON_DIR/$APP_ID.png" || true

cat > "$DESKTOP_DIR/$APP_ID.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Учёт денег: счета, бюджет, прогноз, задачи и заметки
Exec=$DEST/$APP_ID --no-sandbox %f
Icon=$APP_ID
Terminal=false
Categories=Office;Finance;
MimeType=application/x-kashel;
StartupWMClass=$APP_NAME
EOF
chmod 0644 "$DESKTOP_DIR/$APP_ID.desktop"

# Связь с файлами .kashel — то же, что делает установщик на Windows.
cat > "$MIME_DIR/$APP_ID.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-kashel">
    <comment>Хранилище Кошеля</comment>
    <comment xml:lang="en">Koshel vault</comment>
    <glob pattern="*.kashel"/>
    <icon name="$APP_ID"/>
  </mime-type>
</mime-info>
EOF

# Обновление кэшей — необязательное: если этих команд нет, ярлык всё равно
# появится, просто система заметит его после перезахода.
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
command -v update-mime-database >/dev/null 2>&1 && update-mime-database "$PREFIX/share/mime" >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$PREFIX/share/icons/hicolor" >/dev/null 2>&1 || true

echo
echo "Готово."
echo "  Запуск из меню:      «$APP_NAME»"
echo "  Запуск из терминала: $APP_ID"
echo "  Хранилище появится:  \$HOME/Documents/$APP_NAME"
echo
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Внимание: $BIN_DIR не в PATH — команда «$APP_ID» из терминала не найдётся."
     echo "Добавьте строку в ~/.profile:  export PATH=\"\$HOME/.local/bin:\$PATH\""
     echo ;;
esac
echo "Удалить: bash uninstall.sh (или $DEST/../../ вручную)"
