/* ============================================================
   GP Structure Mode — React Flow 可编辑画布
   ============================================================
   依赖 CDN: React 18, ReactDOM 18, ReactFlow 11, htm
   ============================================================ */

// =============================================================
// 1. 依赖与常量
// =============================================================

const html = htm.bind(React.createElement);

const RF = window.ReactFlow || {};
const RFReactFlow = RF.ReactFlow;
const RFReactFlowProvider = RF.ReactFlowProvider || React.Fragment;
const RFuseNodesState = RF.useNodesState;
const RFuseEdgesState = RF.useEdgesState;
const RFBackground = RF.Background;
const RFControls = RF.Controls;
const RFHandle = RF.Handle;
const RFPosition = RF.Position;

function getProjectCode(project) {
  return project?.code || project?.projectCode || project?.id || '';
}

function formatShortDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value));
}

function taskProgress(status) {
  switch (status) {
    case 'COMPLETED': return 100;
    case 'IN_PROGRESS': return 66;
    case 'CONFIRMED': return 42;
    case 'PENDING_CONFIRMATION': return 18;
    case 'OVERDUE': return 74;
    default: return 24;
  }
}

function sortTasks(tasks) {
  return [...(tasks || [])].sort((a, b) => {
    const aTime = new Date(a.dueTime || a.startTime || a.createdAt || 0).getTime();
    const bTime = new Date(b.dueTime || b.startTime || b.createdAt || 0).getTime();
    return aTime - bTime;
  });
}

function getModuleTaskList(tasks, module) {
  return (tasks || []).filter(
    (task) => task.module?.id === module.id || task.module?.name === module.name
  );
}

// =============================================================
// 2. 全局状态桥接（React ←→ Vanilla JS）
// =============================================================

window.__appState = {
  nodes: [],
  edges: [],
  projectData: null,
  currentProjectCode: '',
  setNodes: null,
  setEdges: null,
};

window.__updateNodeData = function (nodeId, dataPatch) {
  const s = window.__appState;
  if (!s.setNodes) return;
  s.setNodes((prev) =>
    prev.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, ...dataPatch, structureSource: 'manually_modified' } }
        : n
    )
  );
};

window.__addNode = function (title, description, leader) {
  const s = window.__appState;
  if (!s.setNodes || !s.setEdges) return;

  const newId = 'manual_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const rootNode = (s.nodes || []).find((n) => n.type === 'root');
  const rootPos = rootNode ? rootNode.position : { x: 400, y: 50 };
  const moduleNodes = (s.nodes || []).filter((n) => n.type === 'module');
  const count = moduleNodes.length;
  const col = count % 4;
  const row = Math.floor(count / 4);

  const newNode = {
    id: newId,
    type: 'module',
    position: {
      x: Math.max(50, rootPos.x - 140 + col * 280),
      y: rootPos.y + 160 + row * 180,
    },
    data: {
      title: title || '新模块',
      description: description || '',
      leader: leader || '',
      members: [],
      progress: 0,
      taskCount: 0,
      parentId: rootNode ? rootNode.id : null,
      createdBy: 'manual',
      structureSource: 'manually_modified',
      index: count,
    },
  };

  const newEdge = {
    id: 'edge_root_' + newId,
    source: rootNode ? rootNode.id : 'root',
    target: newId,
    type: 'smoothstep',
    animated: false,
  };

  s.setNodes((prev) => [...prev, newNode]);
  s.setEdges((prev) => [...prev, newEdge]);
};

window.__deleteNode = function (nodeId) {
  const s = window.__appState;
  if (!s.setNodes || !s.setEdges) return;

  const hasChildren = (s.nodes || []).some(
    (n) => n.data && n.data.parentId === nodeId
  );
  if (hasChildren) {
    alert('请先删除或移动子模块');
    return false;
  }

  s.setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  s.setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
  return true;
};

// =============================================================
// 3. 数据转换
// =============================================================

