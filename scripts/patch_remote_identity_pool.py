from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} not found")
    return text.replace(old, new, 1)


agent_path = Path("/opt/golden-project/gp-agent-server.js")
agent_text = agent_path.read_text()

agent_text = replace_once(
    agent_text,
    """    // GET /identity-pool/:code - 获取可认领节点列表
    if (req.method === 'GET' && parts[0] === 'identity-pool' && parts[1]) {
      const code = parts[1];
      try {
        const s = process.env['structure_' + code];
        if (!s) { return res.end(JSON.stringify({ nodes: [] })); }
        const data = JSON.parse(s);
        const tree = data.tree || [];
        const claimableNodes = [];
        const explicitClaimableLeafNodes = [];
        const fallbackLeafNodes = [];
        function walk(nodes) {
          for (const n of nodes) {
            const children = tree.filter(function(c) { return c.parentId === n.id; });
            const isLeaf = children.length === 0;
            const isRoot = n.parentId === null;
            if (isLeaf && !isRoot) {
              const normalized = {
                nodeId: n.id,
                name: n.name,
                parentName: (function() {
                  const p = tree.find(function(x) { return x.id === n.parentId; });
                  return p ? p.name : '';
                })(),
                taskName: n.data?.taskName || '',
                assignedMemberId: n.data?.assignedMemberId || '',
                assignedMemberName: n.data?.assignedMemberName || '',
              };
              fallbackLeafNodes.push(normalized);
              if (n.data && n.data.claimable) {
                explicitClaimableLeafNodes.push(normalized);
              }
            }
            if (children.length > 0) walk(children);
          }
        }
        const roots = tree.filter(function(n) { return n.parentId === null; });
        walk(roots);
        const resultNodes = explicitClaimableLeafNodes.length ? explicitClaimableLeafNodes : fallbackLeafNodes;
        res.end(JSON.stringify({ nodes: resultNodes, fallback: explicitClaimableLeafNodes.length === 0 }));
      } catch(e) {
        res.end(JSON.stringify({ nodes: [], error: e.message }));
      }
      return;
    }""",
    """    // GET /identity-pool/:code - 获取可认领节点列表
    if (req.method === 'GET' && parts[0] === 'identity-pool' && parts[1]) {
      const code = parts[1];
      try {
        const claimsKey = 'identity_pool_claims_' + code;
        const claimState = process.env[claimsKey] ? JSON.parse(process.env[claimsKey]) : {};
        const s = process.env['structure_' + code];
        if (s) {
          const data = JSON.parse(s);
          const tree = data.tree || [];
          const explicitClaimableLeafNodes = [];
          const fallbackLeafNodes = [];
          function walk(nodes) {
            for (const n of nodes) {
              const children = tree.filter(function(c) { return c.parentId === n.id; });
              const isLeaf = children.length === 0;
              const isRoot = n.parentId === null;
              if (isLeaf && !isRoot) {
                const normalized = {
                  nodeId: n.id,
                  name: n.name,
                  parentName: (function() {
                    const p = tree.find(function(x) { return x.id === n.parentId; });
                    return p ? p.name : '';
                  })(),
                  taskName: n.data?.taskName || '',
                  assignedMemberId: n.data?.assignedMemberId || '',
                  assignedMemberName: n.data?.assignedMemberName || '',
                };
                fallbackLeafNodes.push(normalized);
                if (n.data && n.data.claimable) {
                  explicitClaimableLeafNodes.push(normalized);
                }
              }
              if (children.length > 0) walk(children);
            }
          }
          const roots = tree.filter(function(n) { return n.parentId === null; });
          walk(roots);
          const resultNodes = explicitClaimableLeafNodes.length ? explicitClaimableLeafNodes : fallbackLeafNodes;
          return res.end(JSON.stringify({ nodes: resultNodes, fallback: explicitClaimableLeafNodes.length === 0 }));
        }

        const projects = await gpApi('GET', '/api/projects');
        const project = Array.isArray(projects) ? projects.find(function(item) { return item.code === code || item.id === code; }) : null;
        if (!project) {
          return res.end(JSON.stringify({ nodes: [] }));
        }
        const dashboard = await gpApi('GET', '/api/projects/' + project.id + '/dashboard');
        const modules = dashboard?.project?.modules || [];
        const nodes = modules.map(function(mod) {
          const claim = claimState['module_' + mod.id] || {};
          return {
            nodeId: 'module_' + mod.id,
            name: mod.name,
            parentName: '项目模块',
            taskName: mod.description || '',
            assignedMemberId: claim.memberId || '',
            assignedMemberName: claim.memberName || '',
          };
        });
        return res.end(JSON.stringify({ nodes: nodes, fallback: true, source: 'modules' }));
      } catch(e) {
        res.end(JSON.stringify({ nodes: [], error: e.message }));
      }
      return;
    }""",
    "GET identity-pool block",
)

