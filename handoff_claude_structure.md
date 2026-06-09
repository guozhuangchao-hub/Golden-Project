# Claude Code 任务：Structure Mode React Flow 重构

优化：
- 读取需求文档深入了解，只讲述任务包含需求文档内的内容

## 需求文档
/Users/xiaoguodelaoguo/# GP Structure Mode 重构方案（React Flow 版本）.md

## 核心目标
把当前静态结构树改为 React Flow 可编辑画布。

## 具体工作

### 1. 修改 structure.html
- 用 CDN 引入 React Flow (`reactflow` 库)
- 保留顶部区域（项目标题、项目切换、加载按钮）
- 中部改为「结构内容编辑区」（模块卡片列表）
- 下部改为 React Flow 画布
- 保持 GP 风格（米白背景、圆角卡片、深灰文字）

### 2. 修改 structure.js
- `fetchDashboard(projectCode)` 不变
- `renderStructure(data)` 改为生成 Node Graph 数据
- 编辑区模块卡片：显示名称/说明/负责人/进度/任务数
- 编辑区支持：编辑模块、新增模块、删除模块
- React Flow 画布：自动布局，节点样式匹配 GP 风格
- 编辑区 ↔ 画布双向同步（同⼀份 nodes 状态）

### 3. Node 数据结构
```
{
  id, projectId, parentId,
  type: "root" | "module" | "submodule",
  title, description, leader,
  progress, taskCount,
  position: {x, y},
  createdBy: "ai" | "manual"
}
```

### 4. 保存逻辑
- 页面右上角加「保存结构」按钮
- 保存时 POST /agent/structure/{projectCode}（后端 API 由小爱加）
- 页面加载时 GET /agent/structure/{projectCode} 恢复上次结构

### 5. React Flow 配置
- 无限画布、拖拽、缩放、网格背景
- 自定义节点（不⽤默认蓝白）
- 节点样式：暖色风（#f4efe5 背景，#bf5a36 强调，#af8d33 金色）

## 不做
- 拖线生成节点
- 右键菜单
- 小地图
- 多选
- 自动布局算法
- 复杂工具栏

## 约束
- 纯前端（CDN 引入），不涉及 npm
- structure.html 和 structure.js 两个文件
- 最终文件保存在 /Users/xiaoguodelaoguo/Golden\ Project/public/
- 完成后再执行一次保存，确保文件最新
