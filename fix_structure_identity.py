#!/usr/bin/env python3.11
"""修复结构页面：节点支持可认领、任务人员改为只读、从身份池关联"""

import sys

path = '/opt/golden-project/public/structure.js'
with open(path, 'r') as f:
    content = f.read()

# ── 1. 更新数据模型注释 ──
content = content.replace(
    " *   data: { taskName, taskTime, taskPerson }",
    " *   data: { taskName, taskTime, taskPerson, claimable, assignedMemberId, assignedMemberName }"
)

# ── 2. 更新 initEmptyTree 节点初始化 ──
content = content.replace(
    "      data: { taskName: '', taskTime: '', taskPerson: '' },",
    "      data: { taskName: '', taskTime: '', taskPerson: '', claimable: false, assignedMemberId: '', assignedMemberName: '' },"
)

# ── 3. 更新 addNode 节点初始化（第二个出现） ──
# 已经通过 replace_all 全部替换，但 replace_all 参数在 Python str 中不适用
# 上面的替换应该已经覆盖了两处，但可能有多处，手动检查
# 如果还有 { taskName: '', taskTime: '', taskPerson: '' } 剩余，再替换一次
# 用递归方式替换所有（除了 data 字段定义注释行）
count = 1
while True:
    new_content = content.replace(
        "data: { taskName: '', taskTime: '', taskPerson: '' }",
        "data: { taskName: '', taskTime: '', taskPerson: '', claimable: false, assignedMemberId: '', assignedMemberName: '' }"
    )
    if new_content == content:
        break
    content = new_content
    count += 1
    if count > 20:
        break

# ── 4. 更新 updateNodeData 中的数据初始化 ──
content = content.replace(
    "if (!node.data) node.data = { taskName: '', taskTime: '', taskPerson: '' };",
    "if (!node.data) node.data = { taskName: '', taskTime: '', taskPerson: '', claimable: false, assignedMemberId: '', assignedMemberName: '' };"
)

# ── 5. 修改 renderCard：任务人员改为只读 + 加入可被认领开关 ──
old_task_person_block = """  // Task person field
  body.appendChild(createCardField('任务人员', node.data?.taskPerson || '', function (val) {
    updateNodeData(node.id, 'taskPerson', val);
  }));

  card.appendChild(body);"""

new_task_person_block = """  // Task person field (readonly - auto-filled when member claims this node)
  const assignedName = node.data?.assignedMemberName || node.data?.taskPerson || '';
  const personDisplay = document.createElement('div');
  personDisplay.className = 'structure-card-field';
  const pLabel = document.createElement('span');
  pLabel.className = 'structure-card-label';
  pLabel.textContent = '任务人员';
  const pValue = document.createElement('div');
  pValue.className = 'structure-card-value readonly';
  pValue.style.color = assignedName ? '' : 'var(--muted)';
  pValue.textContent = assignedName || '待成员认领';
  personDisplay.appendChild(pLabel);
  personDisplay.appendChild(pValue);
  body.appendChild(personDisplay);

  // Claimable toggle (only for non-root nodes)
  if (node.parentId !== null) {
    const toggleRow = document.createElement('div');
    toggleRow.className = 'structure-card-field structure-card-toggle';

    const toggleLabel = document.createElement('span');
    toggleLabel.className = 'structure-card-label';
    toggleLabel.textContent = '可被认领';

    const toggleWrapper = document.createElement('label');
    toggleWrapper.className = 'toggle-switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!(node.data?.claimable);
    checkbox.addEventListener('change', function () {
      updateNodeData(node.id, 'claimable', this.checked);
    });

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    toggleWrapper.appendChild(checkbox);
    toggleWrapper.appendChild(slider);
    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggleWrapper);
    body.appendChild(toggleRow);
  }

  card.appendChild(body);"""

content = content.replace(old_task_person_block, new_task_person_block)

# ── 6. 修改 createCardField：当 onChange 为 null 时只读显示 ──
# 不改 createCardField 本身，上面任务人员已经是自定义 DOM 了

# ── 7. 更新 applyDashboardData 中的节点数据初始化 ──
# 把 taskPerson: mod.leaderMember?.user?.name || '' 相关的也加上新字段
content = content.replace(
    "        taskPerson: mod.leaderMember?.user?.name || '',",
    "        taskPerson: '', assignedMemberId: (mod.leaderMember?.id || ''), assignedMemberName: (mod.leaderMember?.user?.name || ''), claimable: (!!mod.leaderMember?.id),"
)

# 也处理普通节点初始化
content = content.replace(
    "      taskName: '',\n      taskTime: '',\n      taskPerson: '',",
    "      taskName: '',\n      taskTime: '',\n      taskPerson: '',\n      claimable: false,\n      assignedMemberId: '',\n      assignedMemberName: '',"
)

# 处理 childNode 的 data
content = content.replace(
    "          taskPerson: childNode.data?.leader || '',",
    "          taskPerson: '', assignedMemberId: '', assignedMemberName: '', claimable: false,"
)

# ── 8. 添加 CSS 样式（追加到 structure.html 的 style 块） ──
# 先读取 structure.html 并在 style 块内追加
html_path = '/opt/golden-project/public/structure.html'
with open(html_path, 'r') as f:
    html = f.read()

css_to_add = """
      /* 可被认领开关 */
      .structure-card-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 0;
        border-top: 1px solid var(--border-light, #e8e8e8);
        margin-top: 4px;
      }
      .toggle-switch {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 22px;
      }
      .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: #ccc;
        transition: .3s;
        border-radius: 22px;
      }
      .toggle-slider::before {
        content: "";
        position: absolute;
        height: 16px;
        width: 16px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .3s;
        border-radius: 50%;
      }
      input:checked + .toggle-slider {
        background-color: var(--accent-strong, #1a7a3a);
      }
      input:checked + .toggle-slider::before {
        transform: translateX(18px);
      }
      .structure-card-value.readonly {
        cursor: default;
        user-select: none;
      }
"""

# 找到 </style> 前插入
html = html.replace('</style>', css_to_add + '\n    </style>')

with open(html_path, 'w') as f:
    f.write(html)

# 保存 structure.js
with open(path, 'w') as f:
    f.write(content)

print("✅ structure.js + structure.html 已修复")
