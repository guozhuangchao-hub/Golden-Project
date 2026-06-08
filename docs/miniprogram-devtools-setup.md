# 微信小程序开发者工具接入

当前仓库已新增一个可直接导入微信开发者工具的小程序目录：

- `miniprogram/`

## 目录说明

- `pages/home`：项目总览、我的 AI 简报、联系人
- `pages/tasks`：我的任务、确认接收、更新进度、AI 求助
- `pages/reminders`：我的提醒、标记已读
- `pages/settings`：本地后端地址、`memberId`、`projectCode` 配置

## 开发者工具导入

1. 打开微信开发者工具
2. 选择“导入项目”
3. 项目目录指向：`/Users/xiaoguodelaoguo/Golden Project/miniprogram`
4. `AppID` 可先使用游客模式；仓库里的 `project.config.json` 已设置 `touristappid`

## 本地调试配置

默认后端地址：

```text
http://127.0.0.1:3000/api
```

如果你的后端端口不是 `3000`，请在设置页改成实际地址。

还需要填写：

- `memberId`：项目成员 ID
- `projectCode`：项目 code 或项目 id

## 当前已接通的接口

- `GET /api/mini/me/tasks`
- `GET /api/mini/me/reminders`
- `GET /api/mini/project/:projectCode/brief`
- `GET /api/mini/project/:projectCode/contacts`
- `POST /api/mini/tasks/:taskId/confirm`
- `POST /api/mini/tasks/:taskId/progress`
- `POST /api/mini/tasks/:taskId/help`
- `POST /api/mini/reminders/:notificationId/read`
- `POST /api/integrations/agents/projects/:projectId/workflows/member-brief`

## 建议

如果你已经在微信开发者工具里开了一个名为“微信小程序”的项目，最稳妥的做法是：

1. 把它的项目目录切到这个仓库下的 `miniprogram/`
2. 或者把这里新增的文件同步过去

这样它就能直接吃我们当前后端已经实现好的接口，不需要再手动拼页面。
