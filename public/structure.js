/* ============================================================
   GP Structure Mode — 层级结构树（纯 Vanilla JS）
   ============================================================ */

// =============================================================
// 1. 数据管理
// =============================================================

/**
 * 树节点结构（扁平数组）
 * {
 *   id: string,
 *   name: string,
 *   parentId: string | null,
 *   sortOrder: number,
 *   data: { taskName, taskTime, taskPerson, claimable, assignedMemberId, assignedMemberName }
 * }
 */
let treeData = [];
let nodeIdCounter = 0;
let currentProjectCode = '';
let projectName = '';
let dirty = false;

function generateId() {
  return 'n_' + (++nodeIdCounter) + '_' + Date.now().toString(36);
}

function getRootNodes() {
  return treeData.filter((n) => n.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder);
}

function getChildren(parentId) {
  return treeData.filter((n) => n.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
}

function getNode(id) {
  return treeData.find((n) => n.id === id);
}

function getNodePath(id) {
  const path = [];
  let current = getNode(id);
  while (current) {
    path.unshift(current);
    current = current.parentId ? getNode(current.parentId) : null;
  }
  return path;
}

/** Get all leaf nodes (nodes with no children) */
function getLeafNodes() {
  const parentIds = new Set(treeData.filter((n) => n.parentId !== null).map((n) => n.parentId));
  return treeData.filter((n) => !parentIds.has(n.id));
}

/** Build nested tree from flat data for rendering */
function buildNestedTree() {
  const roots = getRootNodes();
  function buildNode(node) {
    const children = getChildren(node.id);
    return {
      ...node,
      children: children.map(buildNode),
    };
  }
  return roots.map(buildNode);
}

// =============================================================
// 2. 默认初始化
// =============================================================

function initEmptyTree(projName) {
  const rootId = generateId();
  treeData = [
    {
      id: rootId,
      name: projName || '项目名称',
      parentId: null,
      sortOrder: 0,
      data: { taskName: '', taskTime: '', taskPerson: '', claimable: false, assignedMemberId: '', assignedMemberName: '' },
    },
  ];
  dirty = false;
  return rootId;
}

// =============================================================
// 3. 树操作
// =============================================================

function addNode(parentId) {
  const parent = getNode(parentId);
  if (!parent) return;

  const children = getChildren(parentId);
  const level = getNodeLevel(parentId) + 1;
  // Max 3 levels deep (项目 → 一级 → 二级 → 三级)
  if (level >= 4) {
    showStatus('最多支持三级结构');
    return;
  }

  const newNode = {
    id: generateId(),
    name: getDefaultName(level),
    parentId: parentId,
    sortOrder: children.length,
    data: { taskName: '', taskTime: '', taskPerson: '', claimable: false, assignedMemberId: '', assignedMemberName: '' },
  };
  treeData.push(newNode);
  dirty = true;
  renderAll();
}

function deleteNode(id) {
  const node = getNode(id);
  if (!node) return;
  // Cannot delete root
  if (node.parentId === null) {
    showStatus('不能删除项目根节点');
    return;
  }
  // Recursively delete children
  const descendants = getDescendantIds(id);
  const idsToRemove = new Set([id, ...descendants]);
  treeData = treeData.filter((n) => !idsToRemove.has(n.id));
  dirty = true;
  renderAll();
}

function getDescendantIds(id) {
  const ids = [];
  const children = getChildren(id);
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(child.id));
  }
  return ids;
}

function getNodeLevel(id) {
  let level = 0;
  let current = getNode(id);
  while (current && current.parentId !== null) {
    level++;
    current = getNode(current.parentId);
  }
  return level;
}

function getDefaultName(level) {
  const labels = ['', '一级结构', '二级结构', '三级结构'];
  const count = treeData.filter((n) => getNodeLevel(n.id) === level).length + 1;
  return labels[level] + count;
}

// =============================================================
// 3b. 拖拽排序 (HTML5 Drag & Drop)
// =============================================================

let dragSourceId = null;

/** Check if `ancestorId` is a descendant of `nodeId` (cycle detection) */
function isDescendant(ancestorId, nodeId) {
  let current = getNode(ancestorId);
  while (current) {
    if (current.id === nodeId) return true;
    current = current.parentId ? getNode(current.parentId) : null;
  }
  return false;
}

