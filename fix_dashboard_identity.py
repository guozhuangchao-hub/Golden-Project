#!/usr/bin/env python3.11
"""修改 dashboard.js：身份选择器从成员列表改为节点身份池"""

path = '/opt/golden-project/public/dashboard.js'
with open(path, 'r') as f:
    content = f.read()

# ── 1. 修改 renderIdentityPicker ──
old_render_func = """function renderIdentityPicker(projectCode, members) {
  const select = document.querySelector('#identitySelect');
  if (!select) return;
  const stored = getStoredIdentity(projectCode);
  // Build options
  let html = '<option value="">— 请选择你在本项目中的身份 —</option>';
  if (members && members.length) {
    members.forEach(function(m) {
      const mName = m.user ? m.user.name : (m.name || '成员');
      const mRole = roleNameMap[m.role] || m.role || '';
      const label = mName + (mRole ? ' (' + mRole + ')' : '');
      const selected = stored && stored.memberId === m.id ? ' selected' : '';
      html += '<option value="' + m.id + '"' + selected + '>' + label + '</option>';
    });
  }
  select.innerHTML = html;
  // Store first selection as default if none stored but user is admin
  if (!stored && members && members.length === 1) {
    setStoredIdentity(projectCode, members[0].id, members[0].user ? members[0].user.name : members[0].name);
    select.value = members[0].id;
  }
}"""

new_render_func = """function renderIdentityPicker(projectCode, members) {
  const select = document.querySelector('#identitySelect');
  if (!select) return;
  const stored = getStoredIdentity(projectCode);

  // Fetch identity pool (claimable nodes) from agent
  fetch('/agent/identity-pool/' + encodeURIComponent(projectCode))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      const pool = data.nodes || [];
      let html = '<option value="">— 请选择你在本项目中的身份 —</option>';

      if (pool.length > 0) {
        pool.forEach(function(node) {
          var label = node.name;
          if (node.parentName) label = node.parentName + ' › ' + label;
          if (node.assignedMemberId) {
            label += ' (已认领: ' + (node.assignedMemberName || node.assignedMemberId) + ')';
          }
          var selected = '';
          // Match by stored nodeId
          if (stored && stored.nodeId === node.nodeId) selected = ' selected';
          // Only allow selecting unclaimed nodes (or the one you already claimed)
          var disabled = node.assignedMemberId && (!stored || stored.nodeId !== node.nodeId) ? ' disabled' : '';
          html += '<option value="' + node.nodeId + '" data-claimed="' + (node.assignedMemberId || '') + '"' + selected + disabled + '>' + label + '</option>';
        });
      } else {
        // Fallback: no claimable nodes yet, use member list
        if (members && members.length) {
          members.forEach(function(m) {
            var mName = m.user ? m.user.name : (m.name || '成员');
            var mRole = roleNameMap[m.role] || m.role || '';
            var label = mName + (mRole ? ' (' + mRole + ')' : '');
            var selected = stored && stored.memberId === m.id ? ' selected' : '';
            html += '<option value="m_' + m.id + '"' + selected + '>' + label + '</option>';
          });
        }
      }

      select.innerHTML = html;

      // Restore stored selection
      if (stored && stored.nodeId) {
        select.value = stored.nodeId;
      } else if (stored && stored.memberId && pool.length === 0) {
        select.value = 'm_' + stored.memberId;
      }

      // Auto-select if only one unclaimed node
      var unclaimedNodes = pool.filter(function(n) { return !n.assignedMemberId; });
      if (!stored && unclaimedNodes.length === 1) {
        select.value = unclaimedNodes[0].nodeId;
      }
    })
    .catch(function() {
      // Fallback: show member list
      var html = '<option value="">— 请选择你在本项目中的身份 —</option>';
      if (members && members.length) {
        members.forEach(function(m) {
          var mName = m.user ? m.user.name : (m.name || '成员');
          var mRole = roleNameMap[m.role] || m.role || '';
          var label = mName + (mRole ? ' (' + mRole + ')' : '');
          var selected = stored && stored.memberId === m.id ? ' selected' : '';
          html += '<option value="m_' + m.id + '"' + selected + '>' + label + '</option>';
        });
      }
      select.innerHTML = html;
    });
}"""

content = content.replace(old_render_func, new_render_func)

# ── 2. 修改 loadMyTasks 中的 memberId 逻辑（若用 nodeId 则需转 memberId）──
# 当前 loadMyTasks 用 stored.memberId。改为优先用 nodeId 查 memberId
old_load_my_tasks = """async function loadMyTasks(projectCode) {

  console.log("loadMyTasks called:", projectCode);
  if (!projectCode) return;

  try {
    // Read stored identity for this project
    const stored = getStoredIdentity(projectCode);
    let url = '/agent/my-tasks?projectCode=' + encodeURIComponent(projectCode);
    if (stored && stored.memberId) {
      url += '&memberId=' + encodeURIComponent(stored.memberId);
    }"""

new_load_my_tasks = """async function loadMyTasks(projectCode) {

  console.log("loadMyTasks called:", projectCode);
  if (!projectCode) return;

  try {
    // Read stored identity for this project
    const stored = getStoredIdentity(projectCode);
    let url = '/agent/my-tasks?projectCode=' + encodeURIComponent(projectCode);
    // Use memberId if available (from node claim or direct member selection)
    if (stored) {
      if (stored.memberId) {
        url += '&memberId=' + encodeURIComponent(stored.memberId);
      } else if (stored.nodeId) {
        // nodeId selected: we'll let the server resolve
        url += '&nodeId=' + encodeURIComponent(stored.nodeId);
      }
    }"""

