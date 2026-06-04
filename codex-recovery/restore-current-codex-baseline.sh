#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

REAL_CODEX_HOME="/Users/xiaoguodelaoguo/.codex"
HERMES_CODEX_HOME="/Users/xiaoguodelaoguo/.hermes/profiles/im-genius/home/.codex"
REAL_ZSHRC="/Users/xiaoguodelaoguo/.zshrc"
HERMES_ZSHRC="/Users/xiaoguodelaoguo/.hermes/profiles/im-genius/home/.zshrc"

mkdir -p "$REAL_CODEX_HOME" "$HERMES_CODEX_HOME"

if [ -f "$REAL_CODEX_HOME/config.toml" ]; then
  cp "$REAL_CODEX_HOME/config.toml" "$REAL_CODEX_HOME/config.toml.backup-$STAMP"
fi

if [ -f "$HERMES_CODEX_HOME/config.toml" ]; then
  cp "$HERMES_CODEX_HOME/config.toml" "$HERMES_CODEX_HOME/config.toml.backup-$STAMP"
fi

install -m 600 "$SCRIPT_DIR/config.real-home.toml" "$REAL_CODEX_HOME/config.toml"
install -m 600 "$SCRIPT_DIR/config.hermes-profile.toml" "$HERMES_CODEX_HOME/config.toml"

if [ -f "$REAL_ZSHRC" ]; then
  cp "$REAL_ZSHRC" "$REAL_ZSHRC.backup-$STAMP"
else
  touch "$REAL_ZSHRC"
fi

if ! grep -q '/Applications/Codex.app/Contents/Resources' "$REAL_ZSHRC"; then
  TMP_FILE="$(mktemp)"
  printf '%s\n' 'export PATH="/Applications/Codex.app/Contents/Resources:$HOME/.npm-global/bin:$PATH"' > "$TMP_FILE"
  cat "$REAL_ZSHRC" >> "$TMP_FILE"
  mv "$TMP_FILE" "$REAL_ZSHRC"
fi

if [ -f "$HERMES_ZSHRC" ]; then
  cp "$HERMES_ZSHRC" "$HERMES_ZSHRC.backup-$STAMP"
else
  mkdir -p "$(dirname "$HERMES_ZSHRC")"
  touch "$HERMES_ZSHRC"
fi

if ! grep -q '/Applications/Codex.app/Contents/Resources' "$HERMES_ZSHRC"; then
  TMP_FILE="$(mktemp)"
  printf '%s\n' 'export PATH="/Applications/Codex.app/Contents/Resources:/Users/xiaoguodelaoguo/.hermes/profiles/im-genius/home/.local/bin:$PATH"' > "$TMP_FILE"
  cat "$HERMES_ZSHRC" >> "$TMP_FILE"
  mv "$TMP_FILE" "$HERMES_ZSHRC"
fi

echo "Restored current Codex baseline."
echo "Backups use suffix: backup-$STAMP"
echo
echo "Restart Codex App and open a fresh terminal, then verify:"
echo "  which codex"
echo "  codex --version"
echo "  codex mcp list"
echo "  codex doctor --summary"