/** Validate whether sourceId can be moved to become a child of newParentId */
function canMoveNodeToParent(sourceId, newParentId) {
  const node = getNode(sourceId);
  if (!node || node.parentId === null) return false;  // root unmovable
  if (sourceId === newParentId) return false;

  // Cycle: newParent must not be a descendant of source
  if (isDescendant(newParentId, sourceId)) return false;

  // Max depth: newLevel ≤ 3
  const newLevel = getNodeLevel(newParentId) + 1;
  if (newLevel > 3) return false;

  // All descendants must still fit in ≤ 3 levels
  const sourceLevel = getNodeLevel(sourceId);
  const levelDiff = newLevel - sourceLevel;
  const descendants = getDescendantIds(sourceId);
  for (const descId of descendants) {
    if (getNodeLevel(descId) + levelDiff > 3) return false;
  }

  return true;
}

/** Re-assign sequential sortOrder values to all siblings under parentId */
function renumberSiblings(parentId) {
  const siblings = getChildren(parentId);
  siblings.forEach(function (s, i) {
    s.sortOrder = i;
  });
}

// ---- Drag event handlers (delegated on #treeEditor) ----

function handleDragStart(e) {
  const nodeEl = e.target.closest('.tree-node');
  if (!nodeEl) return;
  const nodeId = nodeEl.dataset.nodeId;
  const node = getNode(nodeId);
  // Root nodes cannot be dragged
  if (!node || node.parentId === null) {
    e.preventDefault();
    return;
  }
  dragSourceId = nodeId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', nodeId);
  nodeEl.classList.add('dragging');
}

function handleDragEnd(e) {
  const nodeEl = e.target.closest('.tree-node');
  if (nodeEl) nodeEl.classList.remove('dragging');
  // Clear all drag visual feedback
  document.querySelectorAll('.drag-over, .drag-over-children').forEach(function (el) {
    el.classList.remove('drag-over', 'drag-over-children');
  });
  dragSourceId = null;
}

function handleDragOverDelegated(e) {
  const targetInner = e.target.closest('.tree-node-column-inner');
  if (!targetInner) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const targetNodeEl = targetInner.querySelector('.tree-node');
  if (!targetNodeEl) return;
  const targetId = targetNodeEl.dataset.nodeId;
  const sourceId = dragSourceId;
  if (!sourceId || sourceId === targetId) return;

  // Decide: hovering over the node itself → "make child"
  //            hovering over children/connector area → "insert as sibling"
  const isOverNode = targetNodeEl.contains(e.target);

  targetInner.classList.remove('drag-over', 'drag-over-children');

  if (isOverNode) {
    if (canMoveNodeToParent(sourceId, targetId)) {
      targetInner.classList.add('drag-over');
    }
  } else {
    const targetNode = getNode(targetId);
    if (targetNode && targetNode.parentId !== null) {
      if (canMoveNodeToParent(sourceId, targetNode.parentId)) {
        targetInner.classList.add('drag-over-children');
      }
    }
  }
}

function handleDragLeaveDelegated(e) {
  const targetInner = e.target.closest('.tree-node-column-inner');
  if (!targetInner) return;
  targetInner.classList.remove('drag-over', 'drag-over-children');
}

function handleDropDelegated(e) {
  e.preventDefault();
  const targetInner = e.target.closest('.tree-node-column-inner');
  if (!targetInner) return;
  targetInner.classList.remove('drag-over', 'drag-over-children');

  const targetNodeEl = targetInner.querySelector('.tree-node');
  if (!targetNodeEl) return;
  const targetId = targetNodeEl.dataset.nodeId;
  const sourceId = dragSourceId;
  if (!sourceId || sourceId === targetId) return;

  const sourceNode = getNode(sourceId);
  const targetNode = getNode(targetId);
  if (!sourceNode || !targetNode) return;
  if (sourceNode.parentId === null) return; // cannot move root

  const oldParentId = sourceNode.parentId;
  const isDropOnNode = targetNodeEl.contains(e.target);

  if (isDropOnNode) {
    // ── Make source a child of target ──
    if (!canMoveNodeToParent(sourceId, targetId)) {
      showStatus('无法移动到该位置（层级限制或循环依赖）');
      return;
    }
    sourceNode.parentId = targetId;
    renumberSiblings(targetId);
    renumberSiblings(oldParentId);
    showStatus('节点已移动');
  } else {
    // ── Insert source as a sibling of target ──
    const newParentId = targetNode.parentId;
    if (newParentId === null) {
      showStatus('不能将节点移到根级别');
      return;
    }
    if (!canMoveNodeToParent(sourceId, newParentId)) {
      showStatus('无法移动到该位置（层级限制或循环依赖）');
      return;
    }
    sourceNode.parentId = newParentId;
    // Position source just before the target node
    sourceNode.sortOrder = targetNode.sortOrder - 0.5;
    renumberSiblings(newParentId);
    renumberSiblings(oldParentId);
    showStatus('节点已移动');
  }

  dirty = true;
  renderAll();
}

