const api = require('../../utils/api');
const { formatDateTime } = require('../../utils/format');

Page({
  data: {
    tasks: [],
    loading: false,
    error: ''
  },

  onShow() {
    this.loadTasks();
  },

  async loadTasks() {
    this.setData({ loading: true, error: '' });
    try {
      const tasks = await api.fetchMyTasks();
      this.setData({
        tasks: (tasks || []).map((task) => ({
          ...task,
          dueTimeLabel: formatDateTime(task.dueTime)
        }))
      });
    } catch (error) {
      this.setData({ error: error.message || '加载任务失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async handleConfirm(event) {
    const taskId = event.currentTarget.dataset.taskId;
    try {
      await api.confirmTask(taskId, '小程序确认接收任务');
      wx.showToast({ title: '已确认', icon: 'success' });
      this.loadTasks();
    } catch (error) {
      wx.showToast({ title: error.message || '确认失败', icon: 'none' });
    }
  },

  handleProgress(event) {
    const taskId = event.currentTarget.dataset.taskId;
    wx.showModal({
      title: '更新进度',
      editable: true,
      placeholderText: '例如：已和供应商确认，今晚 8 点前回传最终表',
      success: async (res) => {
        if (!res.confirm || !res.content) {
          return;
        }

        wx.showActionSheet({
          itemList: ['25%', '50%', '75%', '100%'],
          success: async (sheetRes) => {
            const percent = [25, 50, 75, 100][sheetRes.tapIndex];
            try {
              await api.updateProgress(taskId, res.content, percent);
              wx.showToast({ title: '已更新', icon: 'success' });
              this.loadTasks();
            } catch (error) {
              wx.showToast({ title: error.message || '更新失败', icon: 'none' });
            }
          }
        });
      }
    });
  },

  handleHelp(event) {
    const taskId = event.currentTarget.dataset.taskId;
    wx.showModal({
      title: '请求 AI 协助',
      editable: true,
      placeholderText: '例如：物料还没到场，我该先找谁、下一步怎么处理？',
      success: async (res) => {
        if (!res.confirm || !res.content) {
          return;
        }

        try {
          const result = await api.askHelp(taskId, res.content);
          wx.showModal({
            title: 'AI 建议',
            content: result && result.advice && result.advice.reply ? result.advice.reply : '暂无建议返回',
            showCancel: false
          });
          this.loadTasks();
        } catch (error) {
          wx.showToast({ title: error.message || '求助失败', icon: 'none' });
        }
      }
    });
  }
});
