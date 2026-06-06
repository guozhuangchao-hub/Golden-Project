# Mac 微信群任务收集 MVP

这个模块把 Mac 微信读取器和 Golden Project 后台解耦：读取器只要把群消息按固定 JSON 投递进来，后台会过滤关注群、去重、延迟整理，并把识别出的事项写入任务列表。

## 1. 配置项目关注的群

```bash
curl -X PATCH http://localhost:3000/api/integrations/wechat/projects/PROJECT_ID_OR_CODE/setting \
  -H 'Content-Type: application/json' \
  -d '{
    "enabled": true,
    "groupNames": ["活动志愿者1群", "物料协调群", "嘉宾接待群"],
    "digestIntervalMinutes": 10
  }'
```

`groupNames` 为空数组时表示接收所有导入的微信群消息。

## 2. 导入 Mac 微信读取到的消息

```bash
curl -X POST http://localhost:3000/api/integrations/wechat/projects/PROJECT_ID_OR_CODE/messages/import \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [
      {
        "externalMessageId": "wechat-20260605-001",
        "groupName": "物料协调群",
        "senderName": "李四",
        "content": "请确认横幅今天下午是否已送到现场",
        "receivedAt": "2026-06-05T14:20:00+08:00",
        "messageType": "text"
      }
    ]
  }'
```

后续接 `wx-cli` 或其他 Mac 微信读取工具时，只需要把读取结果转换成这个结构。

## 3. 手动触发一次整理

```bash
curl -X POST http://localhost:3000/api/integrations/wechat/projects/PROJECT_ID_OR_CODE/digest
```

服务启动后也会每分钟检查一次，到 `digestIntervalMinutes` 设置的时间后自动整理。

## 4. 查看结果

```bash
curl http://localhost:3000/api/integrations/wechat/projects/PROJECT_ID_OR_CODE/messages
curl http://localhost:3000/api/integrations/wechat/projects/PROJECT_ID_OR_CODE/digests
curl http://localhost:3000/api/projects/PROJECT_ID_OR_CODE/tasks
```

生成的任务标题格式为：

```text
群名 - 发送人 - 什么事
```

## 5. 安装并初始化 wx-cli

`wx-cli` 用来读取本机微信数据。项目地址：https://github.com/jackwener/wx-cli

本项目已经把 `@jackwener/wx-cli` 安装为本地 dev dependency，可直接使用：

```bash
./node_modules/.bin/wx --version
```

Mac 上首次初始化前，按 `wx-cli` 文档需要保持微信运行，并执行初始化。为了让缓存留在项目内，建议使用项目内 HOME：

```bash
mkdir -p .data/wx-cli-home
HOME="$PWD/.data/wx-cli-home" ./node_modules/.bin/wx init --force
HOME="$PWD/.data/wx-cli-home" ./node_modules/.bin/wx sessions --json
```

如果 `wx sessions` 能看到最近会话，就可以继续接入 Golden Project。

如果初始化提示无法读取微信进程，需要按 `wx-cli` 文档处理 macOS 权限/签名，并在本机 Terminal 中重新执行上面的初始化命令。

## 6. Mac 本地读取脚本

项目里提供了一个适配器脚本：[scripts/wechat_ingest_mac.js](/Users/xiaoguodelaoguo/Golden%20Project/scripts/wechat_ingest_mac.js)。

推荐先用 `wx history` 做单次测试：

```bash
npm run wechat:ingest -- \
  --project PROJECT_ID_OR_CODE \
  --wx-history \
  --wx-home .data/wx-cli-home \
  --groups "活动志愿者1群,物料协调群,嘉宾接待群" \
  --wx-limit 200 \
  --dry-run \
  --once
```

确认 dry-run 输出正常后，改用 `wx new-messages` 做增量轮询：

```bash
npm run wechat:ingest -- \
  --project PROJECT_ID_OR_CODE \
  --wx-new-messages \
  --wx-home .data/wx-cli-home \
  --groups "活动志愿者1群,物料协调群,嘉宾接待群" \
  --interval-seconds 60
```

如果你想只看某个群的历史消息，也可以：

```bash
npm run wechat:ingest -- \
  --project PROJECT_ID_OR_CODE \
  --wx-history \
  --wx-home .data/wx-cli-home \
  --groups "物料协调群" \
  --wx-limit 200 \
  --once
```

脚本会自动做消息 ID 去重，状态文件默认写到 `.data/wechat-ingest-state.json`。`wx-cli` 的 `history` / `new-messages` JSON wrapper 会被自动展开。

也保留了读取 JSON / JSONL 文件的方式，方便调试或接其他数据源：

```bash
npm run wechat:ingest -- \
  --project PROJECT_ID_OR_CODE \
  --file .data/wechat/messages.jsonl \
  --groups "物料协调群" \
  --once
```

只测试字段解析、不推送后台：

```bash
npm run wechat:ingest -- \
  --project PROJECT_ID_OR_CODE \
  --wx-history \
  --wx-home .data/wx-cli-home \
  --groups "物料协调群" \
  --dry-run \
  --once
```
