const statusNameMap = {
  PENDING_CONFIRMATION: '待确认',
  CONFIRMED: '已确认',
  IN_PROGRESS: '执行中',
  COMPLETED: '已完成',
  OVERDUE: '已逾期',
  CANCELLED: '已取消',
};

const roleNameMap = {
  ADMIN: '管理员',
  LEADER: '组长',
  EXECUTOR: '执行人员',
  TEMP: '临时人员',
};

let currentProjectCode = '';
let draggedModuleId = '';
let latestStructureData = null;

function getProjectCode(project) {
  return project?.code || project?.projectCode || project?.id || '';
}

function formatShortDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value));
}

function sortTasks(tasks) {
  return [...(tasks || [])].sort((a, b) => {
    const aTime = new Date(a.dueTime || a.startTime || a.createdAt || 0).getTime();
    const bTime = new Date(b.dueTime || b.startTime || b.createdAt || 0).getTime();
    return aTime - bTime;
  });
}

function taskProgress(status) {
  switch (status) {
    case 'COMPLETED':
      return 100;
    case 'IN_PROGRESS':
      return 66;
    case 'CONFIRMED':
      return 42;
    case 'PENDING_CONFIRMATION':
      return 18;
    case 'OVERDUE':
      return 74;
    default:
      return 24;
  }
}

function getInitials(name) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

function getModuleTaskList(tasks, module) {
  return (tasks || []).filter((task) => task.module?.id === module.id || task.module?.name === module.name);
}

function getModulePeople(project, module, moduleTasks) {
  const people = new Map();
  const leaderName = module?.leaderMember?.user?.name || module?.leaderMember?.name || '';

  if (leaderName) {
    people.set(leaderName, '负责人');
  }

  (moduleTasks || []).forEach((task) => {
    if (task.owner?.name) people.set(task.owner.name, '任务负责人');
    if (task.assistant?.name) people.set(task.assistant.name, '协助人');
  });

  if (!people.size) {
    (project.members || [])
      .filter((member) => member.role === 'LEADER' || member.role === 'EXECUTOR')
      .slice(0, 3)
      .forEach((member) => people.set(member.user?.name || member.name, roleNameMap[member.role] || member.role));
  }

  return [...people.entries()].slice(0, 6);
}

function getModuleStatusCounts(tasks) {
  return (tasks || []).reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});
}

function getModuleTone(moduleProgress, moduleTasks) {
  if (!moduleTasks.length) return 'quiet';
  if (moduleTasks.some((task) => task.status === 'OVERDUE' || task.priority === 'URGENT')) return 'danger';
  if (moduleProgress >= 80) return 'done';
  if (moduleProgress >= 40) return 'active';
  return 'pending';
}

function getProgressBand(progress) {
  if (progress >= 100) return 'complete';
  if (progress >= 75) return 'high';
  if (progress >= 50) return 'middle';
  if (progress >= 25) return 'low';
  return 'empty';
}

async function fetchProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) {
    throw new Error(`projects request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchDashboard(projectCode) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/dashboard`);
  if (!response.ok) {
    throw new Error(`dashboard request failed: ${response.status}`);
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
      return `<option value="${code}" ${code === selectedCode ? 'selected' : ''}>${project.name} · ${code}</option>`;
    })
    .join('');
}

