const api = require('../../utils/api');

Page({
  data: {
    backendBaseUrl: '',
    memberId: '',
    projectCode: ''
  },

  onShow() {
    const settings = api.getSettings();
    this.setData(settings);
  },

  handleInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [field]: event.detail.value
    });
  },

  saveSettings() {
    api.saveSettings({
      backendBaseUrl: this.data.backendBaseUrl.trim(),
      memberId: this.data.memberId.trim(),
      projectCode: this.data.projectCode.trim()
    });
    wx.showToast({
      title: '已保存',
      icon: 'success'
    });
  },

  async testConnection() {
    try {
      this.saveSettings();
      const brief = await api.fetchProjectBrief();
      wx.showModal({
        title: '连接成功',
        content: `已连到项目：${brief.project.name}`,
        showCancel: false
      });
    } catch (error) {
      wx.showModal({
        title: '连接失败',
        content: error.message || '请检查后端地址和 memberId / projectCode',
        showCancel: false
      });
    }
  }
});