function initDragDrop() {
  const container = document.getElementById('treeEditor');
  if (!container) return;
  container.addEventListener('dragstart', handleDragStart);
  container.addEventListener('dragend', handleDragEnd);
  container.addEventListener('dragover', handleDragOverDelegated);
  container.addEventListener('dragleave', handleDragLeaveDelegated);
  container.addEventListener('drop', handleDropDelegated);
}

function renameNode(id, name) {
  const node = getNode(id);
  if (!node) return;
  node.name = name;
  dirty = true;
}

function updateNodeData(id, field, value) {
  const node = getNode(id);
  if (!node) return;
  if (!node.data) node.data = { taskName: '', taskTime: '', taskPerson: '', claimable: false, assignedMemberId: '', assignedMemberName: '' };
  node.data[field] = value;
  dirty = true;
}

// =============================================================
// 4. 渲染引擎
// =============================================================

function renderAll() {
  renderTree();
  renderCards();
  updateSummary();
}

// =============================================================
// 4a. 树渲染
// =============================================================

function renderTree() {
  const container = document.getElementById('treeEditor');
  if (!container) return;

  const nested = buildNestedTree();
  if (nested.length === 0) {
    container.innerHTML = '<div class="tree-empty">暂无结构，请先加载项目。</div>';
    return;
  }

  container.innerHTML = '';
  const treeRoot = document.createElement('div');
  treeRoot.className = 'tree-root';

  // Render each root-level node as a column
  for (const rootNode of nested) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node-column';
    wrapper.appendChild(renderTreeNode(rootNode));
    treeRoot.appendChild(wrapper);
  }

  container.appendChild(treeRoot);
}

function renderTreeNode(node) {
  const col = document.createElement('div');
  col.className = 'tree-node-column-inner';
  col.dataset.nodeId = node.id;

  // === Node element ===
  const nodeEl = document.createElement('div');
  nodeEl.className = 'tree-node' + (node.parentId === null ? ' project-node' : '');
  nodeEl.dataset.nodeId = node.id;
  nodeEl.draggable = true;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'tree-node-name';
  nameInput.value = node.name;
  nameInput.placeholder = '输入名称';
  nameInput.addEventListener('input', function () {
    renameNode(node.id, this.value);
    // Update card title if visible
    const cardTitle = document.querySelector('.structure-card[data-node-id="' + node.id + '"] .structure-card-title');
    if (cardTitle) cardTitle.textContent = this.value || '未命名';
  });
  nameInput.addEventListener('blur', function () {
    if (!this.value.trim()) {
      this.value = '未命名';
      renameNode(node.id, '未命名');
    }
  });
  nodeEl.appendChild(nameInput);

  // Actions
  const actions = document.createElement('span');
  actions.className = 'tree-node-actions';

  // Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'tree-btn add-btn';
  addBtn.textContent = '+';
  addBtn.title = '添加下级结构';
  addBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    addNode(node.id);
  });
  actions.appendChild(addBtn);

  // Delete button (not for root)
  if (node.parentId !== null) {
    const delBtn = document.createElement('button');
    delBtn.className = 'tree-btn delete-btn';
    delBtn.textContent = '✕';
    delBtn.title = '删除该结构';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (confirm('确认删除「' + node.name + '」及其所有下级结构？')) {
        deleteNode(node.id);
      }
    });
    actions.appendChild(delBtn);
  }

  nodeEl.appendChild(actions);
  col.appendChild(nodeEl);

  // === Children ===
  if (node.children && node.children.length > 0) {
    // Connector line
    const connector = document.createElement('div');
    connector.className = 'tree-connector';
    connector.textContent = '→';
    col.appendChild(connector);

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    for (const child of node.children) {
      childrenContainer.appendChild(renderTreeNode(child));
    }
    col.appendChild(childrenContainer);
  }

  return col;
}

// =============================================================
// 4b. 卡片渲染
// =============================================================

