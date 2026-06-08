const api = require('../../utils/api');

Page({
  data: {
    loading: false,
    brief: null,
    memberBrief: '',
    error: ''
  },

  onShow() {
    this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, error: '' });
    try {
      const [brief, memberBrief] = await Promise.all([
        api.fetchProjectBrief(),
        api.fetchMemberBrief()
      ]);
      this.setData({
        brief,
        memberBrief: memberBrief.reply || ''
      });
    } catch (error) {
      this.setData({ error: error.message || '加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goTasks() {
    wx.switchTab({ url: '/pages/tasks/tasks' });
  },

  goReminders() {
    wx.switchTab({ url: '/pages/reminders/reminders' });
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' });
  }
});
