#!/usr/bin/env python3.11
"""修改 gp-agent-server.js /my-tasks 接口支持 nodeId 参数"""

path = '/opt/golden-project/gp-agent-server.js'
with open(path, 'r') as f:
    content = f.read()

# 修改 my-tasks 处理逻辑：增加 nodeId 支持
old_my_tasks = """    // GET /my-tasks?projectCode=xxx&memberId=xxx - Get current user's tasks
    if (req.method === 'GET' && parts[0] === 'my-tasks') {
      const user = requireUser(req, res);
      if (!user) return;
      const projectCode = url.searchParams.get('projectCode');
      let memberId = url.searchParams.get('memberId');
      if (!projectCode) { res.end(JSON.stringify({ tasks: [] })); return; }
      try {
        // If memberId not provided, try to match by mobile
        if (!memberId) {
          const members = await gpApi('GET', '/api/projects/' + encodeURIComponent(projectCode) + '/members');
          const member = Array.isArray(members) ? members.find(m => m.user?.mobile === user.mobile) : null;
          if (!member) { res.end(JSON.stringify({ tasks: [] })); return; }
          memberId = member.id;
        }
        const tasks = await gpApi('GET', '/api/mini/me/tasks?memberId=' + encodeURIComponent(memberId));
        res.end(JSON.stringify({ tasks: Array.isArray(tasks) ? tasks : [] }));
      } catch(e) {
        res.end(JSON.stringify({ tasks: [], error: e.message }));
      }
      return;
    }"""

new_my_tasks = """    // GET /my-tasks?projectCode=xxx&memberId=xxx&nodeId=xxx - Get current user's tasks
    if (req.method === 'GET' && parts[0] === 'my-tasks') {
      const user = requireUser(req, res);
      if (!user) return;
      const projectCode = url.searchParams.get('projectCode');
      let memberId = url.searchParams.get('memberId');
      const nodeId = url.searchParams.get('nodeId');
      if (!projectCode) { res.end(JSON.stringify({ tasks: [] })); return; }
      try {
        // Resolve nodeId to memberId from structure data
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
        }
        // If still no memberId, try to match by mobile
        if (!memberId) {
          const members = await gpApi('GET', '/api/projects/' + encodeURIComponent(projectCode) + '/members');
          const member = Array.isArray(members) ? members.find(function(m) { return m.user?.mobile === user.mobile; }) : null;
          if (!member) { res.end(JSON.stringify({ tasks: [] })); return; }
          memberId = member.id;
        }
        // Fetch tasks for this member
        const tasks = await gpApi('GET', '/api/mini/me/tasks?memberId=' + encodeURIComponent(memberId));
        let result = Array.isArray(tasks) ? tasks : [];
        // If nodeId specified, also filter tasks by node/module name
        if (nodeId) {
          const s = process.env['structure_' + projectCode];
          if (s) {
            try {
              const data = JSON.parse(s);
              const node = (data.tree || []).find(function(n) { return n.id === nodeId; });
              if (node) {
                const nodeName = node.name;
                result = result.filter(function(t) {
                  return t.moduleName === nodeName || t.module?.name === nodeName || !nodeName;
                });
              }
            } catch(e) {}
          }
        }
        res.end(JSON.stringify({ tasks: result }));
      } catch(e) {
        res.end(JSON.stringify({ tasks: [], error: e.message }));
      }
      return;
    }"""

content = content.replace(old_my_tasks, new_my_tasks)

with open(path, 'w') as f:
    f.write(content)

print("✅ gp-agent-server.js /my-tasks 已支持 nodeId")