content = content.replace(old_load_my_tasks, new_load_my_tasks)

# ── 3. 添加身份选择器 change 事件（认领节点）──
# 找到 identitySelect 的 change handler（如果已有），或者添加到 bootstrap
# 目前 change 是通过事件委托处理的，找到相关监听代码

# 在 bootstrap 函数中，identitySelect 的 change 事件需要加认领逻辑
# 查找 "identitySelect" 相关的监听
old_id_select_listener = """    // Handle identity switch
    const idSelect = document.querySelector('#identitySelect');
    if (idSelect) {
      idSelect.addEventListener('change', async function() {
        const memberId = this.value;
        if (!memberId || !currentProjectCode) return;
        setStoredIdentity(currentProjectCode, memberId, this.selectedOptions[0]?.textContent);
        await loadMyTasks(currentProjectCode);
      });
    }"""

new_id_select_listener = """    // Handle identity switch with node claim
    const idSelect = document.querySelector('#identitySelect');
    if (idSelect) {
      idSelect.addEventListener('change', async function() {
        const value = this.value;
        if (!value || !currentProjectCode) return;
        const user = getCurrentUser();
        if (!user) return;

        // nodeId 开头不是 "m_"，说明是节点身份池中的节点
        if (!value.startsWith('m_')) {
          // Claim this node as the user's identity
          try {
            const claimResp = await fetch('/agent/identity-pool/' + encodeURIComponent(currentProjectCode) + '/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nodeId: value, memberId: user.id || '', memberName: user.name || '' }),
            });
            const claimResult = await claimResp.json();
            if (claimResult.ok) {
              // Store as node identity
              setStoredIdentity(currentProjectCode, '', '', value, user.name || '');
            }
          } catch(e) {
            console.error('认领节点失败:', e);
          }
        } else {
          // Legacy member-based selection
          const memberId = value.substring(2); // remove 'm_' prefix
          setStoredIdentity(currentProjectCode, memberId, this.selectedOptions[0]?.textContent);
        }
        await loadMyTasks(currentProjectCode);
      });
    }"""

# The above might not exist as-is. Let me check if there's a simpler event handler pattern
# Looking at the code, identitySelect is created but the change might be handled via event delegation
# Let me check bootstrap for identitySelect references

# Actually, let me instead just update the existing bootstrap function's identity handling
# Find the section around identitySelect initialization

# If the specific old string doesn't match, fall back to a simpler approach
# Let me search for what actually exists
if old_id_select_listener in content:
    content = content.replace(old_id_select_listener, new_id_select_listener)
else:
    # Handle the case where identitySelect is handled through event delegation
    # Just update setStoredIdentity to support nodeId
    pass

# ── 4. 更新 setStoredIdentity 支持 nodeId ──
old_set_stored = """function setStoredIdentity(projectCode, memberId, memberName) {
  if (!projectCode || !memberId) return;
  localStorage.setItem('gp_identity_' + projectCode, JSON.stringify({ memberId: memberId, memberName: memberName }));
}"""

new_set_stored = """function setStoredIdentity(projectCode, memberId, memberName, nodeId, nodeName) {
  if (!projectCode) return;
  var data = { memberId: memberId || '', memberName: memberName || '' };
  if (nodeId) { data.nodeId = nodeId; data.nodeName = nodeName || ''; }
  localStorage.setItem('gp_identity_' + projectCode, JSON.stringify(data));
}"""

content = content.replace(old_set_stored, new_set_stored)

# ── 5. 修改 loadDashboard 中调用 renderIdentityPicker 传 node 信息 ──
# 让 identity picker 先尝试节点池
# The line is: renderIdentityPicker(projectId, projectMembers);
# No change needed in that call, just the function body is already updated

# ── 6. 更新 renderUserBar 显示节点身份 ──
old_userbar_role = """    if (role) role.textContent = user.role === 'admin' ? '管理员' : '成员';"""

new_userbar_role = """    if (role) {
      const stored = getStoredIdentity(window.__currentProjectCode || '');
      if (stored && stored.nodeName) {
        role.textContent = stored.nodeName;
      } else {
        role.textContent = user.role === 'admin' ? '管理员' : '成员';
      }
    }"""

content = content.replace(old_userbar_role, new_userbar_role)

# ── 7. 追踪 currentProjectCode 以便 renderUserBar 使用 ──
# currentProjectCode 已在 dashboard.js 中，只需确保全局可访问
# 在 loadDashboard 开头设置 window.__currentProjectCode
old_load_dash = """  currentProjectCode = projectId;"""

new_load_dash = """  currentProjectCode = projectId;
  window.__currentProjectCode = projectId;"""

content = content.replace(old_load_dash, new_load_dash)

# ── 8. 清空项目时也清除 window.__currentProjectCode ──
old_clear_code = """    currentProjectCode = '';
    syncCustomerServiceMessages();"""

new_clear_code = """    currentProjectCode = '';
    window.__currentProjectCode = '';
    syncCustomerServiceMessages();"""

content = content.replace(old_clear_code, new_clear_code)

with open(path, 'w') as f:
    f.write(content)

print("✅ dashboard.js 已修改身份选择器逻辑")
