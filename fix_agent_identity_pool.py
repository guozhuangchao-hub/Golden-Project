#!/usr/bin/env python3.11
"""在 gp-agent-server.js 中添加身份池接口"""

path = '/opt/golden-project/gp-agent-server.js'
with open(path, 'r') as f:
    content = f.read()

# 在 "// 404" 之前插入新路由
old_marker = """// 404
    res.writeHead(404);
    res.end('Not Found');"""

new_routes = """// ─── 身份池接口 ───

    // GET /identity-pool/:code - 获取可认领节点列表
    if (req.method === 'GET' && parts[0] === 'identity-pool' && parts[1]) {
      const code = parts[1];
      try {
        const s = process.env['structure_' + code];
        if (!s) { return res.end(JSON.stringify({ nodes: [] })); }
        const data = JSON.parse(s);
        const tree = data.tree || [];
        const claimableNodes = [];
        function walk(nodes) {
          for (const n of nodes) {
            const children = tree.filter(function(c) { return c.parentId === n.id; });
            // Only leaf nodes can be claimed
            if (children.length === 0 && n.data && n.data.claimable) {
              claimableNodes.push({
                nodeId: n.id,
                name: n.name,
                parentName: (function() {
                  const p = tree.find(function(x) { return x.id === n.parentId; });
                  return p ? p.name : '';
                })(),
                taskName: n.data.taskName || '',
                assignedMemberId: n.data.assignedMemberId || '',
                assignedMemberName: n.data.assignedMemberName || '',
              });
            }
            if (children.length > 0) walk(children);
          }
        }
        const roots = tree.filter(function(n) { return n.parentId === null; });
        walk(roots);
        res.end(JSON.stringify({ nodes: claimableNodes }));
      } catch(e) {
        res.end(JSON.stringify({ nodes: [], error: e.message }));
      }
      return;
    }

    // POST /identity-pool/:code/claim - 成员认领节点
    if (req.method === 'POST' && parts[0] === 'identity-pool' && parts[2] === 'claim') {
      const code = parts[1];
      let body = '';
      req.on('data', function(c) { body += c; });
      req.on('end', function() {
        try {
          const { nodeId, memberId, memberName } = JSON.parse(body);
          if (!nodeId || !memberId) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: '缺少 nodeId 或 memberId' }));
          }
          const s = process.env['structure_' + code];
          if (!s) {
            res.writeHead(404);
            return res.end(JSON.stringify({ error: '项目结构不存在' }));
          }
          const data = JSON.parse(s);
          const tree = data.tree || [];
          const node = tree.find(function(n) { return n.id === nodeId; });
          if (!node) {
            res.writeHead(404);
            return res.end(JSON.stringify({ error: '节点不存在' }));
          }
          if (!node.data) node.data = {};
          // Release previous assignment if any
          for (const n of tree) {
            if (n.data && n.data.assignedMemberId === memberId && n.id !== nodeId) {
              n.data.assignedMemberId = '';
              n.data.assignedMemberName = '';
            }
          }
          node.data.assignedMemberId = memberId;
          node.data.assignedMemberName = memberName || '';
          data.updatedAt = new Date().toISOString();
          process.env['structure_' + code] = JSON.stringify(data);
          res.end(JSON.stringify({ ok: true, nodeId: nodeId, memberId: memberId, memberName: memberName }));
        } catch(e) {
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // POST /identity-pool/:code/release - 成员释放节点身份
    if (req.method === 'POST' && parts[0] === 'identity-pool' && parts[2] === 'release') {
      const code = parts[1];
      let body = '';
      req.on('data', function(c) { body += c; });
      req.on('end', function() {
        try {
          const { nodeId, memberId } = JSON.parse(body);
          const s = process.env['structure_' + code];
          if (!s) { return res.end(JSON.stringify({ error: '项目结构不存在' })); }
          const data = JSON.parse(s);
          const tree = data.tree || [];
          const node = tree.find(function(n) { return n.id === nodeId; });
          if (!node) { return res.end(JSON.stringify({ error: '节点不存在' })); }
          if (node.data) {
            node.data.assignedMemberId = '';
            node.data.assignedMemberName = '';
          }
          data.updatedAt = new Date().toISOString();
          process.env['structure_' + code] = JSON.stringify(data);
          res.end(JSON.stringify({ ok: true, nodeId: nodeId }));
        } catch(e) {
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

// 404
    res.writeHead(404);
    res.end('Not Found');"""

content = content.replace(old_marker, new_routes)

with open(path, 'w') as f:
    f.write(content)

print("✅ gp-agent-server.js 已添加身份池接口")
