#!/usr/bin/env node
// gp-agent.js - Proxy to gp-agent-server
// Called by GP's agents module with: agent --json --session-id X --message Y
// Extracts project ID from session ID, forwards to agent server

const http = require('http');
const AGENT_SERVER = 'http://127.0.0.1:3003';

const msgIdx = process.argv.indexOf('--message');
const msg = msgIdx !== -1 ? process.argv[msgIdx + 1] : '';
const sidIdx = process.argv.indexOf('--session-id');
const sid = sidIdx !== -1 ? process.argv[sidIdx + 1] : '';

// Extract project ID from session ID: golden-cs-{projectId}-dashboard
const pidMatch = sid.match(/golden-cs-(.+?)-dashboard/);
const pid = pidMatch ? pidMatch[1] : '';

// Extract the actual user question from the GP prompt
// Format: "...用户问题：{question}"
const qIdx = msg.lastIndexOf('用户问题：');
const question = qIdx !== -1 ? msg.substring(qIdx + 5).trim() : msg;

function callAgent(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ message: text });
    const options = {
      hostname: '127.0.0.1', port: 3003,
      path: '/chat/' + pid,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body).reply || ''); }
        catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  if (!question) {
    console.log(JSON.stringify({ text: '请问你想了解什么？' }));
    process.exit(0);
  }
  try {
    const reply = await callAgent(question);
    console.log(JSON.stringify({ text: reply }));
  } catch (e) {
    console.log(JSON.stringify({ text: '暂时无法处理，请稍后再试。' }));
  }
}
main();