function renderCards() {
  const container = document.getElementById('cardsArea');
  if (!container) return;

  const nested = buildNestedTree();
  const allNodes = getAllNodesFlat(nested);

  if (allNodes.length === 0) {
    container.innerHTML =
      '<div class="cards-empty">暂无结构卡片，请在顶部编辑区添加结构节点。</div>';
    return;
  }

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'cards-grid';

  for (const node of allNodes) {
    grid.appendChild(renderCard(node));
  }

  container.appendChild(grid);
}

function getAllNodesFlat(nestedNodes) {
  const result = [];
  function walk(nodes) {
    for (const n of nodes) {
      result.push(n);
      if (n.children && n.children.length > 0) {
        walk(n.children);
      }
    }
  }
  walk(nestedNodes);
  return result;
}

function renderCard(node) {
  const card = document.createElement('div');
  card.className = 'structure-card';
  card.dataset.nodeId = node.id;

  const level = getNodeLevel(node.id);

  const header = document.createElement('div');
  header.className = 'structure-card-header';

  const levelLabel = document.createElement('span');
  levelLabel.className = 'structure-card-level';
  const levelNames = ['', '一级', '二级', '三级'];
  levelLabel.textContent = levelNames[level] || ('L' + level);
  header.appendChild(levelLabel);

  const title = document.createElement('span');
  title.className = 'structure-card-title';
  title.textContent = node.name || '未命名';
  header.appendChild(title);

  card.appendChild(header);

  // Close button (右上角 ✕)
  const closeBtn = document.createElement('button');
  closeBtn.className = 'structure-card-close';
  closeBtn.textContent = '✕';
  closeBtn.title = '删除该结构';
  closeBtn.addEventListener('click', function () {
    if (confirm('确认删除「' + node.name + '」及其所有下级结构？')) {
      deleteNode(node.id);
    }
  });
  card.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'structure-card-body';

  // Task name field
  body.appendChild(createCardField('任务名称', node.data?.taskName || '', function (val) {
    updateNodeData(node.id, 'taskName', val);
  }));

  // Task time field
  body.appendChild(createCardField('任务时间', node.data?.taskTime || '', function (val) {
    updateNodeData(node.id, 'taskTime', val);
  }));

  // Task person field (readonly - auto-filled when member claims this node)
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

  card.appendChild(body);

  return card;
}

function createCardField(label, value, onChange) {
  const field = document.createElement('div');
  field.className = 'structure-card-field';

  const labelEl = document.createElement('span');
  labelEl.className = 'structure-card-label';
  labelEl.textContent = label;
  field.appendChild(labelEl);

  const valueEl = document.createElement('div');
  valueEl.className = 'structure-card-value';
  valueEl.contentEditable = true;
  valueEl.textContent = value;
  valueEl.dataset.placeholder = '点击编辑' + label;
  valueEl.addEventListener('blur', function () {
    const val = this.textContent.trim();
    onChange(val);
  });
  valueEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.blur();
    }
  });
  field.appendChild(valueEl);

  return field;
}

function updateSummary() {
  const el = document.getElementById('structureSummary');
  if (!el) return;
  const total = treeData.length;
  const leafCount = getLeafNodes().length;
  el.textContent = total + ' 个节点 · ' + leafCount + ' 个末端结构 · ' + (dirty ? '有未保存更改' : '已保存');
}

// =============================================================
// 5. 转换（数据 ↔ API）
// =============================================================

function treeToPayload() {
  return {
    tree: JSON.parse(JSON.stringify(treeData)),
    structureSource: 'manually_modified',
    updatedAt: new Date().toISOString(),
  };
}

