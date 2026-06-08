const api = require('../../utils/api');
const { formatDateTime } = require('../../utils/format');

Page({
  data: {
    reminders: [],
    error: '',
    loading: false
  },

  onShow() {
    this.loadReminders();
  },

  async loadReminders() {
    this.setData({ loading: true, error: '' });
    try {
      const reminders = await api.fetchMyReminders();
      this.setData({
        reminders: (reminders || []).map((item) => ({
          ...item,
          createdAtLabel: formatDateTime(item.createdAt)
        }))
      });
    } catch (error) {
      this.setData({ error: error.message || '加载提醒失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async handleRead(event) {
    const notificationId = event.currentTarget.dataset.notificationId;
    try {
      await api.readReminder(notificationId);
      wx.showToast({ title: '已标记', icon: 'success' });
      this.loadReminders();
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    }
  }
});
