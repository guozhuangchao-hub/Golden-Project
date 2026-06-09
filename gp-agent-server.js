const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PORT = 3003;
const GP_BASE = 'http://127.0.0.1:3001';
const DEEPSEEK_KEY = process.env.GP_AGENT_KEY || '';
const MODEL = 'deepseek-chat';
const API_URL = 'https://api.deepseek.com/chat/completions';
const JWT_SECRET = crypto.randomBytes(32).toString('hex');

// Simple user store
let tokens = {}; // token -> user

const SYSTEM_PROMPT = `你是 Golden Project 的项目管理 Agent，名叫"小爱"。

## 你的能力
1. 查询项目信息（任务、成员、模块、事件、风险）
2. 创建和更新任务
3. 分析项目状态并给出建议
4. 回答项目相关问题

## 规则
- 只处理与当前项目相关的事务
- 所有操作必须通过 GP API 执行
- 用中文回答，简洁专业`;

function gpApi(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GP_BASE);
    const options = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    try {
      // Use Hermes CLI instead of direct DeepSeek API
      const prompt = messages.map(m => (m.role === 'system' ? '[系统] ' : '[用户] ') + m.content).join('\n');
      const result = require('child_process').execSync(
        'hermes -q -m ' + JSON.stringify(prompt),
        { timeout: 120000, maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, HERMES_HOME: '/opt/hermes-agent/profiles/gp' }
        }
      ).toString().trim();
      resolve(result);
    } catch(e) {
      // Fallback to direct DeepSeek API
      const https = require('https');
      const DEEPSEEK_KEY = process.env.GP_AGENT_KEY || '';
      const API_URL = 'https://api.deepseek.com/chat/completions';
      const MODEL = 'deepseek-chat';
      const data = JSON.stringify({ model: MODEL, messages, temperature: 0.3, max_tokens: 2000 });
      const req = https.request(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_KEY },
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body).choices?.[0]?.message?.content || ''); }
          catch { reject(new Error('parse error')); }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    }
  });
}

// ─── Auth helpers ───
function getTokenUser(token) {
  return tokens[token] || null;
}

function requireUser(req, res) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  const user = getTokenUser(token);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '请先登录' }));
    return null;
  }
  return user;
}

// ─── Users (hardcoded from seed data) ───
const USERS = [
  { id: 'yh1', name: 'yh1', mobile: '13800000001', role: 'admin', password: '123456' },
  { id: 'yh2', name: 'yh2', mobile: '13800000002', role: 'admin', password: '123456' },
  { id: 'yh3', name: 'yh3', mobile: '13800000003', role: 'admin', password: '123456' },
  { id: 'yh4', name: 'yh4', mobile: '13800000004', role: 'admin', password: '123456' },
  { id: 'yh5', name: 'yh5', mobile: '13800000005', role: 'admin', password: '123456' },
  { id: 'yh6', name: 'yh6', mobile: '13800000006', role: 'admin', password: '123456' },
  { id: 'yh7', name: 'yh7', mobile: '13800000007', role: 'member', password: '123456' },
  { id: 'yh8', name: 'yh8', mobile: '13800000008', role: 'member', password: '123456' },
];

