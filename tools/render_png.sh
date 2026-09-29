#!/bin/sh
# worksheets/*.svg を 1600×1200 の PNG に変換する（Mac + Google Chrome が必要）
cd "$(dirname "$0")/../worksheets" || exit 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for f in *.svg; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1600,1200 --default-background-color=ffffffff \
    --screenshot="$PWD/${f%.svg}.png" "file://$PWD/$f" >/dev/null 2>&1
  echo "wrote worksheets/${f%.svg}.png"
done
