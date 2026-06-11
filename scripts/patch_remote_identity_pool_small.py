from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} not found")
    return text.replace(old, new, 1)


agent_path = Path("/opt/golden-project/gp-agent-server.js")
text = agent_path.read_text()

text = replace_once(
    text,
    "        const s = process.env['structure_' + code];\n        if (!s) { return res.end(JSON.stringify({ nodes: [] })); }\n        const data = JSON.parse(s);\n        const tree = data.tree || [];",
    """        const claimsKey = 'identity_pool_claims_' + code;\n        const claimState = process.env[claimsKey] ? JSON.parse(process.env[claimsKey]) : {};\n        const s = process.env['structure_' + code];\n        if (!s) {\n          const projects = await gpApi('GET', '/api/projects');\n          const project = Array.isArray(projects) ? projects.find(function(item) { return item.code === code || item.id === code; }) : null;\n          if (!project) { return res.end(JSON.stringify({ nodes: [] })); }\n          const dashboard = await gpApi('GET', '/api/projects/' + project.id + '/dashboard');\n          const modules = dashboard?.project?.modules || [];\n          const nodes = modules.map(function(mod) {\n            const claim = claimState['module_' + mod.id] || {};\n            return {\n              nodeId: 'module_' + mod.id,\n              name: mod.name,\n              parentName: '项目模块',\n              taskName: mod.description || '',\n              assignedMemberId: claim.memberId || '',\n              assignedMemberName: claim.memberName || '',\n            };\n          });\n          return res.end(JSON.stringify({ nodes: nodes, fallback: true, source: 'modules' }));\n        }\n        const data = JSON.parse(s);\n        const tree = data.tree || [];""",
    "GET fallback insertion",
)

text = replace_once(
    text,
    """          const s = process.env['structure_' + code];
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
          res.end(JSON.stringify({ ok: true, nodeId: nodeId, memberId: memberId, memberName: memberName }));""",
    """          const s = process.env['structure_' + code];
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
          res.end(JSON.stringify({ ok: true, nodeId: nodeId, memberId: memberId, memberName: memberName, source: 'modules' }));""",
    "claim fallback insertion",
)

text = replace_once(
    text,
    """          const { nodeId, memberId } = JSON.parse(body);
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
          res.end(JSON.stringify({ ok: true, nodeId: nodeId }));""",
    """          const { nodeId } = JSON.parse(body);
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
            return res.end(JSON.stringify({ ok: true, nodeId: nodeId }));
          }
          const claimsKey = 'identity_pool_claims_' + code;
          const claimState = process.env[claimsKey] ? JSON.parse(process.env[claimsKey]) : {};
          delete claimState[nodeId];
          process.env[claimsKey] = JSON.stringify(claimState);
          res.end(JSON.stringify({ ok: true, nodeId: nodeId, source: 'modules' }));""",
    "release fallback insertion",
)

text = replace_once(
    text,
    """          const s = process.env['structure_' + projectCode];
          if (s) {
            try {
              const data = JSON.parse(s);
              const node = (data.tree || []).find(function(n) { return n.id === nodeId; });
              if (node && node.data && node.data.assignedMemberId) {
                memberId = node.data.assignedMemberId;
              }
            } catch(e) {}
          }""",
    """          const s = process.env['structure_' + projectCode];
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
          }""",
    "my-tasks claimState fallback",
)

agent_path.write_text(text)

dashboard_path = Path("/opt/golden-project/public/dashboard.js")
dashboard_text = dashboard_path.read_text()
dashboard_text = replace_once(
    dashboard_text,
    "            setStoredIdentity(projectCode, '', '', value, user ? user.name || '' : '');",
    "            setStoredIdentity(projectCode, '', '', value, label);",
    "dashboard identity label fix",
)
dashboard_path.write_text(dashboard_text)

print("patched remote small")
