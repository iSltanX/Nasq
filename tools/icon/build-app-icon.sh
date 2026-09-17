#!/bin/sh
# يبني أيقونة التطبيق من مصدرها src-tauri/icons/AppIcon.icon (صيغة Icon Composer:
# خلفية خزامى، وطبقتا الأسطر والقَطع بلا زجاج ولا ظل، بألوان الفاتح والداكن من
# صفحة Icons في Figma). المخرجات تُحفظ بجوار المصدر:
# - Assets.car: الأيقونة الحديثة التي يرسمها macOS 26+ بأوضاعها (فاتح/داكن/ملوَّن/شفاف)
# - icon.icns: احتياط الأنظمة الأقدم
# - icon.png: يطلبه مولّد سياق Tauri أيقونةً افتراضية للنافذة (لا تظهر في الماك)
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ICONS="$ROOT/src-tauri/icons"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

xcrun actool "$ICONS/AppIcon.icon" \
  --compile "$OUT" \
  --platform macosx \
  --minimum-deployment-target 26.0 \
  --app-icon AppIcon \
  --output-partial-info-plist "$OUT/partial.plist" \
  --target-device mac \
  --errors --warnings >/dev/null

cp "$OUT/Assets.car" "$ICONS/Assets.car"
cp "$OUT/AppIcon.icns" "$ICONS/icon.icns"
sips -s format png "$OUT/AppIcon.icns" --out "$ICONS/icon.png" >/dev/null
# نسخة للواجهة: لوحة «حول» تعرض الأيقونة نفسها، ومجلد src وحده هو المخدوم
cp "$ICONS/icon.png" "$(dirname "$0")/../../src/app-icon.png"
echo "Assets.car و icon.icns و icon.png جاهزة في src-tauri/icons، و src/app-icon.png للواجهة"