function renderStats(project, modules, members, tasks) {
  const stats = document.querySelector('#structureStats');
  const completed = tasks.filter((task) => task.status === 'COMPLETED').length;
  const inProgress = tasks.filter((task) => task.status === 'IN_PROGRESS').length;
  const leaders = members.filter((member) => member.role === 'LEADER').length;

  stats.innerHTML = [
    ['模块', modules.length],
    ['成员', members.length],
    ['组长', leaders],
    ['任务', tasks.length],
    ['执行中', inProgress],
    ['已完成', completed],
  ]
    .map(
      ([label, value]) => `
        <div class="structure-stat">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join('');
}

function renderLeaders(modules) {
  const leaderList = document.querySelector('#leaderList');
  leaderList.innerHTML = modules.length
    ? modules
        .map(
          (module) => `
            <div class="leader-item">
              <span>${module.name}</span>
              <strong>${module.leaderMember?.user?.name || '待指定负责人'}</strong>
            </div>
          `,
        )
        .join('')
    : '<div class="empty">暂无模块负责人。</div>';
}

function renderStructure(data) {
  latestStructureData = data;
  const project = data.project || {};
  const modules = [...(project.modules || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const members = project.members || [];
  const tasks = sortTasks(data.tasks || []);
  const projectCode = getProjectCode(project);
  const overallProgress = tasks.length ? Math.round((tasks.filter((task) => task.status === 'COMPLETED').length / tasks.length) * 100) : 0;

  currentProjectCode = projectCode;
  document.querySelector('#structureProjectName').textContent = project.name || '项目结构';
  document.querySelector('#structureProjectMeta').textContent =
    `项目编码 ${projectCode || '--'} · ${project.location || '待填写地点'} · ${formatShortDate(project.startDate)} - ${formatShortDate(project.endDate)}`;
  document.querySelector('#backToDashboard').href = `/console/dashboard${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ''}`;

  renderStats(project, modules, members, tasks);
  renderLeaders(modules);

  const moduleMarkup = modules.length
    ? modules
        .map((module, index) => {
          const moduleTasks = getModuleTaskList(tasks, module);
          const moduleProgress = moduleTasks.length
            ? Math.round(moduleTasks.reduce((sum, task) => sum + taskProgress(task.status), 0) / moduleTasks.length)
            : 0;
          const leaderName = module.leaderMember?.user?.name || '待指定负责人';
          const people = getModulePeople(project, module, moduleTasks);
          const tone = getModuleTone(moduleProgress, moduleTasks);
          const visibleTasks = sortTasks(moduleTasks).slice(0, 3);
          const visibleTaskCount = Math.max(1, visibleTasks.length);
          const taskSpineHeight = Math.max(0, visibleTaskCount - 1) * 54;
          const branchDirection = index % 2 === 0 ? 'upper' : 'lower';

          return `
            <article class="mind-module ${tone} ${branchDirection}" draggable="true" data-module-id="${module.id}">
              <div class="mind-branch-line"></div>
              <div class="progress-dot ${getProgressBand(moduleProgress)}" style="--progress:${moduleProgress}">
                <span>${moduleProgress >= 100 ? '✓' : ''}</span>
              </div>
              <div class="mind-module-card">
                <div class="mind-module-top">
                  <div>
                    <span class="mind-index">${String(index + 1).padStart(2, '0')}</span>
                    <h4>${module.name}</h4>
                  </div>
                  <div class="mind-actions">
                    <button class="mind-edit-button" type="button" data-module-action="edit" data-module-id="${module.id}">编辑</button>
                    <span class="drag-handle">拖动</span>
                  </div>
                </div>
                <p>${module.description || '暂无模块说明。'}</p>
                <div class="mind-module-meta">
                  <span>负责人 <strong>${leaderName}</strong></span>
                  <span>进度 <strong>${moduleProgress}%</strong></span>
                  <span>任务 <strong>${moduleTasks.length}</strong></span>
                </div>
                <div class="mind-people">
                  ${
                    people.length
                      ? people
                          .map(
                            ([name, role]) => `
                              <span title="${name} · ${role}">
                                ${getInitials(name)}
                              </span>
                            `,
                          )
                          .join('')
                      : '<strong>待绑定成员</strong>'
                  }
                </div>
                <div class="mind-progress-track"><span style="width:${Math.max(4, moduleProgress)}%"></span></div>
              </div>
              <div class="mind-module-link" aria-hidden="true"></div>
              <div class="mind-task-children" style="--task-spine-height:${taskSpineHeight}px">
                ${
                  visibleTasks.length
                    ? visibleTasks
                        .map((task) => {
                          const progress = taskProgress(task.status);
                          return `
                            <div class="mind-task-node">
                              <div class="mind-task-line"></div>
                              <span class="mini-progress task-progress ${getProgressBand(progress)}" style="--progress:${progress}"></span>
                              <div class="mind-task-card">
                                <strong>${task.title}</strong>
                                <small>${statusNameMap[task.status] || task.status} · ${task.owner?.name || '未指派'}</small>
                              </div>
                            </div>
                          `;
                        })
                        .join('')
                    : '<div class="mind-task-node muted"><span class="mini-progress task-progress empty"></span><div class="mind-task-card"><strong>暂无任务节点</strong><small>等待前期录入</small></div></div>'
                }
              </div>
            </article>
          `;
        })
        .join('')
    : '<div class="empty">当前项目还没有模块。前期录入完成后，这里会自动生成模块树。</div>';

  document.querySelector('#structureTree').innerHTML = `
    <div class="mind-map">
      <div class="mind-root">
        <div class="mind-root-card">
          <span class="progress-dot ${getProgressBand(overallProgress)}" style="--progress:${overallProgress}">
            <span>${overallProgress >= 100 ? '✓' : ''}</span>
          </span>
          <div>
            <h4>${project.name || '项目根节点'}</h4>
            <p>${modules.length} 个模块 · ${members.length} 名成员 · ${tasks.length} 个任务节点</p>
          </div>
        </div>
      </div>
      <div class="mind-trunk">
        ${moduleMarkup}
      </div>
      <div class="mind-legend">
        <span><i class="mini-progress low"></i>25%</span>
        <span><i class="mini-progress middle"></i>50%</span>
        <span><i class="mini-progress high"></i>75%</span>
        <span><i class="mini-progress complete"></i>100%</span>
      </div>
      <div class="tree-save-state" id="treeSaveState">拖动模块节点可调整展示顺序，释放后自动保存。</div>
    </div>
  `;
}

function openModuleEdit(moduleId) {
  const project = latestStructureData?.project || {};
  const module = (project.modules || []).find((item) => item.id === moduleId);
  if (!module) {
    return;
  }

  document.querySelector('#editModuleId').value = module.id;
  document.querySelector('#editModuleName').value = module.name || '';
  document.querySelector('#editLeaderName').value = module.leaderMember?.user?.name || '';
  document.querySelector('#editModuleDescription').value = module.description || '';
  document.querySelector('#projectMemberNames').innerHTML = (project.members || [])
    .map((member) => `<option value="${member.user?.name || ''}"></option>`)
    .join('');
  document.querySelector('#moduleEditModal').classList.add('show');
  document.querySelector('#moduleEditModal').setAttribute('aria-hidden', 'false');
}

function closeModuleEdit() {
  document.querySelector('#moduleEditModal').classList.remove('show');
  document.querySelector('#moduleEditModal').setAttribute('aria-hidden', 'true');
}

async function saveModuleEdit() {
  const moduleId = document.querySelector('#editModuleId').value;
  const leaderName = document.querySelector('#editLeaderName').value.trim();
  const description = document.querySelector('#editModuleDescription').value.trim();
  const status = document.querySelector('#structureStatus');

  if (!currentProjectCode || !moduleId) {
    return;
  }

  status.textContent = '正在保存岗位调整...';
  const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectCode)}/modules/${encodeURIComponent(moduleId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaderName, description }),
  });

  if (!response.ok) {
    throw new Error(`module update failed: ${response.status}`);
  }

  closeModuleEdit();
  await loadStructure(currentProjectCode);
  status.textContent = '岗位调整已保存，结构图已更新。';
}

async function persistModuleOrder() {
  const state = document.querySelector('#treeSaveState');
  const moduleIds = [...document.querySelectorAll('#structureTree .mind-module')]
    .map((item) => item.dataset.moduleId)
    .filter(Boolean);

  if (!currentProjectCode || !moduleIds.length) {
    if (state) state.textContent = '暂无可保存的模块顺序。';
    return;
  }

  try {
    if (state) state.textContent = '正在保存模块顺序...';
    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectCode)}/modules/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleIds }),
    });

    if (!response.ok) {
      throw new Error(`保存失败：${response.status}`);
    }

    if (state) state.textContent = '模块顺序已保存。';
  } catch (error) {
    console.error(error);
    if (state) state.textContent = '保存失败，请稍后重试。';
  }
}

function bindDrag() {
  const tree = document.querySelector('#structureTree');
  tree.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-module-action="edit"]');
    if (!editButton) {
      return;
    }

    openModuleEdit(editButton.getAttribute('data-module-id'));
  });

  tree.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.mind-module');
    if (!card) return;

    draggedModuleId = card.dataset.moduleId || '';
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
  });

  tree.addEventListener('dragover', (event) => {
    const target = event.target.closest('.mind-module');
    if (!target || !draggedModuleId || target.dataset.moduleId === draggedModuleId) return;

    event.preventDefault();
    tree.querySelectorAll('.mind-module.over').forEach((item) => item.classList.remove('over'));
    target.classList.add('over');
  });

  tree.addEventListener('drop', async (event) => {
    const target = event.target.closest('.mind-module');
    const source = tree.querySelector(`.mind-module[data-module-id="${draggedModuleId}"]`);
    if (!target || !source || target === source) return;

    event.preventDefault();
    const targetBox = target.getBoundingClientRect();
    const insertAfter = event.clientY > targetBox.top + targetBox.height / 2;
    target.parentElement.insertBefore(source, insertAfter ? target.nextSibling : target);
    await persistModuleOrder();
  });

  tree.addEventListener('dragend', () => {
    tree.querySelectorAll('.mind-module').forEach((item) => item.classList.remove('dragging', 'over'));
    draggedModuleId = '';
  });
}

async function loadStructure(projectCode) {
  const status = document.querySelector('#structureStatus');
  if (!projectCode) {
    status.textContent = '请选择项目。';
    return;
  }

  status.textContent = '正在加载项目结构...';
  const data = await fetchDashboard(projectCode);
  renderStructure(data);
  document.querySelector('#structureProjectSelect').value = getProjectCode(data.project);
  window.history.replaceState({}, '', `?projectCode=${encodeURIComponent(getProjectCode(data.project))}`);
  status.textContent = '项目结构已加载。';
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const requestedCode = params.get('projectCode') || params.get('projectId') || '';
  const select = document.querySelector('#structureProjectSelect');
  const loadButton = document.querySelector('#loadStructureProject');
  const status = document.querySelector('#structureStatus');
  const moduleEditModal = document.querySelector('#moduleEditModal');
  const moduleEditForm = document.querySelector('#moduleEditForm');

  try {
    const projects = await fetchProjects();
    const selectedProject =
      projects.find((project) => getProjectCode(project) === requestedCode || project.id === requestedCode) ||
      projects[0];
    const selectedCode = getProjectCode(selectedProject);

    renderProjectOptions(projects, selectedCode);
    await loadStructure(selectedCode);
  } catch (error) {
    console.error(error);
    status.textContent = '项目结构加载失败，请确认后端服务和项目数据。';
  }

  loadButton.addEventListener('click', () => loadStructure(select.value.trim()));
  select.addEventListener('change', () => loadStructure(select.value.trim()));
  document.querySelector('#closeModuleEdit').addEventListener('click', closeModuleEdit);
  document.querySelector('#cancelModuleEdit').addEventListener('click', closeModuleEdit);
  moduleEditModal.addEventListener('click', (event) => {
    if (event.target === moduleEditModal) {
      closeModuleEdit();
    }
  });
  moduleEditForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveModuleEdit();
    } catch (error) {
      console.error(error);
      status.textContent = '岗位调整保存失败，请稍后重试。';
    }
  });
  bindDrag();
}

bootstrap();
