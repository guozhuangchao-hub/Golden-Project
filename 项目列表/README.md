# 项目列表说明

这个目录用于存放 Golden Project 的所有项目资料。

约定方式：

- 每个独立项目一个文件夹
- 文件夹命名建议：`年份+月份+项目简称`
- 每个项目文件夹至少保留一份 `项目信息.md`
- 如果有原始 Excel / Word / PDF，也放在对应项目文件夹内

推荐结构：

1. `项目信息.md`
2. `project.meta.json`
3. `前期录入模板.xlsx`
4. `前期录入模板.md`
5. `联系人清单.md`
6. `供应商清单.md`
7. `每日执行计划.md`
8. `风险事项.md`
9. 原始资料文件

模板目录：

- [项目模板](</Users/xiaoguodelaoguo/Golden Project/项目列表/项目模板>)

后续新增项目时，建议直接复制 `项目模板` 文件夹，再改名填写。

同步入库：

- 当前项目目录支持通过 `project.meta.json` 自动同步到 PostgreSQL `projects` 表
- 如果项目文件夹里只有 `前期录入模板.xlsx` 或其他 Excel 录入表，`npm run sync:projects` 会先自动把 Excel 转成 `project.meta.json`，再同步入库
- dashboard 的「新增项目」接口会先创建项目文件夹、复制 `前期录入模板.xlsx`，并写入初始 `project.meta.json`
- 新项目生成的 `projectCode` 规则为 `项目名称大写缩写 + 创建日期 + YHGG`
- 新项目生成的 Excel 文件名统一按 `项目名称-创建日期.xlsx` 命名
- `recommendedModules` 会自动同步到 PostgreSQL `project_modules` 表
- 如需补充模块描述和时间，可在 `project.meta.json` 中增加 `moduleDetails`
- 执行命令：`npm run sync:projects`
- 当前同步范围仅包含项目基础信息，不会自动导入任务、成员、通知

标准录入模板：

- 新项目建议先复制 `项目模板/前期录入模板.xlsx`
- 如果项目经理习惯表格录入，优先填写该模板，再由 agent 转成 `project.meta.json`
- `project.meta.json` 用于系统同步，`前期录入模板.xlsx` 用于项目经理前期采集
- Markdown 版 `前期录入模板.md` 仅作为文字参考
- 通用 agent 接入口说明见 [docs/agent-integration.md](</Users/xiaoguodelaoguo/Golden Project/docs/agent-integration.md>)