function convertDashboardToGraph(data) {
  const project = data.project || {};
  const modules = [...(project.modules || [])].sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
  );
  const tasks = sortTasks(data.tasks || []);
  const nodes = [];
  const edges = [];

  // Root node
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const overallProgress = tasks.length
    ? Math.round((completedTasks / tasks.length) * 100)
    : 0;

  nodes.push({
    id: 'root',
    type: 'root',
    position: { x: 400, y: 50 },
    data: {
      title: project.name || '项目根节点',
      description: modules.length + ' 个模块 · ' + tasks.length + ' 个任务',
      leader: '',
      members: [],
      progress: overallProgress,
      taskCount: tasks.length,
      parentId: null,
      createdBy: 'ai',
      structureSource: 'ai_generated',
      index: -1,
      projectId: getProjectCode(project),
    },
  });

  // Module nodes
  modules.forEach((module, index) => {
    const moduleTasks = getModuleTaskList(tasks, module);
    const moduleProgress = moduleTasks.length
      ? Math.round(
          moduleTasks.reduce((sum, t) => sum + taskProgress(t.status), 0) /
            moduleTasks.length
        )
      : 0;
    const leaderName = module.leaderMember?.user?.name || '';

    const nodeId = 'module_' + (module.id || index);
    const col = index % 4;
    const row = Math.floor(index / 4);

    nodes.push({
      id: nodeId,
      type: 'module',
      position: { x: 280 + col * 280, y: 180 + row * 200 },
      data: {
        title: module.name || '未命名模块',
        description: module.description || '',
        leader: leaderName,
        members: [],
        progress: moduleProgress,
        taskCount: moduleTasks.length,
        parentId: 'root',
        createdBy: 'ai',
        structureSource: 'ai_generated',
        index: index,
        moduleId: module.id,
      },
    });

    edges.push({
      id: 'edge_root_' + nodeId,
      source: 'root',
      target: nodeId,
      type: 'smoothstep',
      animated: false,
    });
  });

  return { nodes, edges, project };
}

function convertGraphToSavePayload(nodes, edges) {
  return {
    nodes: JSON.parse(JSON.stringify(nodes || [])),
    edges: JSON.parse(JSON.stringify(edges || [])),
    structureSource: 'manually_modified',
    updatedAt: new Date().toISOString(),
  };
}

// =============================================================
// 4. 自定义 React Flow 节点
// =============================================================

function GPNode({ id, data, selected }) {
  const index = (data.index != null ? data.index : 0) + 1;
  const progress = data.progress || 0;
  const leader = data.leader || '';
  const taskCount = data.taskCount || 0;

  return html`
    <div
      className=${'gp-rf-node' + (selected ? ' selected' : '')}
      data-node-id=${id}
    >
      <${RFHandle} type="target" position=${RFPosition.Top} />
      <div className="gp-rf-node-header">
        <span className="gp-rf-node-index">${String(index).padStart(2, '0')}</span>
        <h4 title=${data.title}>${data.title}</h4>
      </div>
      ${data.description
        ? html`<p className="gp-rf-node-desc">${data.description}</p>`
        : ''}
      <div className="gp-rf-node-meta">
        <span>负责人 <strong>${leader || '待指定'}</strong></span>
        <span>进度 <strong>${progress}%</strong></span>
        <span>任务 <strong>${taskCount}</strong></span>
      </div>
      <div className="gp-rf-node-progress">
        <span
          className="gp-rf-node-progress-bar"
          style=${{ width: Math.max(4, progress) + '%' }}
        ></span>
      </div>
      <${RFHandle} type="source" position=${RFPosition.Bottom} />
    </div>
  `;
}

function RootNode({ data, selected }) {
  return html`
    <div className=${'gp-rf-root' + (selected ? ' selected' : '')}>
      <div className="gp-rf-root-icon">GP</div>
      <div>
        <h4>${data.title}</h4>
        <p>${data.description || '根节点'}</p>
      </div>
      <${RFHandle} type="source" position=${RFPosition.Bottom} />
    </div>
  `;
}

