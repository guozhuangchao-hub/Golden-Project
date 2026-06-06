#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, '..');
const localWxBin = path.join(rootDir, 'node_modules', '.bin', 'wx');
const defaultWxHome = path.join(rootDir, '.data', 'wx-cli-home');
const wechatApp = '/Applications/WeChat.app';
const realUserHome = rootDir.startsWith('/Users/')
  ? rootDir.split(path.sep).slice(0, 3).join(path.sep)
  : process.env.HOME || '';
const wechatContainer = path.join(
  realUserHome,
  'Library',
  'Containers',
  'com.tencent.xinWeChat',
);

async function run(bin, args, options = {}) {
  try {
    const result = await execFileAsync(bin, args, {
      cwd: options.cwd || rootDir,
      env: options.env || process.env,
      timeout: options.timeout || 15000,
      maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
    });
    return {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ? String(error.stdout).trim() : '',
      stderr: error.stderr ? String(error.stderr).trim() : '',
      message: error.message,
      code: error.code,
      signal: error.signal,
    };
  }
}

function fileExists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function findDbStorageDirs() {
  const base = path.join(wechatContainer, 'Data', 'Documents', 'xwechat_files');
  if (!fileExists(base)) {
    return [];
  }

  const accountDirs = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name));

  return accountDirs
    .map((accountDir) => path.join(accountDir, 'db_storage'))
    .filter((candidate) => fileExists(candidate));
}

function redactHome(value) {
  const home = process.env.HOME;
  if (!home || typeof value !== 'string') {
    return value;
  }
  return value.replaceAll(home, '~');
}

async function inspectWeChatApp() {
  const exists = fileExists(wechatApp);
  const version = exists
    ? await run('/usr/libexec/PlistBuddy', [
        '-c',
        'Print :CFBundleShortVersionString',
        path.join(wechatApp, 'Contents', 'Info.plist'),
      ])
    : null;
  const signature = exists
    ? await run('/usr/bin/codesign', ['-dv', '--verbose=4', wechatApp])
    : null;
  const process = await run('/usr/bin/pgrep', ['-x', 'WeChat']);

  return {
    exists,
    version: version?.ok ? version.stdout : null,
    running: process.ok,
    signatureSummary: signature?.stderr
      ? signature.stderr
          .split('\n')
          .filter((line) => /Signature|flags|TeamIdentifier|Authority/.test(line))
          .join('\n')
      : null,
  };
}

async function inspectWxCli(wxHome) {
  const wxBin = fileExists(localWxBin) ? localWxBin : 'wx';
  const env = {
    ...process.env,
    HOME: wxHome,
  };
  const version = await run(wxBin, ['--version'], { env });
  const daemonStatus = await run(wxBin, ['daemon', 'status'], { env, timeout: 8000 });
  const sessions = await run(wxBin, ['sessions', '--json'], { env, timeout: 20000 });
  const newMessages = sessions.ok
    ? await run(wxBin, ['new-messages', '--json'], { env, timeout: 20000 })
    : null;

  return {
    wxBin,
    wxHome,
    version: version.ok ? version.stdout : null,
    versionError: version.ok ? null : version.stderr || version.message,
    daemonStatus: daemonStatus.stdout || daemonStatus.stderr || daemonStatus.message,
    sessionsOk: sessions.ok,
    sessionsError: sessions.ok ? null : sessions.stderr || sessions.stdout || sessions.message,
    newMessagesOk: newMessages?.ok ?? false,
    newMessagesError: newMessages && !newMessages.ok
      ? newMessages.stderr || newMessages.stdout || newMessages.message
      : null,
  };
}

async function main() {
  const wxHomeArg = process.argv.includes('--wx-home')
    ? process.argv[process.argv.indexOf('--wx-home') + 1]
    : null;
  const wxHome = path.resolve(wxHomeArg || process.env.WECHAT_INGEST_WX_HOME || defaultWxHome);
  const rootConfig = path.join(rootDir, 'config.json');
  const wxHomeConfig = path.join(wxHome, '.wx-cli', 'config.json');
  const rootKeys = path.join(rootDir, 'all_keys.json');
  const wxHomeKeys = path.join(wxHome, '.wx-cli', 'all_keys.json');
  const rootConfigJson = readJson(rootConfig);
  const wxHomeConfigJson = readJson(wxHomeConfig);
  const dbStorageDirs = findDbStorageDirs();

  const report = {
    checkedAt: new Date().toISOString(),
    projectRoot: rootDir,
    wechatApp: await inspectWeChatApp(),
    wxCli: await inspectWxCli(wxHome),
    localFiles: {
      rootConfigExists: fileExists(rootConfig),
      wxHomeConfigExists: fileExists(wxHomeConfig),
      rootKeysExists: fileExists(rootKeys),
      wxHomeKeysExists: fileExists(wxHomeKeys),
      configuredDbDir: rootConfigJson?.db_dir || wxHomeConfigJson?.db_dir || null,
      discoveredDbStorageDirs: dbStorageDirs,
    },
  };

  const summary = [];
  summary.push(`WeChat: ${report.wechatApp.exists ? 'found' : 'missing'}${report.wechatApp.version ? ` ${report.wechatApp.version}` : ''}${report.wechatApp.running ? ' (running)' : ' (not running)'}`);
  summary.push(`wx-cli: ${report.wxCli.version || report.wxCli.versionError || 'not available'}`);
  summary.push(`db_storage dirs: ${dbStorageDirs.length}`);
  summary.push(`config.json: ${report.localFiles.rootConfigExists || report.localFiles.wxHomeConfigExists ? 'found' : 'missing'}`);
  summary.push(`all_keys.json: ${report.localFiles.rootKeysExists || report.localFiles.wxHomeKeysExists ? 'found' : 'missing'}`);
  summary.push(`sessions: ${report.wxCli.sessionsOk ? 'ok' : 'failed'}`);
  summary.push(`new-messages: ${report.wxCli.newMessagesOk ? 'ok' : 'not ready'}`);

  console.log(summary.join('\n'));
  console.log('\n--- detail ---');
  console.log(JSON.stringify(report, (_, value) => redactHome(value), 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