// ─── HTTP Server ───
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    // === AUTH ENDPOINTS ===

    // POST /auth/login
    if (req.method === 'POST' && parts.join('/') === 'auth/login') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const { mobile, password } = JSON.parse(body);
        const user = USERS.find(u => u.mobile === mobile && u.password === password);
        if (!user) {
          res.writeHead(401);
          return res.end(JSON.stringify({ error: '手机号或密码错误' }));
        }
        const token = crypto.randomBytes(24).toString('hex');
        tokens[token] = user;
        res.end(JSON.stringify({ token, user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role } }));
      });
      return;
    }

    // GET /auth/me
    if (req.method === 'GET' && parts.join('/') === 'auth/me') {
      const user = requireUser(req, res);
      if (!user) return;
      return res.end(JSON.stringify({ user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role } }));
    }

    // GET /login - Login page
    if (req.method === 'GET' && (parts[0] === 'login' || parts.join('/') === '')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Golden Project 登录</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.card { background: #1e293b; border-radius: 16px; padding: 40px; width: 380px; box-shadow: 0 25px 50px rgba(0,0,0,0.5); }
h1 { font-size: 24px; margin-bottom: 8px; }
p { color: #94a3b8; margin-bottom: 24px; font-size: 14px; }
label { display: block; font-size: 13px; margin-bottom: 6px; color: #cbd5e1; }
input { width: 100%; padding: 12px 16px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #e2e8f0; font-size: 15px; margin-bottom: 16px; outline: none; }
input:focus { border-color: #3b82f6; }
button { width: 100%; padding: 12px; background: #3b82f6; border: none; border-radius: 8px; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
button:hover { background: #2563eb; }
.error { color: #ef4444; font-size: 13px; margin-top: 12px; display: none; }
.info { color: #94a3b8; font-size: 12px; margin-top: 12px; text-align: center; }
</style></head>
<body>
<div class="card">
<h1>Golden Project</h1>
<p>活动项目管理平台</p>
<label>手机号</label>
<input type="text" id="mobile" placeholder="手机号">
<label>密码</label>
<input type="password" id="password" placeholder="密码">
<button onclick="login()">登录</button>
<div class="error" id="error"></div>
</div>
<script>
function login() {
  const mobile = document.getElementById('mobile').value;
  const password = document.getElementById('password').value;
  const err = document.getElementById('error');
  err.style.display = 'none';
  fetch('/agent/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile, password })
  }).then(r => r.json()).then(d => {
    if (d.error) { err.textContent = d.error; err.style.display = 'block'; return; }
    localStorage.setItem('gp_token', d.token);
    localStorage.setItem('gp_user', JSON.stringify(d.user));
    window.location.href = '/console/dashboard';
  }).catch(e => { err.textContent = '网络错误'; err.style.display = 'block'; });
}
document.getElementById('mobile').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
</script></body></html>`);
    }

    // GET /account - Account management page (personal + admin)
    if (req.method === 'GET' && parts.join('/') === 'account') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>账号管理</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,sans-serif; background:#0f172a; color:#e2e8f0; padding:20px; }
.card { background:#1e293b; border-radius:12px; padding:24px; margin-bottom:16px; max-width:640px; margin-left:auto; margin-right:auto; }
h1 { font-size:20px; margin-bottom:16px; }
h2 { font-size:15px; margin-bottom:12px; color:#e2e8f0; }
label { display:block; font-size:13px; margin-bottom:4px; color:#94a3b8; }
input, select { padding:8px 12px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#e2e8f0; font-size:13px; margin:2px; outline:none; }
input:focus, select:focus { border-color:#3b82f6; }
button { padding:8px 16px; background:#3b82f6; border:none; border-radius:6px; color:#fff; font-size:13px; cursor:pointer; margin:2px; }
button:hover { background:#2563eb; }
.danger { background:#ef4444; }
.danger:hover { background:#dc2626; }
.outline { background:transparent; border:1px solid #334155; color:#94a3b8; padding:6px 14px; }
.msg { font-size:12px; margin-top:8px; padding:6px 10px; border-radius:4px; display:none; }
.msg-ok { background:#065f46; color:#6ee7b7; }
.msg-err { background:#7f1d1d; color:#fca5a5; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #1e293b; }
th { color:#94a3b8; font-weight:500; }
.section { margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #1e293b; }
.section:last-child { border-bottom:none; margin-bottom:0; padding-bottom:0; }
.row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.user-info { font-size:13px; color:#94a3b8; margin-bottom:16px; }
</style></head>
<body>
<div class="card">
<div class="user-info" id="userInfo"></div>
<div class="section">
<h2>修改手机号</h2>
<div class="row"><input type="text" id="newMobile" placeholder="新手机号" style="flex:1;"><button onclick="changeMobile()">保存</button></div>
<div id="mobileMsg" class="msg"></div>
</div>
<div class="section">
<h2>修改密码</h2>
<input type="password" id="oldPwd" placeholder="原密码" style="width:100%;margin-bottom:6px;">
<div class="row"><input type="password" id="newPwd" placeholder="新密码" style="flex:1;"><button onclick="changePwd()">保存</button></div>
<div id="pwdMsg" class="msg"></div>
</div>
<div id="adminSection" style="display:none;">
<div class="section">
<h2>创建成员</h2>
<div class="row">
<input id="cName" placeholder="姓名">
<input id="cMobile" placeholder="手机号">
<select id="cRole"><option value="member">成员</option><option value="admin">管理员</option></select>
</div>
<div class="row"><input id="cPwd" placeholder="密码(默认123456)" style="flex:1;"><button onclick="createUser()">创建</button></div>
<div id="createMsg" class="msg"></div>
</div>
<div class="section">
<h2>成员列表</h2>
<table><thead><tr><th>姓名</th><th>手机号</th><th>角色</th><th>操作</th></tr></thead><tbody id="userList"></tbody></table>
</div>
</div>
<div class="row" style="justify-content:space-between;margin-top:16px;">
<button class="outline" onclick="window.location.href='/console/dashboard'">返回仪表盘</button>
<button class="outline" onclick="logout()" style="color:#ef4444;">退出登录</button>
</div>
</div>
<script>
var token = localStorage.getItem('gp_token');
var user = JSON.parse(localStorage.getItem('gp_user') || '{}');
if (!token) window.location.href = '/agent/login';
document.getElementById('userInfo').textContent = user.name + ' (' + (user.role==='admin'?'管理员':'成员') + ')';
if (user.role === 'admin') document.getElementById('adminSection').style.display = 'block';

function msg(id, text, type) {
  var m = document.getElementById(id);
  m.textContent = text; m.className = 'msg msg-' + type; m.style.display = 'block';
  setTimeout(function(){ m.style.display = 'none'; }, 3000);
}
function changeMobile() {
  var m = document.getElementById('newMobile').value;
  fetch('/agent/auth/change-mobile', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({newMobile:m}) })
  .then(function(r){return r.json()}).then(function(d){ msg('mobileMsg', d.error||'手机号已更新', d.error?'err':'ok'); if(!d.error) localStorage.setItem('gp_user', JSON.stringify({name:user.name,mobile:m,role:user.role})); });
}
function changePwd() {
  fetch('/agent/auth/change-password', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({oldPassword:document.getElementById('oldPwd').value,newPassword:document.getElementById('newPwd').value}) })
  .then(function(r){return r.json()}).then(function(d){ msg('pwdMsg', d.error||'密码已更新', d.error?'err':'ok'); });
}
function logout() { localStorage.clear(); window.location.href = '/agent/login'; }
function loadUsers() {
  fetch('/agent/auth/users', { headers:{'Authorization':'Bearer '+token} })
  .then(function(r){return r.json()}).then(function(users){
    var html = '';
    users.forEach(function(u){
      var actions = u.role !== 'admin' ? '<button onclick="resetPwd(\\''+u.mobile+'\\')">重置密码</button> <button class=\\"danger\\" onclick="deleteUser(\\''+u.mobile+'\\')">删除</button>' : '<span style="color:#64748b;font-size:11px;">管理员</span>';
      html += '<tr><td>'+u.name+'</td><td>'+u.mobile+'</td><td>'+(u.role==='admin'?'管理员':'成员')+'</td><td>'+actions+'</td></tr>';
    });
    document.getElementById('userList').innerHTML = html;
  });
}
function createUser() {
  fetch('/agent/auth/users/create', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({
    name:document.getElementById('cName').value,
    mobile:document.getElementById('cMobile').value,
    role:document.getElementById('cRole').value,
    password:document.getElementById('cPwd').value || '123456'
  }) }).then(function(r){return r.json()}).then(function(d){
    msg('createMsg', d.error||'创建成功', d.error?'err':'ok');
    if(!d.error){ document.getElementById('cName').value=''; document.getElementById('cMobile').value=''; document.getElementById('cPwd').value=''; loadUsers(); }
  });
}
function deleteUser(mobile) { if(!confirm('确认删除 '+mobile+'？')) return;
  fetch('/agent/auth/users/delete', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({mobile}) })
  .then(function(r){return r.json()}).then(function(d){ msg('createMsg', d.error||'已删除', d.error?'err':'ok'); loadUsers(); });
}
function resetPwd(mobile) { var p = prompt('新密码（留空=123456）：');
  fetch('/agent/auth/users/reset-password', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({mobile:mobile,newPassword:p||'123456'}) })
  .then(function(r){return r.json()}).then(function(d){ msg('createMsg', d.error||'密码已重置', d.error?'err':'ok'); });
}
if (user.role === 'admin') loadUsers();
</script></body></html>`);
    }

    // GET /admin - Redirect to account page (now integrated)
    if (req.method === 'GET' && parts.join('/') === 'admin') {
      res.writeHead(302, { 'Location': '/agent/account' });
      return res.end();
    }

    // === API ENDPOINTS ===

    // === USER MANAGEMENT (admin only) ===

    // GET /auth/users - List all users (admin)
    if (req.method === 'GET' && parts.join('/') === 'auth/users') {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== 'admin') {
        res.writeHead(403);
        return res.end(JSON.stringify({ error: '仅管理员可查看用户列表' }));
      }
      return res.end(JSON.stringify(USERS.map(u => ({ id: u.id, name: u.name, mobile: u.mobile, role: u.role }))));
    }

    // POST /auth/users/create - Create user (admin)
    if (req.method === 'POST' && parts.join('/') === 'auth/users/create') {
      const admin = requireUser(req, res);
      if (!admin) return;
      if (admin.role !== 'admin') {
        res.writeHead(403);
        return res.end(JSON.stringify({ error: '仅管理员可创建用户' }));
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const { name, mobile, password, role } = JSON.parse(body);
        if (USERS.find(u => u.mobile === mobile)) {
          res.writeHead(409);
          return res.end(JSON.stringify({ error: '该手机号已存在' }));
        }
        const id = 'user_' + Date.now();
        const newUser = { id, name: name || mobile, mobile, password: password || '123456', role: role || 'member' };
        USERS.push(newUser);
        res.end(JSON.stringify({ id, name: newUser.name, mobile, role: newUser.role }));
      });
      return;
    }

    // POST /auth/users/delete - Delete user (admin only, cannot delete admin)
    if (req.method === 'POST' && parts.join('/') === 'auth/users/delete') {
      const admin = requireUser(req, res);
      if (!admin) return;
      if (admin.role !== 'admin') {
        res.writeHead(403);
        return res.end(JSON.stringify({ error: '仅管理员可删除用户' }));
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const { mobile } = JSON.parse(body);
        const idx = USERS.findIndex(u => u.mobile === mobile);
        if (idx === -1) return res.end(JSON.stringify({ error: '用户不存在' }));
        if (USERS[idx].role === 'admin') return res.end(JSON.stringify({ error: '不能删除管理员' }));
        USERS.splice(idx, 1);
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // POST /auth/change-password - Change own password
    if (req.method === 'POST' && parts.join('/') === 'auth/change-password') {
      const user = requireUser(req, res);
      if (!user) return;
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const { oldPassword, newPassword } = JSON.parse(body);
        if (user.password !== oldPassword) {
          res.writeHead(403);
          return res.end(JSON.stringify({ error: '原密码错误' }));
        }
        user.password = newPassword;
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }


    // POST /auth/change-mobile - Change own mobile number
    if (req.method === 'POST' && parts.join('/') === 'auth/change-mobile') {
      const user = requireUser(req, res);
      if (!user) return;
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const { newMobile } = JSON.parse(body);
        if (USERS.find(u => u.mobile === newMobile)) {
          res.writeHead(409);
          return res.end(JSON.stringify({ error: '该手机号已被使用' }));
        }
        user.mobile = newMobile;
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // POST /auth/users/reset-password - Admin reset member password
    if (req.method === 'POST' && parts.join('/') === 'auth/users/reset-password') {
      const admin = requireUser(req, res);
      if (!admin) return;
      if (admin.role !== 'admin') {
        res.writeHead(403);
        return res.end(JSON.stringify({ error: '仅管理员可重置密码' }));
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const { mobile, newPassword } = JSON.parse(body);
        const target = USERS.find(u => u.mobile === mobile);
        if (!target) return res.end(JSON.stringify({ error: '用户不存在' }));
        target.password = newPassword || '123456';
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // POST /chat/:projectId
    if (req.method === 'POST' && parts[0] === 'chat' && parts[1]) {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        const { message } = JSON.parse(body);
        const [project, tasks, members] = await Promise.all([
          gpApi('GET', '/api/projects/' + parts[1]).catch(() => ({})),
          gpApi('GET', '/api/projects/' + parts[1] + '/tasks').catch(() => []),
          gpApi('GET', '/api/projects/' + parts[1] + '/members').catch(() => []),
        ]);
        const ctx = '项目：' + (project.name || '未知') + '\n'
          + '状态：' + (project.status || '未知') + '\n'
          + '地点：' + (project.location || '未设置') + '\n'
          + '成员：' + (Array.isArray(members) ? members.map(m => m.user?.name || m.name || '').join('、') : '');
        const reply = await callDeepSeek([
          { role: 'system', content: SYSTEM_PROMPT + '\n\n当前项目上下文：\n' + ctx },
          { role: 'user', content: message },
        ]);
        res.end(JSON.stringify({ reply }));
      });
      return;
    }

    // POST /api/projects - Create project (auth required)
    if (req.method === 'POST' && parts.join('/') === 'api/projects') {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== 'admin') {
        res.writeHead(403);
        return res.end(JSON.stringify({ error: '仅管理员可创建项目' }));
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        const dto = JSON.parse(body);
        const result = await gpApi('POST', '/api/projects', { ...dto, createdById: user.id });
        res.end(JSON.stringify(result));
      });
      return;
    }

    // GET /api/projects
    if (req.method === 'GET' && parts.join('/') === 'api/projects') {
      const data = await gpApi('GET', '/api/projects');
      res.end(JSON.stringify(data));
      return;
    }

    // GET /projects
    if (req.method === 'GET' && parts[0] === 'projects' && parts.length === 1) {
      const data = await gpApi('GET', '/api/projects');
      res.end(JSON.stringify(data));
      return;
    }

    // GET /project/:id
    if (req.method === 'GET' && parts[0] === 'project' && parts[1]) {
      const data = await gpApi('GET', '/api/projects/' + parts[1]);
      res.end(JSON.stringify(data));
      return;
    }

    // === INTAKE (信息录入) ===

    // GET /intake/:projectId - Intake page (served from static file)
        if (req.method === "GET" && parts[0] === "intake" && parts[1] && parts.length === 2) {
          const pid = parts[1];
          const fs = require("fs");
          const project = await gpApi("GET", "/api/projects/" + pid).catch(() => ({}));
          let html = fs.readFileSync("/opt/golden-project/public/intake.html", "utf8");
          html = html.replace("{{PROJECT_NAME}}", project.name || "未命名项目");
          html = html.replace("{{PROJECT_ID}}", pid);
          html = html.replace("{{API_BASE}}", "/agent");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          return res.end(html);
        }

    if (req.method === 'POST' && parts[0] === 'intake' && parts[1] && parts[2] === 'analyze') {
      const pid = parts[1];
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { files } = JSON.parse(body);
          const project = await gpApi('GET', '/api/projects/' + pid).catch(() => ({}));
          const projectName = project.name || '未命名项目';

          // Parse uploaded files to extract text content
          const parseScript = '/opt/golden-project/parse_file.py';
          const fs = require('fs');
          let fileTexts = [];
          for (const f of files) {
            try {
              // Write base64 to temp then call parser
              const result = execSync('python3 ' + parseScript + ' ' + JSON.stringify(f.name), {
                input: f.content,
                timeout: 30000,
                maxBuffer: 10 * 1024 * 1024,
              }).toString().trim();
              fileTexts.push('文件: ' + f.name + '\n内容:\n' + result.slice(0, 8000));
            } catch(e) {
              fileTexts.push('文件: ' + f.name + '\n内容: [解析失败: ' + e.message.slice(0, 100) + ']');
            }
          }
          
          const userContent = '已知项目名称: ' + projectName + '\n\n上传文件内容:\n' + fileTexts.join('\n') + '\n\n请按分析规则提取JSON。';

          const DEEPSEEK_KEY = process.env.GP_AGENT_KEY || '';
          const reply = await new Promise((resolve, reject) => {
            try {
              const https = require('https');
              const rules = require('fs').readFileSync('/opt/golden-project/analysis_rules.md', 'utf8');
              const reqData = JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                  { role: 'system', content: rules },
                  { role: 'user', content: userContent }
                ],
                temperature: 0.1,
                max_tokens: 4000,
                response_format: { type: 'json_object' }
              });
              const r = https.request('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_KEY },
              }, (res) => {
                let d = '';
                res.on('data', c2 => d += c2);
                res.on('end', () => {
                  try {
                    const parsed = JSON.parse(d);
                    resolve(parsed.choices?.[0]?.message?.content || '');
                  } catch { resolve(''); }
                });
              });
              r.on('error', reject);
              r.write(reqData);
              r.end();
            } catch(e) { reject(e); }
          });

          let data;
          try {
            // Try to extract JSON from the reply
            var jsonMatch = reply.match(/\{[\s\S]*\}/);
            data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(reply);
          } catch(e) {
            return res.end(JSON.stringify({ error: 'AI 分析结果格式错误，请重试', raw: reply.slice(0,200) }));
          }

          // Store analysis result
          var storeKey = 'intake_' + pid;
          var store = JSON.parse(process.env[storeKey] || '{}');
          
          // Merge with existing data if any
          var existing = store || {};
          Object.keys(data).forEach(function(k) { existing[k] = data[k]; });
          
          // Store in memory (will be lost on restart, but that's OK for now)
          // TODO: persist to database
          process.env[storeKey] = JSON.stringify(existing);
          // Save uploaded files to project folder
          try {
            const fs = require("fs");
            const safeName = (projectName || "project").replace(/[\\\/:?"<>|]/g, "");
            const docsDir = "/opt/golden-project/项目列表/" + safeName + "/初始文档";
            if (!fs.existsSync(docsDir)) {
              fs.mkdirSync(docsDir, { recursive: true });
            }
            for (const f of files) {
              try {
                const fn = f.name.replace(/[\\\/:?"<>|]/g, "");
                const fp = docsDir + "/" + fn;
                if (!fs.existsSync(fp)) {
                  fs.writeFileSync(fp, Buffer.from(f.content, "base64"));
                }
              } catch(e) {}
            }
          } catch(e) { console.error("File save error:", e.message); }


          res.end(JSON.stringify({ ok: true, data: existing }));
        } catch(e) {
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // POST /intake/:projectId/data - Save edited intake data
    if (req.method === 'POST' && parts[0] === 'intake' && parts[1] && parts[2] === 'data') {
      const pid = parts[1];
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          var storeKey = 'intake_' + pid;
          process.env[storeKey] = JSON.stringify(data);
          res.end(JSON.stringify({ ok: true }));
        } catch(e) {
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // GET /intake/:projectId/data - Get saved intake data
    if (req.method === 'GET' && parts[0] === 'intake' && parts[1] && parts[2] === 'data') {
      var storeKey = 'intake_' + parts[1];
      var data = JSON.parse(process.env[storeKey] || 'null');
      res.end(JSON.stringify({ data }));
      return;
    }

    
    // POST /intake/:projectId/confirm - Confirm project
    if (req.method === 'POST' && parts[0] === 'intake' && parts[1] && parts[2] === 'confirm') {
      const pid = parts[1];
      let body = '';
      req.on('data', c2 => body += c2);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const existing = await gpApi('GET', '/api/projects/' + pid).catch(() => ({}));
          if (!existing || !existing.id) {
            return res.end(JSON.stringify({ error: '项目不存在: ' + pid }));
          }
          const projectId = existing.id;
          const projectCode = existing.code || pid;
                    // Save files to project folder
          try {
            const fs = require('fs');
            const dirName = (data.projectName || 'project').replace(/[\\/:*?"<>|]/g, '_');
            const projDir = '/opt/golden-project/项目列表/' + dirName;
            if (!fs.existsSync(projDir + '/初始文档')) {
              fs.mkdirSync(projDir + '/初始文档', { recursive: true });
              fs.mkdirSync(projDir + '/验收文档', { recursive: true });
            }
            fs.writeFileSync(projDir + '/analysis_result.json', JSON.stringify(data, null, 2));
            const oldMd = projDir + '/项目信息.md';
            if (fs.existsSync(oldMd)) fs.unlinkSync(oldMd);
            const oldXlsx = projDir + '/前期录入模板.xlsx';
            if (fs.existsSync(oldXlsx)) fs.unlinkSync(oldXlsx);
          } catch(e) { console.error('File save error:', e.message); }

          await gpApi("PATCH", "/api/projects/" + projectId, {
            name: data.projectName || existing.name,
            description: data.description || '',
            startDate: data.startDate || null,
            endDate: data.endDate || null,
          }).catch(() => {});
          if (data.tasks && data.tasks.length) {
            const oldTasks = await gpApi('GET', '/api/projects/' + projectId + '/tasks');
            if (oldTasks && Array.isArray(oldTasks)) {
              for (const t of oldTasks) {
                await gpApi('PATCH', '/api/projects/' + projectId + '/tasks/' + t.id, { title: '[已归档] ' + (t.title||'') }).catch(()=>{});
              }
            }
            const pMap = { '高': 'HIGH', '中': 'MEDIUM', '低': 'LOW' };
            for (const t of data.tasks) {
              await gpApi('POST', '/api/projects/' + projectId + '/tasks', {
                title: t.title || '任务',
                priority: pMap[t.priority] || 'MEDIUM',
                dueTime: t.deadline || null,
              }).catch(() => {});
            }
          }
          process.env['intake_' + pid] = JSON.stringify(data);
          res.end(JSON.stringify({ ok: true, projectId: projectId, projectCode: projectCode }));
        } catch(e) {
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }


// 404
    res.writeHead(404);
    res.end('Not Found');

  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

// Start
server.listen(PORT, '0.0.0.0', () => {
  console.log('GP Agent running on port ' + PORT);
});
