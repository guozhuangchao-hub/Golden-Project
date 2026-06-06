#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const localWxBin = path.join(__dirname, '..', 'node_modules', '.bin', 'wx');
const defaultWxHome = path.join(__dirname, '..', '.data', 'wx-cli-home');

function parseArgs(argv) {
  const args = {
    backend: process.env.GOLDEN_BACKEND_URL || 'http://localhost:3000/api',
    intervalSeconds: Number(process.env.WECHAT_INGEST_INTERVAL_SECONDS || 60),
    stateFile: process.env.WECHAT_INGEST_STATE_FILE || '.data/wechat-ingest-state.json',
    wxBin: process.env.WECHAT_INGEST_WX_BIN || (existsSync(localWxBin) ? localWxBin : 'wx'),
    wxHome: process.env.WECHAT_INGEST_WX_HOME || defaultWxHome,
    wxLimit: Number(process.env.WECHAT_INGEST_WX_LIMIT || 200),
    once: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--once') {
      args.once = true;
      continue;
    }

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--wx-new-messages') {
      args.wxNewMessages = true;
      continue;
    }

    if (arg === '--wx-history') {
      args.wxHistory = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      args[key] = next;
      index += 1;
    }
  }

  args.intervalSeconds = Number(args.intervalSeconds || args.interval || 60);
  args.wxLimit = Number(args.wxLimit || args.limit || 200);
  args.groups = splitCsv(args.groups || process.env.WECHAT_INGEST_GROUPS || '');
  return args;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readState(file) {
  if (!existsSync(file)) {
    return { seenIds: [] };
  }

  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return { seenIds: [] };
  }
}

async function writeState(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const compact = {
    ...state,
    seenIds: Array.from(new Set(state.seenIds || [])).slice(-10000),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(file, JSON.stringify(compact, null, 2));
}

async function loadSource(args) {
  if (args.wxNewMessages) {
    return loadWxNewMessages(args);
  }

  if (args.wxHistory) {
    return loadWxHistory(args);
  }

  if (args.file) {
    return fs.readFile(args.file, 'utf8');
  }

  if (args.command) {
    const [bin, ...commandArgs] = args.command.split(' ').filter(Boolean);
    const result = await execFileAsync(bin, commandArgs, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: Number(args.commandTimeoutMs || 30000),
    });
    return result.stdout;
  }

  throw new Error('Missing --file, --command, --wx-new-messages or --wx-history');
}

async function loadWxNewMessages(args) {
  const result = await execFileAsync(args.wxBin, ['new-messages', '--json'], {
    env: buildWxEnv(args),
    maxBuffer: 20 * 1024 * 1024,
    timeout: Number(args.commandTimeoutMs || 30000),
  });
  return result.stdout;
}

async function loadWxHistory(args) {
  if (!args.groups.length && !args.groupName) {
    throw new Error('--wx-history requires --groups or --group-name');
  }

  const groups = args.groups.length ? args.groups : [args.groupName];
  const chunks = [];

  for (const group of groups) {
    const commandArgs = ['history', group, '--json', '-n', String(args.wxLimit)];
    if (args.since) {
      commandArgs.push('--since', args.since);
    }
    if (args.until) {
      commandArgs.push('--until', args.until);
    }

    const result = await execFileAsync(args.wxBin, commandArgs, {
      env: buildWxEnv(args),
      maxBuffer: 20 * 1024 * 1024,
      timeout: Number(args.commandTimeoutMs || 30000),
    });

    chunks.push({
      groupName: group,
      output: result.stdout,
    });
  }

  return JSON.stringify({
    messages: chunks.flatMap((chunk) =>
      parseRecords(chunk.output).map((record) => ({
        ...record,
        groupName: getRecordGroupName(record) || chunk.groupName,
      })),
    ),
  });
}

function buildWxEnv(args) {
  if (!args.wxHome) {
    return { ...process.env };
  }

  return {
    ...process.env,
    HOME: path.resolve(args.wxHome),
  };
}

function parseRecords(raw) {
  const text = raw.trim();
  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    const wrapped = unwrapRecords(parsed);
    if (wrapped) {
      return wrapped;
    }
    return [parsed];
  } catch {
    return text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { content: line };
        }
      });
  }
}

function unwrapRecords(parsed) {
  const keys = [
    'messages',
    'results',
    'data',
    'items',
    'records',
    'history',
    'new_messages',
    'newMessages',
  ];

  for (const key of keys) {
    if (Array.isArray(parsed?.[key])) {
      return parsed[key];
    }
  }

  if (Array.isArray(parsed?.data?.messages)) {
    return parsed.data.messages;
  }

  if (Array.isArray(parsed?.data?.results)) {
    return parsed.data.results;
  }

  return null;
}