const NODE_TYPES = { module: GPNode, root: RootNode };

// =============================================================
// 5. 默认边样式
// =============================================================

const DEFAULT_EDGE_OPTIONS = {
  style: { stroke: '#bf5a36', strokeWidth: 2, opacity: 0.45 },
  type: 'smoothstep',
};

// =============================================================
// 6. 模块卡片列表
// =============================================================

function ModuleCardList({ nodes, onEdit, onDelete }) {
  const moduleNodes = (nodes || []).filter((n) => n.type === 'module');

  if (!moduleNodes.length) {
    return html`
      <div className="module-card-empty">
        当前没有模块。点击「+ 新增模块」创建，或加载已有项目。
      </div>
    `;
  }

  return moduleNodes.map(
    (node, i) => html`
      <div className="module-card" key=${node.id}>
        <div className="module-card-main">
          <h4>${String(i + 1).padStart(2, '0')}. ${node.data.title}</h4>
          ${node.data.description
            ? html`<p>${node.data.description}</p>`
            : ''}
          <div className="module-card-meta">
            <span>负责人 <strong>${node.data.leader || '待指定'}</strong></span>
            <span>进度 <strong>${node.data.progress || 0}%</strong></span>
            <span>任务 <strong>${node.data.taskCount || 0}</strong></span>
            <span>${node.data.createdBy === 'manual' ? '手动' : 'AI'}</span>
          </div>
        </div>
        <div className="module-card-actions">
          <button className="edit-module-btn" onClick=${() => onEdit(node.id)} type="button">编辑</button>
          <button className="delete-module-btn" onClick=${() => onDelete(node.id)} type="button">删除</button>
        </div>
      </div>
    `
  );
}

// =============================================================
// 7. React Flow 画布
// =============================================================

function RFCanvas({ nodes, edges, onNodesChange, onEdgesChange }) {
  return html`
    <${RFReactFlowProvider}>
      <${RFReactFlow}
        nodes=${nodes}
        edges=${edges}
        onNodesChange=${onNodesChange}
        onEdgesChange=${onEdgesChange}
        nodeTypes=${NODE_TYPES}
        defaultEdgeOptions=${DEFAULT_EDGE_OPTIONS}
        fitView
        fitViewOptions=${{ padding: 0.3 }}
        minZoom=${0.2}
        maxZoom=${2.5}
        snapToGrid
        snapGrid=${[20, 20]}
        panOnDrag=${true}
        zoomOnScroll=${true}
        selectNodesOnDrag=${false}
        deleteKeyCode=${null}
        multiSelectionKeyCode=${null}
      >
        <${RFBackground} variant="lines" gap=${20} size=${1} color="rgba(31,36,31,0.06)" />
        <${RFControls}
          showInteractive=${false}
          style=${{
            background: 'rgba(255,255,255,0.88)',
            borderRadius: 12,
            border: '1px solid rgba(31,36,31,0.08)',
            boxShadow: '0 4px 12px rgba(34,28,16,0.08)',
          }}
        />
      <//>
    <//>
  `;
}

// =============================================================
// 8. 主应用组件
// =============================================================

