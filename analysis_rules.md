# Golden Project 文档分析规则 v1.0

## 核心约束
- **只输出 JSON，不要任何额外文字**（包括 markdown 代码块标记）
- 发现不了的信息用 null，不编造
- 日期统一用 YYYY-MM-DD 格式
- 必须包含 analysis 字段（项目结构理解和风险建议）
- 尽可能从文档中提取 risks（风险事项），数量不限

## JSON Schema
{
  "projectName": "项目名称",
  "shortName": "项目简称",
  "projectCode": "项目编码",
  "projectType": "项目类型（会议/展览/活动/其他）",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "description": "项目描述（200字内）",
  "organizer": "主办单位",
  "executor": "执行单位",
  "modules": [{"name":"模块名称","leader":"负责人","desc":"模块描述"}],
  "activities": [{"name":"活动名称","date":"YYYY-MM-DD","time":"开始-结束","venue":"场地","module":"所属模块","leader":"负责人","assistant":"协助人","status":"confirmed/pending"}],
  "contacts": [{"org":"单位","role":"职能","name":"联系人","mobile":"手机","feishuId":"飞书ID","matter":"对接事项","level":"核心/重要/一般"}],
  "vendors": [{"name":"供应商","service":"服务内容","contact":"联系人","phone":"电话","contractStatus":"已签约/洽谈中/意向阶段","manager":"对接负责人"}],
  "venues": [{"name":"场地名称","purpose":"用途","activity":"所属活动","org":"责任单位","leader":"负责人","phone":"联系方式","status":"已确认/待确认"}],
  "tasks": [{"title":"任务名称","module":"所属模块","owner":"负责人","deadline":"YYYY-MM-DD","priority":"高/中/低","status":"pending/in_progress/collaborating/completed/at_risk"}],
  "risks": [{"name":"风险名称","module":"影响模块","probability":"高/中/低","impact":"高/中/低","plan":"应对预案","owner":"负责人","deadline":"YYYY-MM-DD"}],
  "analysis": {"structure":"项目结构理解（描述核心依赖链和关键路径）","risks":["风险分析1","风险分析2"],"suggestions":["优化建议1","优化建议2"]}
}

## 提取规则
- projectName: 优先文档标题/文件名/首段
- dates: 跨天取首尾，年份不明取当年
- modules: 从议程提取每个环节
- contacts: 从参会名单取，不去重
- tasks priority: deadline<30天=高, <90天=中, 其余=低
- risks: 仔细阅读文档，识别所有风险事项，不要在 risks 和 analysis.risks 留空
- analysis.structure: 写一段项目结构理解，包括核心依赖链、关键路径
- 找不到的字段用 null，不编造

## 示例
{"projectName":"APEC工商领导人会议","shortName":"APEC2026","projectCode":"APEC-BLF-2026","projectType":"会议","startDate":"2026-11-14","endDate":"2026-11-16","description":"APEC框架下最重要的工商界活动","organizer":"中国国际贸易促进委员会","executor":"GP执行团队","modules":[{"name":"开幕式","leader":"张三","desc":"主旨演讲"},{"name":"数字经济论坛","leader":"李四","desc":"AI与数字贸易"}],"activities":[{"name":"开幕式","date":"2026-11-14","time":"09:00-12:00","venue":"主会场","module":"开幕式","leader":"张三","assistant":"王五","status":"confirmed"}],"contacts":[{"org":"贸促会","role":"秘书长","name":"张三","mobile":"13800138000","feishuId":"zhangsan","matter":"主办方对接","level":"核心"}],"vendors":[{"name":"盛典会展","service":"会场搭建","contact":"赵六","phone":"13900139000","contractStatus":"已签约","manager":"王五"}],"venues":[{"name":"主会场","purpose":"开幕式","activity":"开幕式","org":"贸促会","leader":"张三","phone":"13800138000","status":"已确认"}],"tasks":[{"title":"确认嘉宾","module":"开幕式","owner":"张三","deadline":"2026-10-01","priority":"高","status":"pending"}],"risks":[{"name":"嘉宾确认延迟","module":"开幕式","probability":"高","impact":"高","plan":"备选嘉宾名单","owner":"张三","deadline":"2026-10-01"}],"analysis":{"structure":"项目核心依赖链：嘉宾确认→议程→物料→搭建。嘉宾确认在关键路径上。","risks":["嘉宾确认延迟影响议程","供应商交付时间紧迫"],"suggestions":["提前锁定核心嘉宾","加速供应商合同签署"]}}