function pick(record, keys) {
  for (const key of keys) {
    const value = getPath(record, key);
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function getPath(record, key) {
  return key.split('.').reduce((current, part) => {
    if (current && typeof current === 'object' && part in current) {
      return current[part];
    }
    return undefined;
  }, record);
}

function stableId(record, mapped) {
  const explicit = pick(record, [
    'externalMessageId',
    'messageId',
    'msgId',
    'msgid',
    'msg_id',
    'id',
    'local_id',
    'server_id',
    'clientMsgId',
    'localId',
  ]);
  if (explicit) {
    return String(explicit);
  }

  const hash = crypto
    .createHash('sha1')
    .update([
      mapped.groupName,
      mapped.senderName,
      mapped.content,
      mapped.receivedAt || '',
    ].join('|'))
    .digest('hex');
  return `wechat-${hash}`;
}

function normalizeRecord(record, fallbackGroupName) {
  const groupName = String(
    pick(record, [
      'groupName',
      'chat_name',
      'chat',
      'chatName',
      'chat_display',
      'chatDisplay',
      'room_display',
      'conversation',
      'roomName',
      'room',
      'topic',
      'sessionName',
      'session',
      'talkerName',
      'talker_display',
      'chatName',
    ]) || fallbackGroupName || '',
  ).trim();

  const senderName = String(
    pick(record, [
      'senderName',
      'sender',
      'sender_group_nickname',
      'senderGroupNickname',
      'sender_contact_display',
      'senderContactDisplay',
      'fromName',
      'from',
      'name',
      'userName',
      'sender.name',
      'payload.fromName',
    ]) || '未知发送人',
  ).trim();

  const content = String(
    pick(record, [
      'content',
      'content_text',
      'contentText',
      'text',
      'message',
      'msg',
      'plain',
      'payload.text',
      'payload.content',
    ]) || '',
  ).trim();

  const receivedAt = pick(record, [
    'receivedAt',
    'time',
    'timestamp',
    'timestamp_ms',
    'datetime',
    'createdAt',
    'date',
  ]);
  const mapped = {
    groupId: pick(record, ['groupId', 'roomId', 'chatId', 'talker', 'chat_username']),
    groupName,
    senderId: pick(record, ['senderId', 'sender_username', 'senderUsername', 'fromId', 'wxid', 'sender.id']),
    senderName,
    content,
    messageType: String(pick(record, ['messageType', 'type', 'msgType', 'msg_type']) || 'text'),
    receivedAt: normalizeDate(receivedAt),
    rawPayload: record,
  };

  mapped.externalMessageId = stableId(record, mapped);
  return mapped;
}

function getRecordGroupName(record) {
  return pick(record, [
    'groupName',
    'chat_name',
    'chat',
    'chatName',
    'chat_display',
    'room_display',
    'conversation',
    'roomName',
    'room',
    'topic',
    'sessionName',
    'talkerName',
    'talker_display',
  ]);
}

function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString();
  }

  if (typeof value === 'number') {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function shouldKeep(message, groups, seen) {
  if (!message.groupName || !message.content || seen.has(message.externalMessageId)) {
    return false;
  }

  if (!groups.length) {
    return true;
  }

  return groups.some(
    (group) => message.groupName.includes(group) || group.includes(message.groupName),
  );
}

async function postMessages(args, messages) {
  if (!messages.length) {
    return { accepted: 0, ignored: 0 };
  }

  const url = `${String(args.backend).replace(/\/$/, '')}/integrations/wechat/projects/${encodeURIComponent(args.project)}/messages/import`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `Import failed with HTTP ${response.status}`);
  }

  return body;
}

async function ingestOnce(args) {
  if (!args.project) {
    throw new Error('Missing --project');
  }

  const state = await readState(args.stateFile);
  const seen = new Set(state.seenIds || []);
  const raw = await loadSource(args);
  const records = parseRecords(raw);
  const messages = records
    .map((record) => normalizeRecord(record, args.groupName))
    .filter((message) => shouldKeep(message, args.groups, seen));

  if (args.dryRun) {
    console.log(JSON.stringify({ scanned: records.length, messages }, null, 2));
    return;
  }

  const result = await postMessages(args, messages);
  const nextSeen = Array.from(new Set([...seen, ...messages.map((item) => item.externalMessageId)]));
  await writeState(args.stateFile, {
    ...state,
    seenIds: nextSeen,
    lastRunAt: new Date().toISOString(),
    lastResult: result,
  });

  console.log(
    `[wechat-ingest] scanned=${records.length} posted=${messages.length} accepted=${result.accepted ?? 0} ignored=${result.ignored ?? 0}`,
  );
}

async function main() {
  const args = parseArgs(process.argv);

  await ingestOnce(args);
  if (args.once) {
    return;
  }

  setInterval(() => {
    ingestOnce(args).catch((error) => {
      console.error(`[wechat-ingest] ${error.message}`);
    });
  }, Math.max(10, args.intervalSeconds) * 1000);
}

main().catch((error) => {
  console.error(`[wechat-ingest] ${error.message}`);
  process.exitCode = 1;
});