function StructureApp() {
  // Initialise from global state (pre-loaded data)
  const initialNodes = window.__appState.nodes.length
    ? window.__appState.nodes
    : [
        {
          id: 'root',
          type: 'root',
          position: { x: 400, y: 50 },
          data: {
            title: '项目根节点',
            description: '暂无数据',
            leader: '',
            members: [],
            progress: 0,
            taskCount: 0,
            parentId: null,
            createdBy: 'ai',
            structureSource: 'ai_generated',
            index: -1,
          },
        },
      ];
  const initialEdges = window.__appState.edges.length ? window.__appState.edges : [];

  const [nodes, setNodes, onNodesChange] = RFuseNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = RFuseEdgesState(initialEdges);

  // Sync global state after mount
  React.useEffect(() => {
    window.__appState.nodes = nodes;
    window.__appState.setNodes = setNodes;
  }, [nodes, setNodes]);

  React.useEffect(() => {
    window.__appState.edges = edges;
    window.__appState.setEdges = setEdges;
  }, [edges, setEdges]);

  // Handle node changes (drag → mark manually_modified)
  const handleNodesChange = React.useCallback(
    (changes) => {
      onNodesChange(changes);

      const positionChanges = changes.filter(
        (c) => c.type === 'position' && c.position && !c.dragging
      );
      if (positionChanges.length > 0) {
        const draggedIds = new Set(positionChanges.map((c) => c.id));
        setTimeout(() => {
          setNodes((prev) =>
            prev.map((n) =>
              draggedIds.has(n.id)
                ? { ...n, data: { ...n.data, structureSource: 'manually_modified' } }
                : n
            )
          );
        }, 0);
      }
    },
    [onNodesChange, setNodes]
  );

  // Handle edit (opens vanilla modal)
  const handleEdit = React.useCallback(
    (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      openEditModal(node);
    },
    [nodes]
  );

  // Handle delete
  const handleDelete = React.useCallback(
    (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const hasChildren = nodes.some((n) => n.data && n.data.parentId === nodeId);
      if (hasChildren) {
        alert('请先删除或移动子模块');
        return;
      }

      if (!confirm('确认删除模块「' + (node.data.title || '') + '」？')) return;

      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [nodes, setNodes, setEdges]
  );

  // Handle save
  const handleSave = React.useCallback(() => {
    saveStructure();
  }, []);

  // Handle add module (opens vanilla modal)
  const handleAdd = React.useCallback(() => {
    openAddModal();
  }, []);

  const moduleCount = (nodes || []).filter((n) => n.type === 'module').length;

  return html`
    <div className="structure-body-panel">
      <!-- Header -->
      <div className="structure-body-header">
        <div>
          <h3>结构内容编辑区</h3>
          <p>${moduleCount} 个模块 · 编辑或拖拽后点击保存</p>
        </div>
        <div className="structure-editor-actions">
          <button className="add-module-btn" onClick=${handleAdd} type="button">
            + 新增模块
          </button>
          <button className="save-all-btn" onClick=${handleSave} type="button">
            💾 保存结构
          </button>
          <span className="save-status" id="saveStatus"></span>
        </div>
      </div>

      <!-- Module cards -->
      <div className="module-cards">
        <${ModuleCardList}
          nodes=${nodes}
          onEdit=${handleEdit}
          onDelete=${handleDelete}
        />
      </div>

      <!-- React Flow canvas -->
      <div className="rf-container">
        <${RFCanvas}
          nodes=${nodes}
          edges=${edges}
          onNodesChange=${handleNodesChange}
          onEdgesChange=${onEdgesChange}
        />
      </div>
    </div>
  `;
}

// =============================================================
// 9. React 渲染
// =============================================================

function renderReactApp() {
  const container = document.getElementById('react-root');
  if (!container) {
    console.error('React root container not found');
    return;
  }

  let root;
  if (ReactDOM.createRoot) {
    root = ReactDOM.createRoot(container);
  } else {
    // Fallback for older React builds
    root = { render: (el) => ReactDOM.render(el, container) };
  }

  root.render(html`<${StructureApp} />`);
  return root;
}

// =============================================================
// 10. 弹窗管理 (Vanilla JS)
// =============================================================

function openEditModal(node) {
  document.getElementById('editModuleNodeId').value = node.id;
  document.getElementById('editModuleId').value = node.data.moduleId || '';
  document.getElementById('editModuleName').value = node.data.title || '';
  document.getElementById('editLeaderName').value = node.data.leader || '';
  document.getElementById('editModuleDescription').value = node.data.description || '';

  const project = window.__appState.projectData?.project || {};
  const members = project.members || [];
  document.getElementById('projectMemberNames').innerHTML = members
    .map((m) => '<option value="' + (m.user?.name || m.name || '') + '"></option>')
    .join('');

  document.getElementById('moduleEditModal').classList.add('open');
  document.getElementById('moduleEditModal').setAttribute('aria-hidden', 'false');
  // Focus first input
  setTimeout(() => document.getElementById('editModuleName')?.focus(), 100);
}

function closeEditModal() {
  document.getElementById('moduleEditModal').classList.remove('open');
  document.getElementById('moduleEditModal').setAttribute('aria-hidden', 'true');
}

function openAddModal() {
  const project = window.__appState.projectData?.project || {};
  const members = project.members || [];

  document.getElementById('addModuleName').value = '';
  document.getElementById('addModuleDescription').value = '';
  document.getElementById('addLeaderName').value = '';
  document.getElementById('projectMemberNamesAdd').innerHTML = members
    .map((m) => '<option value="' + (m.user?.name || m.name || '') + '"></option>')
    .join('');

  document.getElementById('addModuleModal').classList.add('open');
  document.getElementById('addModuleModal').setAttribute('aria-hidden', 'false');
  setTimeout(() => document.getElementById('addModuleName')?.focus(), 100);
}

function closeAddModal() {
  document.getElementById('addModuleModal').classList.remove('open');
  document.getElementById('addModuleModal').setAttribute('aria-hidden', 'true');
}

// =============================================================
// 11. 保存 & 加载
// =============================================================

async function saveStructure() {
  const statusEl = document.getElementById('saveStatus');
  const projectCode = window.__appState.currentProjectCode;
  if (!projectCode) {
    statusEl.textContent = '请先选择项目。';
    return;
  }

  const nodes = window.__appState.nodes || [];
  const edges = window.__appState.edges || [];
  const payload = convertGraphToSavePayload(nodes, edges);

  statusEl.textContent = '保存中...';

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
    statusEl.textContent = '✅ 已保存';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  } catch (error) {
    console.error(error);
    statusEl.textContent = '❌ 保存失败';
  }
}

