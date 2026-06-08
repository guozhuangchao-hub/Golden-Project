App({
  globalData: {
    backendBaseUrl: '',
    memberId: '',
    projectCode: ''
  },

  onLaunch() {
    this.globalData.backendBaseUrl = wx.getStorageSync('backendBaseUrl') || 'http://127.0.0.1:3000/api';
    this.globalData.memberId = wx.getStorageSync('memberId') || '';
    this.globalData.projectCode = wx.getStorageSync('projectCode') || '';
  },

  saveSettings(settings) {
    if (settings.backendBaseUrl !== undefined) {
      this.globalData.backendBaseUrl = settings.backendBaseUrl;
      wx.setStorageSync('backendBaseUrl', settings.backendBaseUrl);
    }
    if (settings.memberId !== undefined) {
      this.globalData.memberId = settings.memberId;
      wx.setStorageSync('memberId', settings.memberId);
    }
    if (settings.projectCode !== undefined) {
      this.globalData.projectCode = settings.projectCode;
      wx.setStorageSync('projectCode', settings.projectCode);
    }
  }
});
