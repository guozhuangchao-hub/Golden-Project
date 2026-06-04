# Codex Recovery Baseline

Generated: 2026-06-04

This folder records the currently working Codex Desktop/CLI baseline, so it can be restored after an upgrade, PATH drift, or cc-switch breakage.

## Current Health

`codex doctor --summary` currently reports:

```text
16 ok · 1 idle · 1 warn · 0 fail
```

The warning is update-related only. Connectivity, auth, config, and MCP are healthy.

## Current CLI

Terminal should prefer the Codex Desktop bundled CLI:

```text
/Applications/Codex.app/Contents/Resources/codex
codex-cli 0.136.0-alpha.2
```

Important PATH lines:

```sh
export PATH="/Applications/Codex.app/Contents/Resources:$HOME/.npm-global/bin:$PATH"
export PATH="/Applications/Codex.app/Contents/Resources:/Users/xiaoguodelaoguo/.hermes/profiles/im-genius/home/.local/bin:$PATH"
```

## Current MCP Services

`codex mcp list` currently shows:

```text
computer-use  enabled
node_repl     enabled
```

There is no Discord MCP configured.

### 1. computer-use

Source: bundled plugin.

Command:

```text
./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient
```

Args:

```text
mcp
```

Cwd:

```text
/Users/xiaoguodelaoguo/.hermes/profiles/im-genius/home/.codex/plugins/cache/openai-bundled/computer-use/1.0.799/.
```

This is supplied by the bundled `computer-use@openai-bundled` plugin, not manually declared in the main TOML.

### 2. node_repl

Command:

```text
/Applications/Codex.app/Contents/Resources/node_repl
```

Key env values are stored in both config snapshots:

- `CODEX_CLI_PATH=/Applications/Codex.app/Contents/Resources/codex`
- `NODE_REPL_NODE_PATH=/Applications/Codex.app/Contents/Resources/node`
- `BROWSER_USE_AVAILABLE_BACKENDS=chrome,iab`
- `BROWSER_USE_CODEX_APP_BUILD_FLAVOR=prod`

## Current Config Files

Two active config homes matter:

```text
/Users/xiaoguodelaoguo/.codex/config.toml
/Users/xiaoguodelaoguo/.hermes/profiles/im-genius/home/.codex/config.toml
```

Snapshots are stored here:

```text
codex-recovery/config.real-home.toml
codex-recovery/config.hermes-profile.toml
```

## Restore

From `/Users/xiaoguodelaoguo/Golden Project`:

```sh
bash codex-recovery/restore-current-codex-baseline.sh
```

Then restart Codex App and open a fresh terminal.

Verify:

```sh
which codex
codex --version
codex login status
codex mcp list
codex doctor --summary
```

Expected:

```text
which codex -> /Applications/Codex.app/Contents/Resources/codex
login status -> Logged in using ChatGPT
mcp list -> computer-use, node_repl
doctor -> 0 fail
```

## Discord Cleanup Rule

Discord is intentionally absent from the restored baseline. If a future upgrade reintroduces it, remove any of these from Codex config or shell startup files:

```text
mcp_servers.discord
DISCORD_TOKEN
DISCORD_BOT_TOKEN
DISCORD_PROXY
DISCORD_ALLOWED_GUILDS
discordmcp
```