async function loadStructureFromAPI(projectCode) {
  const status = document.getElementById('structureStatus');
  if (!projectCode) {
    status.textContent = '请选择项目。';
    return;
  }

  status.textContent = '正在加载项目结构...';

  let success = false;

  // Try new /agent/structure endpoint first
  try {
    const response = await fetch(
      '/agent/structure/' + encodeURIComponent(projectCode)
    );
    if (response.ok) {
      const data = await response.json();
      applyGraphData(data, projectCode);
      status.textContent = '✅ 结构已加载';
      success = true;
    }
  } catch (_) { /* fall through */ }

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
      status.textContent = '✅ 结构已加载';
      success = true;
    } catch (error) {
      console.error(error);
      status.textContent = '❌ 加载失败，请确认后端服务和项目数据。';
    }
  }

  if (success) {
    document.getElementById('structureProjectSelect').value = projectCode;
    window.history.replaceState({}, '', '?projectCode=' + encodeURIComponent(projectCode));
  }
}

function applyGraphData(data, projectCode) {
  const nodes = data.nodes || [];
  const edges = data.edges || [];

  window.__appState.currentProjectCode = projectCode;
  window.__appState.nodes = nodes;
  window.__appState.edges = edges;

  if (window.__appState.setNodes) window.__appState.setNodes(nodes);
  if (window.__appState.setEdges) window.__appState.setEdges(edges);

  // Update hero
  const rootNode = nodes.find((n) => n.type === 'root');
  if (rootNode) {
    document.getElementById('structureProjectName').textContent =
      rootNode.data.title || '项目结构';
    document.getElementById('structureProjectMeta').textContent =
      '项目编码 ' + projectCode + ' · ' + (rootNode.data.description || '');
  }
}

