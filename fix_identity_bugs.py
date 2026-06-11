#!/usr/bin/env python3.11
"""修复身份系统的 3 个 bug：auth token、nodeId 支持、change handler"""

path = '/opt/golden-project/public/dashboard.js'
with open(path, 'r') as f:
    content = f.read()

# ── Bug 1: loadMyTasks 加 Authorization header ──
old_fetch1 = """    const resp = await fetch(url);
    const data = await resp.json();
    const tasks = data.tasks || [];
    if (tasks.length === 0) {
      container.innerHTML = '<div class="empty">当前项目暂无分配给您的任务。</div>';
      return;
    }"""

new_fetch1 = """    const token = localStorage.getItem('gp_token');
    const resp = await fetch(url, {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {},
    });
    if (resp.status === 401) {
      container.innerHTML = '<div class="empty">请先<a href="/agent/">登录</a>后查看任务。</div>';
      return;
    }
    const data = await resp.json();
    const tasks = data.tasks || [];
    if (tasks.length === 0) {
      container.innerHTML = '<div class="empty">当前项目暂无分配给您的任务。</div>';
      return;
    }"""

if old_fetch1 in content:
    content = content.replace(old_fetch1, new_fetch1)
else:
    print("⚠️  Bug 1 pattern NOT FOUND, trying alt...")
    # Try broader match
    alt_old = "const resp = await fetch(url);"
    alt_new = """    const token = localStorage.getItem('gp_token');
    const resp = await fetch(url, {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {},
    });
    if (resp.status === 401) {
      container.innerHTML = '<div class="empty">请先<a href="/agent/">登录</a>后查看任务。</div>';
      return;
    }"""
    if alt_old in content:
        content = content.replace(alt_old, alt_new)
    else:
        print("⚠️  Neither pattern found for Bug 1")

# ── Bug 2: loadMyTasks 支持 nodeId 参数 ──
old_nodeid_check = """    // Read stored identity for this project
    const stored = getStoredIdentity(projectCode);
    let url = '/agent/my-tasks?projectCode=' + encodeURIComponent(projectCode);
    if (stored && stored.memberId) {
      url += '&memberId=' + encodeURIComponent(stored.memberId);
    }"""

new_nodeid_check = """    // Read stored identity for this project
    const stored = getStoredIdentity(projectCode);
    let url = '/agent/my-tasks?projectCode=' + encodeURIComponent(projectCode);
    if (stored) {
      if (stored.memberId) {
        url += '&memberId=' + encodeURIComponent(stored.memberId);
      } else if (stored.nodeId) {
        url += '&nodeId=' + encodeURIComponent(stored.nodeId);
      }
    }"""

content = content.replace(old_nodeid_check, new_nodeid_check)

# ── Bug 3: identity change handler 适配 nodeId ──
old_change_handler = """  // 项目中身份选择
  const identitySelect = document.querySelector('#identitySelect');
  if (identitySelect) {
    identitySelect.addEventListener('change', function() {
      const memberId = this.value;
      const projectCode = currentProjectCode;
      if (!memberId || !projectCode) {
        if (!memberId) {
          // Clear stored identity
          localStorage.removeItem('gp_identity_' + projectCode);
        }
        return;
      }
      const selectedOption = this.options[this.selectedIndex];
      const memberName = selectedOption.textContent || '成员';
      setStoredIdentity(projectCode, memberId, memberName);
      loadMyTasks(projectCode);
    });
  }"""

new_change_handler = """  // 项目中身份选择（节点池 or 成员列表）
  const identitySelect = document.querySelector('#identitySelect');
  if (identitySelect) {
    identitySelect.addEventListener('change', async function() {
      const value = this.value;
      const projectCode = currentProjectCode;
      if (!value || !projectCode) {
        if (!value) {
          localStorage.removeItem('gp_identity_' + projectCode);
          document.querySelector('#userBarRole').textContent = '';
        }
        return;
      }
      const selectedOption = this.options[this.selectedIndex];
      const label = selectedOption.textContent || '成员';
      const user = getCurrentUser();

      // nodeId 选项（不是 m_ 前缀）= 节点身份池
      if (!value.startsWith('m_')) {
        // Claim this node as the user's identity
        try {
          const claimResp = await fetch('/agent/identity-pool/' + encodeURIComponent(projectCode) + '/claim', {
            method: 'POST',
            headers: user ? { 'Authorization': 'Bearer ' + (localStorage.getItem('gp_token') || '') } : {},
            body: JSON.stringify({ nodeId: value, memberId: user ? user.id || '' : '', memberName: user ? user.name || '' : '' }),
          });
          const claimResult = await claimResp.json();
          if (claimResult.ok) {
            setStoredIdentity(projectCode, '', '', value, user ? user.name || '' : '');
            // Update user bar role
            const roleEl = document.querySelector('#userBarRole');
            if (roleEl) roleEl.textContent = label;
          }
        } catch(e) {
          console.error('认领节点失败:', e);
        }
      } else {
        // Legacy member-based selection
        const memberId = value.substring(2);
        setStoredIdentity(projectCode, memberId, label);
      }
      loadMyTasks(projectCode);
    });
  }"""

content = content.replace(old_change_handler, new_change_handler)

with open(path, 'w') as f:
    f.write(content)

print("✅ dashboard.js 3 个 bug 已修复")