function payloadToTree(payload) {
  if (!payload) return;
  const nodes = payload.tree || payload.nodes || [];
  if (nodes.length === 0) return;
  treeData = nodes;
  // Fix parentId: the root node has parentId null
  const hasRoot = treeData.some((n) => n.parentId === null);
  if (!hasRoot && treeData.length > 0) {
    // Use first node as root
    treeData[0].parentId = null;
  }
  // Recalculate counter
  nodeIdCounter = treeData.reduce(function (max, n) {
    const match = n.id.match(/^n_(\d+)/);
    const num = match ? parseInt(match[1], 10) : NaN;
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  dirty = false;
}

// =============================================================
// 6. 保存 & 加载
// =============================================================

function showStatus(msg, isError) {
  const el = document.getElementById('structureStatus');
  if (el) {
    el.textContent = msg;
    if (isError) el.style.color = 'var(--danger)';
    else el.style.color = '';
  }
}

function showSaveStatus(msg) {
  const el = document.getElementById('saveStatus');
  if (el) el.textContent = msg;
}

async function saveStructure() {
  const projectCode = currentProjectCode;
  if (!projectCode) {
    showStatus('请先选择项目。');
    return;
  }

  const payload = treeToPayload();
  showSaveStatus('保存中...');

  try {
    const response = await fetch(
      '/agent/structure/' + encodeURIComponent(projectCode),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!response.ok) {
      throw new Error('保存失败: ' + response.status);
    }
    dirty = false;
    showSaveStatus('✅ 已保存');
    updateSummary();
    setTimeout(function () {
      showSaveStatus('');
    }, 3000);
    showStatus('✅ 结构已保存');
  } catch (error) {
    console.error(error);
    showSaveStatus('❌ 保存失败');
    showStatus('保存失败: ' + error.message, true);
  }
}

async function loadStructureFromAPI(projectCode) {
  if (!projectCode) {
    showStatus('请选择项目。');
    return;
  }

  showStatus('正在加载项目结构...');

  let success = false;

  // Try new /agent/structure endpoint first
  try {
    const response = await fetch(
      '/agent/structure/' + encodeURIComponent(projectCode)
    );
    if (response.ok) {
      const data = await response.json();
      applyStructureData(data.data || data, projectCode);
      showStatus('✅ 结构已加载');
      success = true;
    }
  } catch (_) {
    /* fall through */
  }

  // Fallback: old /api/projects/:code/dashboard
  if (!success) {
    try {
      const dashResponse = await fetch(
        '/api/projects/' + encodeURIComponent(projectCode) + '/dashboard'
      );
      if (!dashResponse.ok) {
        throw new Error('加载失败: ' + dashResponse.status);
      }
      const data = await dashResponse.json();
      applyDashboardData(data, projectCode);
      showStatus('✅ 结构已加载 (Dashboard)');
      success = true;
    } catch (error) {
      console.error(error);
      showStatus('❌ 加载失败，请确认后端服务和项目数据。', true);
    }
  }

  if (success) {
    document.getElementById('structureProjectSelect').value = projectCode;
    window.history.replaceState(
      {},
      '',
      '?projectCode=' + encodeURIComponent(projectCode)
    );
  }
}

function applyStructureData(data, projectCode) {
  currentProjectCode = projectCode;

  if (data.tree && data.tree.length > 0) {
    payloadToTree(data);
  } else {
    // Legacy format: nodes/edges — convert if possible
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    if (nodes.length > 0) {
      treeData = convertLegacyNodes(nodes, edges);
    } else {
      // Fallback: init from project name
      const projName = data.project?.name || data.name || projectCode;
      initEmptyTree(projName);
    }
  }

  // Update hero
  const rootNode = treeData.find((n) => n.parentId === null);
  if (rootNode) {
    document.getElementById('structureProjectName').textContent =
      rootNode.name || '项目结构';
    document.getElementById('structureProjectMeta').textContent =
      '项目编码 ' + projectCode;
  }

  renderAll();
}

function applyDashboardData(data, projectCode) {
  currentProjectCode = projectCode;
  const project = data.project || {};
  projectName = project.name || '项目结构';

  const modules = [...(project.modules || [])].sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
  );

  // Build tree from modules
  const rootId = generateId();
  treeData = [
    {
      id: rootId,
      name: projectName,
      parentId: null,
      sortOrder: 0,
      data: { taskName: '', taskTime: '', taskPerson: '', claimable: false, assignedMemberId: '', assignedMemberName: '' },
    },
  ];

  for (const mod of modules) {
    const nodeId = generateId();
    const tasks = (data.tasks || []).filter(
      (t) => t.module?.id === mod.id || t.module?.name === mod.name
    );
    treeData.push({
      id: nodeId,
      name: mod.name || '未命名模块',
      parentId: rootId,
      sortOrder: treeData.length,
      data: {
        taskName: tasks[0]?.name || mod.description || '',
        taskTime: tasks[0]?.dueTime || tasks[0]?.startTime || '',
        taskPerson: '', assignedMemberId: (mod.leaderMember?.id || ''), assignedMemberName: (mod.leaderMember?.user?.name || ''), claimable: (!!mod.leaderMember?.id),
      },
    });
  }

  dirty = false;

  // Update hero
  document.getElementById('structureProjectName').textContent = projectName;
  document.getElementById('structureProjectMeta').textContent =
    '项目编码 ' +
    projectCode +
    ' · ' +
    (project.location || '待填写地点') +
    ' · ' +
    formatShortDate(project.startDate) +
    ' - ' +
    formatShortDate(project.endDate);
  document.getElementById('backToDashboard').href =
    '/console/dashboard' +
    (projectCode ? '?projectCode=' + encodeURIComponent(projectCode) : '');

  renderAll();
}

function convertLegacyNodes(nodes, edges) {
  const result = [];
  const nodeMap = {};

  // Find root
  const rootNode = nodes.find((n) => n.type === root || (n.parentId === null || n.parentId === undefined));
  if (!rootNode) return [];

  const rootId = generateId();
  result.push({
    id: rootId,
    name: rootNode.data?.title || '项目根节点',
    parentId: null,
    sortOrder: 0,
    data: {
      taskName: '',
      taskTime: '',
      taskPerson: '',
      claimable: false,
      assignedMemberId: '',
      assignedMemberName: '',
    },
  });
  nodeMap[rootNode.id] = rootId;

  // Build child mapping from edges
  const childMap = {};
  for (const edge of edges) {
    if (!childMap[edge.source]) childMap[edge.source] = [];
    childMap[edge.source].push(edge.target);
  }

  function addChildren(parentNodeId, newParentId) {
    const childNodeIds = childMap[parentNodeId] || [];
    for (const childId of childNodeIds) {
      const childNode = nodes.find((n) => n.id === childId);
      if (!childNode) continue;
      const newId = generateId();
      result.push({
        id: newId,
        name: childNode.data?.title || '未命名',
        parentId: newParentId,
        sortOrder: childNode.data?.index || 0,
        data: {
          taskName: childNode.data?.description || '',
          taskTime: '',
          taskPerson: '', assignedMemberId: '', assignedMemberName: '', claimable: false,
        },
      });
      nodeMap[childNode.id] = newId;
      addChildren(childNode.id, newId);
    }
  }

  addChildren(rootNode.id, rootId);

  return result;
}

// =============================================================
// 7. 工具函数
// =============================================================

function formatShortDate(value) {
  if (!value) return '--';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(value));
  } catch (_) {
    return '--';
  }
}