function applyDashboardData(data, projectCode) {
  const graph = convertDashboardToGraph(data);
  window.__appState.projectData = data;
  window.__appState.currentProjectCode = projectCode;
  window.__appState.nodes = graph.nodes;
  window.__appState.edges = graph.edges;

  if (window.__appState.setNodes) window.__appState.setNodes(graph.nodes);
  if (window.__appState.setEdges) window.__appState.setEdges(graph.edges);

  // Update hero
  const project = data.project || {};
  document.getElementById('structureProjectName').textContent =
    project.name || '项目结构';
  document.getElementById('structureProjectMeta').textContent =
    '项目编码 ' +
    (projectCode || '--') +
    ' · ' +
    (project.location || '待填写地点') +
    ' · ' +
    formatShortDate(project.startDate) +
    ' - ' +
    formatShortDate(project.endDate);
  document.getElementById('backToDashboard').href =
    '/console/dashboard' +
    (projectCode ? '?projectCode=' + encodeURIComponent(projectCode) : '');
}

// =============================================================
// 12. 项目列表管理
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
    .map((project) => {
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
// 13. Bootstrap
// =============================================================

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const requestedCode = params.get('projectCode') || params.get('projectId') || '';
  const select = document.querySelector('#structureProjectSelect');
  const loadButton = document.querySelector('#loadStructureProject');

  // Render React app first (empty/placeholder state)
  renderReactApp();

  // Load project list
  try {
    const projects = await fetchProjects();
    const selectedProject =
      projects.find(
        (p) => getProjectCode(p) === requestedCode || p.id === requestedCode
      ) || projects[0];
    const selectedCode = getProjectCode(selectedProject);

    // Store project data for member datalist
    window.__appState.projectData = selectedProject
      ? { project: selectedProject }
      : null;

    renderProjectOptions(projects, selectedCode);

    // Load structure (delay to let React mount first)
    setTimeout(() => loadStructureFromAPI(selectedCode), 200);
  } catch (error) {
    console.error(error);
    document.getElementById('structureStatus').textContent =
      '❌ 项目列表加载失败，请确认后端服务。';
  }

  // ===== Event bindings =====

  // Hero: load / switch project
  loadButton.addEventListener('click', () =>
    loadStructureFromAPI(select.value.trim())
  );
  select.addEventListener('change', () =>
    loadStructureFromAPI(select.value.trim())
  );

  // Edit modal events
  document.getElementById('closeModuleEdit').addEventListener('click', closeEditModal);
  document.getElementById('cancelModuleEdit').addEventListener('click', closeEditModal);

  const editModal = document.getElementById('moduleEditModal');
  editModal.addEventListener('click', (event) => {
    if (event.target === editModal) closeEditModal();
  });

  document.getElementById('moduleEditForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const nodeId = document.getElementById('editModuleNodeId').value;
    const title = document.getElementById('editModuleName').value.trim();
    const leader = document.getElementById('editLeaderName').value.trim();
    const description = document.getElementById('editModuleDescription').value.trim();

    if (!nodeId || !title) {
      document.getElementById('structureStatus').textContent = '模块名称不能为空。';
      return;
    }

    window.__updateNodeData(nodeId, { title, leader, description });
    closeEditModal();
    document.getElementById('structureStatus').textContent = '✅ 模块已更新。';
    setTimeout(() => { document.getElementById('structureStatus').textContent = ''; }, 2500);
  });

  // Add modal events
  document.getElementById('closeAddModule').addEventListener('click', closeAddModal);
  document.getElementById('cancelAddModule').addEventListener('click', closeAddModal);

  const addModal = document.getElementById('addModuleModal');
  addModal.addEventListener('click', (event) => {
    if (event.target === addModal) closeAddModal();
  });

  document.getElementById('addModuleForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = document.getElementById('addModuleName').value.trim();
    const description = document.getElementById('addModuleDescription').value.trim();
    const leader = document.getElementById('addLeaderName').value.trim();

    if (!title) {
      alert('请输入模块名称');
      return;
    }

    window.__addNode(title, description, leader);
    closeAddModal();
    document.getElementById('structureStatus').textContent = '✅ 新模块已创建，请保存。';
    setTimeout(() => { document.getElementById('structureStatus').textContent = ''; }, 2500);
  });

  // Keyboard: Escape to close modals
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeEditModal();
      closeAddModal();
    }
  });
}

// =============================================================
// 14. 启动
// =============================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
