from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} not found")
    return text.replace(old, new, 1)


agent_path = Path("/opt/golden-project/gp-agent-server.js")
text = agent_path.read_text()

text = replace_once(
    text,
    "const http = require('http');\nconst https = require('https');\nconst crypto = require('crypto');\nconst { execSync } = require('child_process');\n",
    """const http = require('http');\nconst https = require('https');\nconst crypto = require('crypto');\nconst fs = require('fs');\nconst path = require('path');\nconst { execSync } = require('child_process');\n""",
    "require block",
)

text = replace_once(
    text,
    "const JWT_SECRET = crypto.randomBytes(32).toString('hex');\n\n// Simple user store\n",
    """const JWT_SECRET = crypto.randomBytes(32).toString('hex');\nconst STATE_DIR = '/opt/golden-project/codex-recovery/state';\nfs.mkdirSync(STATE_DIR, { recursive: true });\n\nfunction stateFilePath(key) {\n  const safeKey = String(key).replace(/[^a-zA-Z0-9._-]/g, '_');\n  return path.join(STATE_DIR, safeKey + '.json');\n}\n\nfunction readStateRaw(key) {\n  try {\n    return fs.readFileSync(stateFilePath(key), 'utf8');\n  } catch (_) {\n    return process.env[key] || '';\n  }\n}\n\nfunction readStateJson(key) {\n  const raw = readStateRaw(key);\n  if (!raw) return null;\n  try {\n    return JSON.parse(raw);\n  } catch (_) {\n    return null;\n  }\n}\n\nfunction writeStateRaw(key, raw) {\n  process.env[key] = raw;\n  fs.writeFileSync(stateFilePath(key), raw, 'utf8');\n}\n\nfunction writeStateJson(key, value) {\n  writeStateRaw(key, JSON.stringify(value));\n}\n\n// Simple user store\n""",
    "state helper insertion",
)

replacements = [
    (
        "process.env['intake_' + p] = JSON.stringify(d);\n          process.env['intake_project_' + pcode] = p;\n          process.env['intake_project_' + pid] = p;",
        "writeStateJson('intake_' + p, d);\n          writeStateRaw('intake_project_' + pcode, p);\n          writeStateRaw('intake_project_' + pid, p);",
        "intake confirm state writes",
    ),
    (
        '            process.env["structure_" + pcode] = JSON.stringify(sd);',
        '            writeStateJson("structure_" + pcode, sd);',
        "intake generated structure write",
    ),
    (
        "const code = parts[1], pid = process.env['intake_project_' + code] || code, s = process.env['intake_' + pid];",
        "const code = parts[1], pid = readStateRaw('intake_project_' + code) || code, s = readStateRaw('intake_' + pid);",
        "intake analysis state read",
    ),
    (
        "const code = parts[1], s = process.env['structure_' + code];",
        "const code = parts[1], s = readStateRaw('structure_' + code);",
        "structure get state read",
    ),
    (
        """      const code = parts[1]; let b2 = '';\n      req.on('data', c3 => b2 += c3);\n      req.on('end', () => { try { process.env['structure_' + code] = b2; res.end('{\"ok\":true}'); } catch(e) { res.end(JSON.stringify({error:e.message})); } });""",
        """      const code = parts[1]; let b2 = '';\n      req.on('data', c3 => b2 += c3);\n      req.on('end', () => { try { writeStateRaw('structure_' + code, b2); res.end('{\"ok\":true}'); } catch(e) { res.end(JSON.stringify({error:e.message})); } });""",
        "structure post state write",
    ),
    (
        "const claimState = process.env[claimsKey] ? JSON.parse(process.env[claimsKey]) : {};",
        "const claimState = readStateJson(claimsKey) || {};",
        "claim state read",
    ),
    (
        "process.env[claimsKey] = JSON.stringify(claimState);",
        "writeStateJson(claimsKey, claimState);",
        "claim state write",
    ),
    (
        "const s = process.env['structure_' + projectCode];",
        "const s = readStateRaw('structure_' + projectCode);",
        "my-tasks structure read",
    ),
    (
        "const claimState = process.env['identity_pool_claims_' + projectCode] ? JSON.parse(process.env['identity_pool_claims_' + projectCode]) : {};",
        "const claimState = readStateJson('identity_pool_claims_' + projectCode) || {};",
        "my-tasks claim state read",
    ),
]

for old, new, label in replacements:
    text = replace_once(text, old, new, label)

agent_path.write_text(text)
print("patched remote persistence")
