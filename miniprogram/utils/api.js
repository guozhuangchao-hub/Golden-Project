const app = getApp();

function getBaseUrl() {
  return (app.globalData.backendBaseUrl || '').replace(/\/$/, '');
}

function request({ url, method = 'GET', data }) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return Promise.reject(new Error('缺少 backendBaseUrl 配置'));
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header: {
        'content-type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        const message = res.data && res.data.message
          ? res.data.message
          : `请求失败(${res.statusCode})`;
        reject(new Error(Array.isArray(message) ? message.join('，') : message));
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

function requireMemberId() {
  const memberId = app.globalData.memberId;
  if (!memberId) {
    throw new Error('请先在设置页填写 memberId');
  }
  return memberId;
}

function requireProjectCode() {
  const projectCode = app.globalData.projectCode;
  if (!projectCode) {
    throw new Error('请先在设置页填写 projectCode');
  }
  return projectCode;
}

module.exports = {
  getSettings() {
    return {
      backendBaseUrl: app.globalData.backendBaseUrl,
      memberId: app.globalData.memberId,
      projectCode: app.globalData.projectCode
    };
  },

  saveSettings(settings) {
    app.saveSettings(settings);
  },

  fetchMyTasks() {
    const memberId = requireMemberId();
    const projectCode = app.globalData.projectCode;
    const query = projectCode ? `?memberId=${encodeURIComponent(memberId)}&projectId=${encodeURIComponent(projectCode)}` : `?memberId=${encodeURIComponent(memberId)}`;
    return request({ url: `/mini/me/tasks${query}` });
  },

  fetchMyReminders() {
    const memberId = requireMemberId();
    const projectCode = app.globalData.projectCode;
    const query = projectCode ? `?memberId=${encodeURIComponent(memberId)}&projectId=${encodeURIComponent(projectCode)}` : `?memberId=${encodeURIComponent(memberId)}`;
    return request({ url: `/mini/me/reminders${query}` });
  },

  fetchProjectBrief() {
    const projectCode = requireProjectCode();
    const memberId = app.globalData.memberId;
    const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : '';
    return request({ url: `/mini/project/${encodeURIComponent(projectCode)}/brief${query}` });
  },

  fetchProjectContacts() {
    const projectCode = requireProjectCode();
    return request({ url: `/mini/project/${encodeURIComponent(projectCode)}/contacts` });
  },

  confirmTask(taskId, content) {
    const memberId = requireMemberId();
    return request({
      url: `/mini/tasks/${taskId}/confirm`,
      method: 'POST',
      data: { memberId, content }
    });
  },

  updateProgress(taskId, content, progressPercent) {
    const memberId = requireMemberId();
    return request({
      url: `/mini/tasks/${taskId}/progress`,
      method: 'POST',
      data: { memberId, content, progressPercent }
    });
  },

  askHelp(taskId, content) {
    const memberId = requireMemberId();
    return request({
      url: `/mini/tasks/${taskId}/help`,
      method: 'POST',
      data: { memberId, content, provider: 'codex' }
    });
  },

  readReminder(notificationId) {
    return request({
      url: `/mini/reminders/${notificationId}/read`,
      method: 'POST'
    });
  },

  fetchMemberBrief() {
    const memberId = requireMemberId();
    const projectCode = requireProjectCode();
    return request({
      url: `/integrations/agents/projects/${encodeURIComponent(projectCode)}/workflows/member-brief`,
      method: 'POST',
      data: { memberId, provider: 'codex' }
    });
  }
};