agent_text = replace_once(
    agent_text,
    """        // Resolve nodeId to memberId from structure data
        if (!memberId && nodeId) {
          const s = process.env['structure_' + projectCode];
          if (s) {
            try {
              const data = JSON.parse(s);
              const node = (data.tree || []).find(function(n) { return n.id === nodeId; });
              if (node && node.data && node.data.assignedMemberId) {
                memberId = node.data.assignedMemberId;
              }
            } catch(e) {}
          }
        }""",
    """        // Resolve nodeId to memberId from structure data or fallback claim storage
        if (!memberId && nodeId) {
          const s = process.env['structure_' + projectCode];
          if (s) {
            try {
              const data = JSON.parse(s);
              const node = (data.tree || []).find(function(n) { return n.id === nodeId; });
              if (node && node.data && node.data.assignedMemberId) {
                memberId = node.data.assignedMemberId;
              }
            } catch(e) {}
          }
          if (!memberId) {
            try {
              const claimState = process.env['identity_pool_claims_' + projectCode] ? JSON.parse(process.env['identity_pool_claims_' + projectCode]) : {};
              if (claimState[nodeId] && claimState[nodeId].memberId) {
                memberId = claimState[nodeId].memberId;
              }
            } catch(e) {}
          }
        }""",
    "my-tasks member resolution block",
)

agent_text = replace_once(
    agent_text,
    """    // POST /identity-pool/:code/claim - 成员认领节点
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
    }""",
    """    // POST /identity-pool/:code/claim - 成员认领节点
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
          if (s) {
            const data = JSON.parse(s);
            const tree = data.tree || [];
            const node = tree.find(function(n) { return n.id === nodeId; });
            if (!node) {
              res.writeHead(404);
              return res.end(JSON.stringify({ error: '节点不存在' }));
            }
            if (!node.data) node.data = {};
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
            return res.end(JSON.stringify({ ok: true, nodeId: nodeId, memberId: memberId, memberName: memberName }));
          }

          const claimsKey = 'identity_pool_claims_' + code;
          const claimState = process.env[claimsKey] ? JSON.parse(process.env[claimsKey]) : {};
          Object.keys(claimState).forEach(function(key) {
            if (claimState[key] && claimState[key].memberId === memberId && key !== nodeId) {
              delete claimState[key];
            }
          });
          claimState[nodeId] = { memberId: memberId, memberName: memberName || '' };
          process.env[claimsKey] = JSON.stringify(claimState);
          return res.end(JSON.stringify({ ok: true, nodeId: nodeId, memberId: memberId, memberName: memberName, source: 'modules' }));
        } catch(e) {
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }""",
    "claim block",
)

agent_text = replace_once(
    agent_text,
    """    // POST /identity-pool/:code/release - 成员释放节点身份
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
          res.end(JSON.stringify({ ok: true }));
        } catch(e) {
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }""",
    """    // POST /identity-pool/:code/release - 成员释放节点身份
    if (req.method === 'POST' && parts[0] === 'identity-pool' && parts[2] === 'release') {
      const code = parts[1];
      let body = '';
      req.on('data', function(c) { body += c; });
      req.on('end', function() {
        try {
          const { nodeId } = JSON.parse(body);
          const s = process.env['structure_' + code];
          if (s) {
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
            return res.end(JSON.stringify({ ok: true }));
          }

          const claimsKey = 'identity_pool_claims_' + code;
          const claimState = process.env[claimsKey] ? JSON.parse(process.env[claimsKey]) : {};
          delete claimState[nodeId];
          process.env[claimsKey] = JSON.stringify(claimState);
          return res.end(JSON.stringify({ ok: true, source: 'modules' }));
        } catch(e) {
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }""",
    "release block",
)

agent_path.write_text(agent_text)

dashboard_path = Path("/opt/golden-project/public/dashboard.js")
dashboard_text = dashboard_path.read_text()
dashboard_text = replace_once(
    dashboard_text,
    "            setStoredIdentity(projectCode, '', '', value, user ? user.name || '' : '');",
    "            setStoredIdentity(projectCode, '', '', value, label);",
    "dashboard setStoredIdentity block",
)
dashboard_path.write_text(dashboard_text)

print("patched remote files")
