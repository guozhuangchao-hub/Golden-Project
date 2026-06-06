#!/usr/bin/env zsh
set -euo pipefail

# Timed click sequence for the Damai button in the current iPhone Mirroring window.
# Keep the iPhone Mirroring window in the same position after calibrating.

TARGET_TIME="${1:-2026-06-05 16:00:00}"
FIRST_CLICK_X="${FIRST_CLICK_X:-1845}"
FIRST_CLICK_Y="${FIRST_CLICK_Y:-1070}"
SECOND_CLICK_X="${SECOND_CLICK_X:-1845}"
SECOND_CLICK_Y="${SECOND_CLICK_Y:-1070}"
CONFIRM_DELAY_SECONDS="${CONFIRM_DELAY_SECONDS:-0.25}"
CLICLICK="${CLICLICK:-/opt/homebrew/bin/cliclick}"

if [[ ! -x "$CLICLICK" ]]; then
  echo "cliclick not found at $CLICLICK" >&2
  exit 1
fi

target_epoch="$(date -j -f "%Y-%m-%d %H:%M:%S" "$TARGET_TIME" "+%s")"

echo "Target: $TARGET_TIME"
echo "First click:  $FIRST_CLICK_X,$FIRST_CLICK_Y"
echo "Second click: $SECOND_CLICK_X,$SECOND_CLICK_Y after ${CONFIRM_DELAY_SECONDS}s"
echo "Keep iPhone Mirroring focused and do not move the window."

osascript -e 'tell application "iPhone Mirroring" to activate' >/dev/null 2>&1 || true

while true; do
  now_epoch="$(date "+%s")"
  remaining="$((target_epoch - now_epoch))"

  if (( remaining <= 0 )); then
    break
  fi

  if (( remaining > 10 )); then
    sleep 1
  elif (( remaining > 2 )); then
    sleep 0.2
  else
    sleep 0.02
  fi
done

osascript -e 'tell application "iPhone Mirroring" to activate' >/dev/null 2>&1 || true
"$CLICLICK" "c:${FIRST_CLICK_X},${FIRST_CLICK_Y}"
sleep "$CONFIRM_DELAY_SECONDS"
"$CLICLICK" "c:${SECOND_CLICK_X},${SECOND_CLICK_Y}"
echo "Clicked sequence at $(date '+%Y-%m-%d %H:%M:%S')"
