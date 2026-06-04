# Golden Project

AI 会务办公系统 MVP。

当前已初始化内容：

- `prisma/schema.prisma`
- `prisma/migrations/0001_init/migration.sql`
- `docs/backend-mvp-design.md`
- `src/` 下的 NestJS 最小骨架
- `dashboard` 模块骨架，用于活动指挥台首页聚合
- `public/dashboard.html` 活动指挥台原型页面，可通过 `/console/dashboard` 打开

下一步建议：

1. 安装依赖并生成 Prisma Client
2. 配置 `.env`
3. 运行 `prisma migrate dev`
4. 补充鉴权、项目成员校验、通知发送器、AI 报表生成器