function getProjectCode(project) {
  return project?.code || project?.projectCode || project?.id || '';
}

// =============================================================
// 8. 项目列表管理
// =============================================================

async function fetchProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) {
    throw new Error('projects request failed: ' + response.status);
  }
  return response.json();
}

function renderProjectOptions(projects, selectedCode) {
  const select = document.querySelector('#structureProjectSelect');
  if (!projects.length) {
    select.innerHTML = '<option value="">暂无项目</option>';
    return;
  }
  select.innerHTML = projects
    .map(function (project) {
      const code = getProjectCode(project);
      return (
        '<option value="' +
        code +
        '" ' +
        (code === selectedCode ? 'selected' : '') +
        '>' +
        (project.name || '未命名') +
        ' · ' +
        code +
        '</option>'
      );
    })
    .join('');
}

// =============================================================
// 9. Bootstrap
// =============================================================

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const requestedCode =
    params.get('projectCode') || params.get('projectId') || '';
  const select = document.querySelector('#structureProjectSelect');
  const loadButton = document.querySelector('#loadStructureProject');

  // Initialize empty tree
  initEmptyTree('项目结构');
  renderAll();

  // Initialize drag-and-drop on the tree editor container
  initDragDrop();

  // Load project list
  try {
    const projects = await fetchProjects();
    const selectedProject =
      projects.find(
        (p) => getProjectCode(p) === requestedCode || p.id === requestedCode
      ) || projects[0];
    const selectedCode = getProjectCode(selectedProject);

    renderProjectOptions(projects, selectedCode);

    // Load structure
    setTimeout(function () {
      loadStructureFromAPI(selectedCode);
    }, 200);
  } catch (error) {
    console.error(error);
    document.getElementById('structureStatus').textContent =
      '❌ 项目列表加载失败，请确认后端服务。';
  }

  // ===== Event bindings =====

  // Save button
  document
    .getElementById('saveStructureBtn')
    .addEventListener('click', saveStructure);

  // Hero: load / switch project
  loadButton.addEventListener('click', function () {
    loadStructureFromAPI(select.value.trim());
  });
  select.addEventListener('change', function () {
    loadStructureFromAPI(select.value.trim());
  });
}

// =============================================================
// 10. 启动
// =============================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
