const http = require('http');
const { execSync } = require('child_process');
const crypto = require('crypto');

const PORT = 3002;
const SECRET = process.env.WEBHOOK_SECRET || 'gp-deploy';
const APP_DIR = '/opt/golden-project';

function run(cmd) {
  console.log(`>>> ${cmd}`);
  const out = execSync(cmd, { cwd: APP_DIR, timeout: 120000 });
  return out.toString().trim();
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(405);
    return res.end('Method Not Allowed');
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // Verify signature
    const sig = req.headers['x-hub-signature-256'];
    if (sig) {
      const hmac = crypto.createHmac('sha256', SECRET);
      hmac.update(body);
      const expected = 'sha256=' + hmac.digest('hex');
      if (sig !== expected) {
        console.log('SIGNATURE MISMATCH');
        res.writeHead(403);
        return res.end('Forbidden');
      }
    }

    try {
      const event = JSON.parse(body);
      const branch = (event.ref || '').replace('refs/heads/', '');
      console.log(`Push to ${branch} by ${event.pusher?.name || 'unknown'}`);

      if (branch !== 'main') {
        res.writeHead(200);
        return res.end(`Ignored branch: ${branch}`);
      }

      const results = [];
      results.push(run('git pull origin main'));
      results.push(run('npm install'));
      results.push(run('npx prisma generate'));
      results.push(run('npm run build'));
      results.push(run('pm2 restart golden-project'));

      const msg = results.join('\n');
      console.log(`Deploy OK:\n${msg}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`Deploy OK\n${msg}`);
    } catch (e) {
      console.error('Deploy error:', e.message);
      res.writeHead(500);
      res.end(`Error: ${e.message}`);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook receiver listening on port ${PORT}`);
  console.log(`App dir: ${APP_DIR}`);
  console.log(`Secret: ${SECRET}`);
});
