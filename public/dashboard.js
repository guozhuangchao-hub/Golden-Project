;

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

const priorityNameMap = {
  LOW: '低优先级',
  MEDIUM: '普通',
  HIGH: '高优先级',
  URGENT: '紧急',
};

const stateTone = {
  ACTIVE: '执行中',
  DRAFT: '筹备中',
  COMPLETED: '已结束',
  CANCELLED: '已取消',
};

const feishuStatusMap = {
  PENDING: '待确认',
  APPROVED: '已确认',
  REJECTED: '已驳回',
  APPLIED: '已写回',
};

const eventStatusMap = {
  pending_review: '待确认',
  confirmed: '已确认',
  in_progress: '执行中',
  completed: '已完成',
  rejected: '已驳回',
  cancelled: '已取消',
  needs_more_info: '需补充',
};

const sourceTypeMap = {
  feishu: '飞书',
  wechat_import: '微信导入',
  app_report: 'App上报',
  manual: '手动录入',
  dingtalk: '钉钉',
  wecom: '企微',
};

const visibilityScopeMap = {
  admin: '管理层',
  module_leader: '组长',
  staff: '正式人员',
  part_time: '兼职',
  temp_worker: '临时工',
};

function formatDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value));
}

function formatClock(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function toCountMap(items, keyName) {
  return (items || []).reduce((acc, item) => {
    acc[item[keyName]] = item._count._all;
    return acc;
  }, {});
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    case 'CANCELLED':
      return 0;
    default:
      return 24;
  }
}

function getTaskDayLabel(task) {
  const source = task.dueTime || task.startTime || task.createdAt;
  if (!source) return '未排期';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(source));
}

function sortTasks(tasks) {
  return [...(tasks || [])].sort((a, b) => {
    const aTime = new Date(a.dueTime || a.startTime || a.createdAt || 0).getTime();
    const bTime = new Date(b.dueTime || b.startTime || b.createdAt || 0).getTime();
    return aTime - bTime;
  });
}

function groupTasksByDay(tasks) {
  return sortTasks(tasks).reduce((groups, task) => {
    const key = getTaskDayLabel(task);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(task);
    return groups;
  }, {});
}

function getPriorityLabel(priority) {
  return priorityNameMap[priority] || '普通';
}

function getPriorityTone(priority) {
  switch (priority) {
    case 'URGENT':
      return 'urgent';
    case 'HIGH':
      return 'high';
    case 'LOW':
      return 'low';
    default:
      return 'medium';
  }
}

function getFeishuStatusTone(status) {
  switch (status) {
    case 'APPLIED':
      return 'applied';
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    default:
      return 'pending';
  }
}

function getFeishuTasks(proposedTasks) {
  return Array.isArray(proposedTasks) ? proposedTasks : [];
}

function getEventTask(event) {
  return event?.proposedChanges?.task || event?.proposedChanges || {};
}

function formatConfidence(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return '--';
  }

  return `${Math.round(numeric * 100)}%`;
}

function getConfidenceWidth(value) {
  const numeric = Number(value || 0);
  return Math.max(6, Math.min(100, Math.round(numeric * 100)));
}

function renderEventPipeline(eventStats, pendingEvents) {
  const pendingCount = eventStats.pending_review || pendingEvents.length || 0;
  const steps = [
    ['pending_review', '待确认', pendingCount, 'AI识别后等待人工处理'],
    ['confirmed', '已确认', eventStats.confirmed || 0, '已通过人工确认'],
    ['in_progress', '执行中', eventStats.in_progress || 0, '已进入现场跟进'],
    ['completed', '已完成', eventStats.completed || 0, '事件闭环完成'],
    ['rejected', '已驳回', eventStats.rejected || 0, '重复/无效/无需处理'],
  ];

  const pipeline = document.querySelector('#eventPipeline');
  if (!pipeline) {
    return;
  }

  pipeline.innerHTML = steps
    .map(
      ([key, label, value, note]) => `
        <article class="pipeline-step ${value ? 'active' : ''} ${key === 'rejected' ? 'rejected' : ''}">
          <div class="pipeline-label">${label}</div>
          <div class="pipeline-value">${value}</div>
          <div class="pipeline-note">${note}</div>
        </article>
      `,
    )
    .join('');
}

function getProjectCode(project) {
  return project?.code || project?.projectCode || project?.id || '';
}

function resolveProjectCode(projects, identifier) {
  if (!identifier) {
    return '';
  }

  const match = (projects || []).find((project) => project.id === identifier || project.code === identifier);
  return getProjectCode(match) || identifier;
}

let currentProjectCode = '';
let pollingTimer = null;
let latestDashboardData = null;
let draggedModuleId = '';
let structureDragBound = false;
let isStructureDragging = false;
let publishRecipientMode = 'single';
let selectedPublishMemberIds = new Set();
let latestPublishPreview = null;
let customerServiceMessages = [];
const CUSTOMER_SERVICE_STORAGE_KEY = 'golden-project:customer-service-history';

function getProjectMembers(data) {
  return (data?.project?.members || []).filter((member) => member?.id);
}

function getMemberName(member) {
  return member?.user?.name || member?.name || '未命名成员';
}

function getPublishRecipients() {
  const members = getProjectMembers(latestDashboardData);
  if (publishRecipientMode === 'all') {
    return members;
  }

  return members.filter((member) => selectedPublishMemberIds.has(member.id));
}

function updatePublishButtons() {
  const text = document.querySelector('#publishTaskText')?.value.trim() || '';
  const translateButton = document.querySelector('#translateTaskPublish');
  const confirmButton = document.querySelector('#confirmTaskPublish');
  const hasRecipients = publishRecipientMode === 'all' || selectedPublishMemberIds.size > 0;
  const canTranslate = Boolean(currentProjectCode && text && hasRecipients);

  if (translateButton) {
    translateButton.disabled = !canTranslate;
  }
  if (confirmButton) {
    confirmButton.disabled = !canTranslate || !latestPublishPreview;
  }
}

function setTaskPublishStatus(message) {
  const status = document.querySelector('#taskPublishStatus');
  if (status) {
    status.textContent = message;
  }
}

function renderPublishPreview(preview) {
  const container = document.querySelector('#publishPreview');
  if (!container) {
    return;
  }

  if (!preview) {
    container.classList.remove('has-result');
    container.classList.add('visible');
    container.innerHTML = '<div class="publish-preview-empty">AI 转译结果会固定显示在这里，完成转译后可直接手动调整字段。</div>';
    updatePublishButtons();
    return;
  }

  const recipients = (preview.recipients || []).map((recipient) => recipient.name).join('、') || '未选择';
  container.classList.add('visible');
  container.classList.add('has-result');
  container.innerHTML = `
    <div class="publish-preview-title">
      <span>AI 转译结果</span>
      <input id="publishPreviewTitle" value="${escapeHtml(preview.title || '未命名任务')}" maxlength="200" />
    </div>
    <div class="publish-preview-grid">
      <label>
        <span>模块</span>
        <input id="publishPreviewModule" value="${escapeHtml(preview.moduleName || '项目级任务')}" maxlength="100" />
      </label>
      <label>
        <span>对象</span>
        <input id="publishPreviewRecipients" value="${escapeHtml(recipients)}" maxlength="200" />
      </label>
      <label>
        <span>负责人</span>
        <input id="publishPreviewOwner" value="${escapeHtml(preview.ownerName || '待指定负责人')}" maxlength="100" />
      </label>
      <label>
        <span>优先级</span>
        <select id="publishPreviewPriority">
          <option value="LOW" ${preview.priority === 'LOW' ? 'selected' : ''}>低优先级</option>
          <option value="MEDIUM" ${preview.priority === 'MEDIUM' ? 'selected' : ''}>普通</option>
          <option value="HIGH" ${preview.priority === 'HIGH' ? 'selected' : ''}>高优先级</option>
          <option value="URGENT" ${preview.priority === 'URGENT' ? 'selected' : ''}>紧急</option>
        </select>
      </label>
      <label>
        <span>截止</span>
        <input id="publishPreviewDueTime" type="datetime-local" value="${escapeHtml(formatDateTimeLocal(preview.dueTime))}" />
      </label>
    </div>
  `;
  updatePublishButtons();
}

function getEditedPublishPreview() {
  if (!latestPublishPreview) {
    return null;
  }

  const title = document.querySelector('#publishPreviewTitle')?.value.trim() || latestPublishPreview.title;
  const moduleName = document.querySelector('#publishPreviewModule')?.value.trim() || latestPublishPreview.moduleName;
  const ownerName = document.querySelector('#publishPreviewOwner')?.value.trim() || latestPublishPreview.ownerName;
  const priority = document.querySelector('#publishPreviewPriority')?.value || latestPublishPreview.priority;
  const dueValue = document.querySelector('#publishPreviewDueTime')?.value || '';
  const dueTime = dueValue ? new Date(dueValue).toISOString() : latestPublishPreview.dueTime;
  const moduleId = moduleName === latestPublishPreview.moduleName ? latestPublishPreview.moduleId : undefined;

  return {
    ...latestPublishPreview,
    title,
    moduleId,
    moduleName,
    ownerName,
    priority,
    dueTime,
  };
}

function renderTaskPublisher(data) {
  const ''Tabs = document.querySelector('#publishModeTabs');
  const summary = document.querySelector('#publishRecipientSummary');
  const list = document.querySelector('#publishRecipientList');
  if (!''Tabs || !summary || !list) {
    return;
  }

  const members = getProjectMembers(data);
  const validIds = new Set(members.map((member) => member.id));
  selectedPublishMemberIds = new Set([...selectedPublishMemberIds].filter((id) => validIds.has(id)));

  if (publishRecipientMode === 'single' && !selectedPublishMemberIds.size && members[0]) {
    selectedPublishMemberIds.add(members[0].id);
  }

  ''Tabs.querySelectorAll('[data-publish-'']').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-publish-''') === publishRecipientMode);
  });

  const recipients = publishRecipientMode === 'all' ? members : getPublishRecipients();
  if (!members.length) {
    summary.textContent = '将发送给：请先加载真实项目并录入成员';
  } else if (publishRecipientMode === 'all') {
    summary.textContent = `将发送给：全体成员（${members.length} 人）`;
  } else if (recipients.length) {
    summary.textContent = `将发送给：${recipients.map(getMemberName).join('、')}`;
  } else {
    summary.textContent = '将发送给：未选择';
  }

  list.innerHTML = members.length
    ? members
        .map((member) => {
          const selected = publishRecipientMode === 'all' || selectedPublishMemberIds.has(member.id);
          const disabled = publishRecipientMode === 'all';
          return `
            <button
              class="publish-recipient-chip ${selected ? 'selected' : ''}"
              type="button"
              data-publish-member-id="${escapeHtml(member.id)}"
              ${disabled ? 'disabled' : ''}
            >
              <strong>${escapeHtml(getMemberName(member))}</strong>
              <span>${escapeHtml(roleNameMap[member.role] || member.role || '成员')}</span>
            </button>
          `;
        })
        .join('')
    : '<div class="empty compact-empty">当前没有可发布对象。加载真实项目后会显示项目成员。</div>';

  const preview = document.querySelector('#publishPreview');
  if (preview && !preview.innerHTML.trim()) {
    renderPublishPreview(null);
  }
  updatePublishButtons();
}

function getCustomerServiceProjectKey() {
  return currentProjectCode || '';
}

function getDefaultCustomerServiceMessages() {
  return [
    {
      role: 'assistant',
      content: '我在这个项目里待命。你可以问我今天先做什么、有哪些风险、哪些群消息需要确认。',
    },
  ];
}

function readCustomerServiceStore() {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_SERVICE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCustomerServiceStore(store) {
  try {
    window.localStorage.setItem(CUSTOMER_SERVICE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore local storage failures
  }
}

function persistCustomerServiceMessages() {
  const store = readCustomerServiceStore();
  store[getCustomerServiceProjectKey()] = customerServiceMessages;
  writeCustomerServiceStore(store);
}

function renderCustomerServiceMessages() {
  const windowEl = document.querySelector('#customerServiceWindow');
  if (!windowEl) {
    return;
  }

  windowEl.innerHTML = customerServiceMessages
    .map(
      (message) => `<div class="customer-message ${message.role}">
        <span>${message.role === 'user' ? '你' : '客服'}</span>
        <p>${escapeHtml(message.content)}</p>
      </div>`,
    )
    .join('');
  windowEl.scrollTop = windowEl.scrollHeight;
}

function syncCustomerServiceMessages() {
  const store = readCustomerServiceStore();
  const projectKey = getCustomerServiceProjectKey();
  const storedMessages = store[projectKey];
  customerServiceMessages =
    Array.isArray(storedMessages) && storedMessages.length
      ? storedMessages.filter((message) => message && typeof message.role === 'string' && typeof message.content === 'string')
      : getDefaultCustomerServiceMessages();

  persistCustomerServiceMessages();
  renderCustomerServiceMessages();
}

function appendCustomerServiceMessage(role, content) {
  if (!content) {
    return;
  }

  customerServiceMessages.push({ role, content });
  persistCustomerServiceMessages();
  renderCustomerServiceMessages();
}

function setCustomerServiceOpen(open) {
  const widget = document.querySelector('#customerServiceWidget');
  const dialog = document.querySelector('#customerServiceDialog');
  const launcher = document.querySelector('#customerServiceLauncher');
  if (!widget || !dialog || !launcher) {
    return;
  }

  widget.classList.toggle('open', open);
  dialog.setAttribute('aria-hidden', open ? 'false' : 'true');
  launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    document.querySelector('#customerServiceInput')?.focus();
  }
}

function buildAgentReply(question) {
  const data = latestDashboardData;
  const tasks = sortTasks(data.tasks || data.overdueTasks || []);
  const eventStats = toCountMap(data.eventStats || [], 'status');
  const pendingCount = eventStats.pending_review || (data.pendingEvents || []).length || 0;
  const overdueTasks = tasks.filter((task) => task.status === 'OVERDUE');
  const highTasks = tasks.filter((task) => task.priority === 'URGENT' || task.priority === 'HIGH');
  const nextTask = tasks.find((task) => task.status !== 'COMPLETED') || tasks[0];
  const normalized = question.trim();

  if (/风险|逾期|危险/.test(normalized)) {
    return `当前有 ${overdueTasks.length} 个逾期节点、${highTasks.length} 个高优先节点。建议先看「${nextTask?.title || '暂无下一节点'}」，再处理事件列表里的 ${pendingCount} 个待确认事件。`;
  }

  if (/今天|下一步|优先|先做/.test(normalized)) {
    return nextTask
      ? `建议先推进「${nextTask.title}」，负责人 ${nextTask.owner?.name || '未指派'}，截止 ${formatDate(nextTask.dueTime)}。`
      : '当前没有排在前面的待处理节点，可以先补充任务或查看事件列表。';
  }

  if (/事件|确认/.test(normalized)) {
    return `事件列表里当前待确认 ${pendingCount} 个。已确认和已发布事件会继续留在列表下方，方便追溯。`;
  }

  return `我已读取当前项目：共有 ${tasks.length} 个任务、${pendingCount} 个待确认事件、${highTasks.length} 个高优先节点。你可以继续问“今天先做什么”或“最高风险是什么”。`;
}

async function askCustomerAgent(question, options = {}) {
  const {
    provider = 'codex',
    sessionId = 'dashboard',
    fallbackToBuiltin = true,
  } = options;

  if (!currentProjectCode) {
    return buildAgentReply(question);
  }

  const response = await fetch(
    `/api/integrations/agents/projects/${encodeURIComponent(currentProjectCode)}/customer-service/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        sessionId,
        message: question,
        includeProjectContext: true,
        timeoutSeconds: 30,
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.reason || payload.message || `Agent request failed: ${response.status}`);
  }

  if (payload.reply) {
    return payload.reply;
  }

  if (fallbackToBuiltin) {
    return buildAgentReply(question);
  }

  throw new Error('agent_empty_reply');
}

function getPublishPayload() {
  const text = document.querySelector('#publishTaskText')?.value.trim() || '';
  const payload = {
    text,
    recipientMode: publishRecipientMode,
  };

  if (publishRecipientMode !== 'all') {
    payload.recipientMemberIds = [...selectedPublishMemberIds];
  }

  return payload;
}

async function translateTaskPublish() {
  if (!currentProjectCode) {
    throw new Error('请先加载真实项目');
  }

  const payload = getPublishPayload();
  if (!payload.text) {
    throw new Error('请先输入任务描述');
  }
  if (publishRecipientMode !== 'all' && !payload.recipientMemberIds.length) {
    throw new Error('请先选择发布对象');
  }

  const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectCode)}/tasks/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`AI 转译失败：${response.status}`);
  }

  latestPublishPreview = await response.json();
  renderPublishPreview(latestPublishPreview);
  setTaskPublishStatus('已完成 AI 转译，确认无误后可以发布到任务与小程序通知队列。');
}

async function confirmTaskPublish() {
  if (!latestPublishPreview) {
    throw new Error('请先完成 AI 转译');
  }

  const editedPreview = getEditedPublishPreview();
  const payload = {
    ...getPublishPayload(),
    title: editedPreview.title,
    moduleId: editedPreview.moduleId,
    moduleName: editedPreview.moduleName,
    priority: editedPreview.priority,
    dueTime: editedPreview.dueTime,
  };

  const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectCode)}/tasks/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`任务发布失败：${response.status}`);
  }

  const result = await response.json();
  latestPublishPreview = null;
  renderPublishPreview(null);
  document.querySelector('#publishTaskText').value = '';
  setTaskPublishStatus(`已发布「${result.task?.title || '新任务'}」，并写入 ${result.notificationsCreated || 0} 条微信小程序通知。`);
  await loadDashboard(currentProjectCode);
}

function getModuleTaskList(tasks, module) {
  return (tasks || []).filter((task) => {
    if (!module) return false;
    return task.module?.id === module.id || task.module?.name === module.name;
  });
}

function getModulePeople(project, module, moduleTasks) {
  const people = new Map();
  const leaderName = module?.leaderMember?.user?.name || module?.leaderMember?.name || module?.leaderMember?.user?.name || '';

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
      .forEach((member) => people.set(getMemberName(member), roleNameMap[member.role] || member.role));
  }

  return [...people.entries()].slice(0, 5);
}

function getInitials(name) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

function getModuleStatusCounts(tasks) {
  return (tasks || []).reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    {},
  );
}

function getModuleTone(moduleProgress, moduleTasks) {
  if (!moduleTasks.length) {
    return 'quiet';
  }

  if (moduleTasks.some((task) => task.status === 'OVERDUE' || task.priority === 'URGENT')) {
    return 'danger';
  }

  if (moduleProgress >= 80) {
    return 'done';
  }

  if (moduleProgress >= 40) {
    return 'active';
  }

  return 'pending';
}

function renderProjectStructure(project, modules, tasks) {
  const container = document.querySelector('#projectStructureTree');
  if (!container) {
    return;
  }

  const projectCode = getProjectCode(project) || '--';
  const members = project.members || [];
  const sortedModules = [...(modules || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const overallProgress = tasks.length
    ? Math.round((tasks.filter((task) => task.status === 'COMPLETED').length / tasks.length) * 100)
    : 0;

  const moduleMarkup = sortedModules.length
    ? sortedModules
        .map((module, index) => {
          const moduleTasks = getModuleTaskList(tasks, module);
          const moduleCompleted = moduleTasks.filter((task) => task.status === 'COMPLETED').length;
          const moduleProgress = moduleTasks.length ? Math.round((moduleCompleted / moduleTasks.length) * 100) : 0;
          const leaderName = module.leaderMember?.user?.name || module.leaderMember?.name || '待指定负责人';
          const people = getModulePeople(project, module, moduleTasks);
          const nextTask = sortTasks(moduleTasks).find((task) => task.status !== 'COMPLETED') || sortTasks(moduleTasks)[0];
          const statusCounts = getModuleStatusCounts(moduleTasks);
          const tone = getModuleTone(moduleProgress, moduleTasks);
          const visibleTasks = sortTasks(moduleTasks).slice(0, 3);

          return `
            <article class="tree-module ${tone}" draggable="true" data-module-id="${module.id}">
              <div class="tree-module-head">
                <div class="tree-index">${String(index + 1).padStart(2, '0')}</div>
                <div>
                  <h4>${module.name}</h4>
                  <p>${module.description || '暂无模块说明，项目经理可在前期录入中补充。'}</p>
                </div>
                <span class="drag-handle">拖动</span>
              </div>
              <div class="tree-module-overview">
                <div>
                  <span>负责人</span>
                  <strong>${leaderName}</strong>
                </div>
                <div>
                  <span>完成度</span>
                  <strong>${moduleProgress}%</strong>
                </div>
                <div>
                  <span>节点</span>
                  <strong>${moduleTasks.length}</strong>
                </div>
              </div>
              <div class="tree-children">
                <div class="tree-child-row people-row">
                  <span>人员</span>
                  <div class="tree-avatars">
                    ${
                      people.length
                        ? people
                            .map(
                              ([name, role]) => `
                                <span class="tree-avatar" title="${name} · ${role}">
                                  ${getInitials(name)}
                                </span>
                              `,
                            )
                            .join('')
                        : '<strong>待绑定成员</strong>'
                    }
                  </div>
                  ${
                    people.length
                      ? `<span>${people.map(([name, role]) => `${name} ${role}`).join(' / ')}</span>`
                      : ''
                  }
                </div>
                <div class="tree-child-row status-row">
                  <span>状态</span>
                  <strong>${statusCounts.IN_PROGRESS || 0} 执行中</strong>
                  <span>${statusCounts.CONFIRMED || 0} 已确认</span>
                  <span>${statusCounts.PENDING_CONFIRMATION || 0} 待确认</span>
                  <span>${statusCounts.COMPLETED || 0} 已完成</span>
                </div>
                <div class="tree-child-row task-row">
                  <span>下一项</span>
                  <strong>${nextTask?.title || '待录入'}</strong>
                </div>
                <div class="tree-task-stack">
                  ${
                    visibleTasks.length
                      ? visibleTasks
                          .map(
                            (task) => `
                              <div class="tree-task-pill ${task.status === 'OVERDUE' ? 'danger' : ''}">
                                <span>${statusNameMap[task.status] || task.status}</span>
                                <strong>${task.title}</strong>
                              </div>
                            `,
                          )
                          .join('')
                      : '<div class="tree-task-pill muted"><span>空</span><strong>暂无任务节点</strong></div>'
                  }
                </div>
              </div>
              <div class="module-progress"><span style="width: ${Math.max(10, moduleProgress)}%"></span></div>
            </article>
          `;
        })
        .join('')
    : '<div class="empty">当前项目还没有模块。前期录入完成后，这里会自动生成模块树。</div>';

  container.innerHTML = `
    <div class="tree-root">
      <div>
        <h4>${project.name || '项目根节点'}</h4>
        <p>项目编码 ${projectCode} · ${project.location || '待填写地点'} · ${formatShortDate(project.startDate)} - ${formatShortDate(project.endDate)}</p>
      </div>
      <div class="tree-root-stats">
        <span><strong>${sortedModules.length}</strong>模块</span>
        <span><strong>${members.length}</strong>成员</span>
        <span><strong>${(tasks || []).length}</strong>任务</span>
        <span><strong>${overallProgress}%</strong>完成</span>
      </div>
      <div class="tree-save-state" id="treeSaveState">拖动模块卡片可调整展示顺序，释放后自动保存。</div>
    </div>
    <div class="tree-modules">${moduleMarkup}</div>
  `;

  setupStructureDrag();
}

function setupStructureDrag() {
  if (structureDragBound) {
    return;
  }

  const container = document.querySelector('#projectStructureTree');
  if (!container) {
    return;
  }

  structureDragBound = true;

  container.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.tree-module');
    if (!card) return;

    draggedModuleId = card.dataset.moduleId || '';
    isStructureDragging = true;
    stopEventPolling();
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragover', (event) => {
    const target = event.target.closest('.tree-module');
    if (!target || !draggedModuleId || target.dataset.moduleId === draggedModuleId) return;

    event.preventDefault();
    container.querySelectorAll('.tree-module.over').forEach((item) => item.classList.remove('over'));
    target.classList.add('over');
  });

  container.addEventListener('drop', async (event) => {
    const target = event.target.closest('.tree-module');
    const source = container.querySelector(`.tree-module[data-module-id="${draggedModuleId}"]`);

    if (!target || !source || target === source) return;
    event.preventDefault();

    const targetBox = target.getBoundingClientRect();
    const insertAfter = event.clientY > targetBox.top + targetBox.height / 2;
    target.parentElement.insertBefore(source, insertAfter ? target.nextSibling : target);
    await persistModuleOrder();
  });

  container.addEventListener('dragend', () => {
    container.querySelectorAll('.tree-module').forEach((item) => item.classList.remove('dragging', 'over'));
    draggedModuleId = '';
    isStructureDragging = false;
    if (currentProjectCode) {
      startEventPolling();
    }
  });
}

async function persistModuleOrder() {
  const state = document.querySelector('#treeSaveState');
  const moduleIds = [...document.querySelectorAll('#projectStructureTree .tree-module')]
    .map((item) => item.dataset.moduleId)
    .filter(Boolean);

  if (!currentProjectCode || !moduleIds.length || currentProjectCode === 'none') {
    if (state) state.textContent = '演示数据不会保存排序。';
    return;
  }

  try {
    if (state) state.textContent = '正在保存模块顺序...';
    const response = await fetch(`/api/projects/${currentProjectCode}/modules/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleIds }),
    });

    if (!response.ok) {
      throw new Error(`保存失败：${response.status}`);
    }

    if (state) state.textContent = '模块顺序已保存，dashboard 将按新顺序展示。';
  } catch (error) {
    console.error(error);
    if (state) state.textContent = '保存失败，请稍后重试。';
  }
}

function render(data) {
  const taskMap = toCountMap(data.taskStats || [], 'status');
  const memberMap = toCountMap(data.memberStats || [], 'role');
  const project = data.project || {};
  const modules = project.modules || [];
  const tasks = data.tasks || data.overdueTasks || [];
  const feishuProposals = data.feishuProposals || [];
  const eventList = data.events || data.pendingEvents || [];
  const pendingEvents = data.pendingEvents || eventList.filter((event) => event.status === 'pending_review');
  const eventStats = toCountMap(data.eventStats || [], 'status');
  const orderedTasks = sortTasks(tasks);
  const groupedTasks = groupTasksByDay(tasks);
  const activeTasks = orderedTasks.filter((task) => task.status !== 'COMPLETED');
  const focusTasks = (activeTasks.length ? activeTasks : orderedTasks).slice(0, 3);
  const urgentTasks = orderedTasks.filter(
    (task) => task.status === 'OVERDUE' || task.priority === 'URGENT' || task.priority === 'HIGH',
  );

  const totalMembers = Object.values(memberMap).reduce((sum, value) => sum + value, 0);
  const totalTasks = Object.values(taskMap).reduce((sum, value) => sum + value, 0);
  const completedTasks = taskMap.COMPLETED || 0;
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const overdueCount = taskMap.OVERDUE || data.overdueTasks?.length || 0;
  const nextTask = orderedTasks[0] || null;
  const projectCode = getProjectCode(project) || '--';

  document.querySelector('#projectName').textContent = project.name || '项目流程总览';
  document.querySelector('#projectMeta').textContent =
    `${stateTone[project.status] || '未设置状态'} · 项目编码 ${projectCode} · ${project.location || '待填写地点'} · ${formatShortDate(project.startDate)} - ${formatShortDate(project.endDate)}`;
  document.querySelector('#heroMode').textContent = 'LIVE DATA MODE';

  const metrics = [
    {
      label: '项目进度',
      value: `${completionRate}%`,
      note: `${completedTasks} 个任务已闭环`,
    },
    {
      label: '流程节点',
      value: orderedTasks.length,
      note: `${modules.length} 个模块串起流程`,
    },
    {
      label: '现场成员',
      value: totalMembers,
      note: `${memberMap.TEMP || 0} 名临时人员`,
    },
    {
      label: '待确认事件',
      value: eventStats.pending_review || pendingEvents.length || 0,
      note: 'AI识别后等待人工确认',
    },
  ];

  document.querySelector('#heroMetrics').innerHTML = metrics
    .map(
      (item) => `
      <article class="metric">
        <div class="metric-label">${item.label}</div>
        <div class="metric-value">${item.value}</div>
        <div class="metric-note">${item.note}</div>
      </article>
    `,
    )
    .join('');

  document.querySelector('#flowSummary').innerHTML = `
    <div class="summary-pill"><strong>${orderedTasks.length}</strong><span>流程节点</span></div>
    <div class="summary-pill"><strong>${completionRate}%</strong><span>整体完成率</span></div>
    <div class="summary-pill"><strong>${overdueCount}</strong><span>逾期节点</span></div>
    <div class="summary-pill"><strong>${modules.length}</strong><span>项目模块</span></div>
  `;

  document.querySelector('#focusStrip').innerHTML = focusTasks.length
    ? focusTasks
        .map(
          (task) => `
            <article class="focus-card ${task.status === 'OVERDUE' ? 'danger' : ''}">
              <div class="focus-card-top">
                <div>
                  <div class="focus-label">下一个节点</div>
                  <h4>${task.title}</h4>
                </div>
                <span class="focus-badge ${getPriorityTone(task.priority)}">${getPriorityLabel(task.priority)}</span>
              </div>
              <div class="focus-meta">
                <span class="chip">${task.module?.name || '项目级任务'}</span>
                <span class="chip">负责人 ${task.owner?.name || '未指派'}</span>
                <span class="chip">截止 ${formatDate(task.dueTime)}</span>
              </div>
              <div class="focus-foot">
                <span>协助 ${task.assistant?.name || '无'}</span>
                <strong>${formatClock(task.dueTime || task.startTime || task.createdAt)}</strong>
              </div>
            </article>
          `,
        )
        .join('')
    : '<div class="empty focus-empty">当前没有可推进的节点，项目经理可以先补充任务。</div>';

  document.querySelector('#roadmap').innerHTML = Object.entries(groupedTasks)
    .map(([dayLabel, dayTasks], dayIndex) => {
      const dayProgress =
        dayTasks.reduce((sum, task) => sum + taskProgress(task.status), 0) / dayTasks.length;

      return `
        <section class="day-group">
          <div class="day-rail">
            <div class="day-index">${String(dayIndex + 1).padStart(2, '0')}</div>
            <div class="day-line"></div>
          </div>
          <div class="day-content">
            <div class="day-header">
              <div>
                <h4>${dayLabel}</h4>
                <p>当天安排 ${dayTasks.length} 个节点，整体推进约 ${Math.round(dayProgress)}%。</p>
              </div>
              <div class="day-badge">${dayTasks.length} 节点</div>
            </div>
            <div class="flow-list">
              ${dayTasks
                .map((task, index) => {
                  const progress = taskProgress(task.status);
                  return `
                    <article class="flow-node ${task.status === 'OVERDUE' ? 'danger' : ''} ${index % 2 ? 'alt' : ''}">
                      <div class="flow-node-head">
                        <div>
                          <div class="flow-time">${formatDate(task.startTime || task.dueTime || task.createdAt)}</div>
                          <h5>${task.title}</h5>
                          <div class="flow-subline">
                            <span>负责人 ${task.owner?.name || '未指派'}</span>
                            <span>协助 ${task.assistant?.name || '无'}</span>
                          </div>
                        </div>
                        <span class="status-tag">${statusNameMap[task.status] || task.status}</span>
                      </div>
                      <div class="flow-meta">
                        <span class="chip">${task.module?.name || '项目级任务'}</span>
                        <span class="chip">优先级 ${getPriorityLabel(task.priority)}</span>
                        <span class="chip">截止 ${formatDate(task.dueTime)}</span>
                        <span class="chip">时间 ${formatClock(task.startTime || task.dueTime || task.createdAt)}</span>
                      </div>
                      <p class="flow-note">${task.description || '暂无任务描述，等待项目经理补充。'}</p>
                      <div class="flow-progress">
                        <div class="flow-progress-bar"><span style="width:${progress}%"></span></div>
                        <div class="flow-progress-text">${progress}%</div>
                      </div>
                    </article>
                  `;
                })
                .join('')}
            </div>
          </div>
        </section>
      `;
    })
    .join('');

  document.querySelector('#taskStatus').innerHTML = [
    ['pending_review', '待确认'],
    ['confirmed', '已确认'],
    ['in_progress', '执行中'],
    ['completed', '已完成'],
    ['rejected', '已驳回'],
    ['cancelled', '已取消'],
  ]
    .map(
      ([key, label]) => `
      <article class="status-card ${key === 'rejected' ? 'alert' : ''}">
        <span>${label}</span>
        <strong>${key === 'pending_review' ? eventStats[key] || pendingEvents.length || 0 : eventStats[key] || 0}</strong>
      </article>
    `,
    )
    .join('');

  document.querySelector('#members').innerHTML = Object.entries(roleNameMap)
    .map(
      ([key, label]) => `
      <article class="status-card">
        <span>${label}</span>
        <strong>${memberMap[key] || 0}</strong>
      </article>
    `,
    )
    .join('');

  renderProjectStructure(project, modules, orderedTasks);

  document.querySelector('#signals').innerHTML = [
    {
      title: '关键节点优先级更清晰',
      description: `当前有 ${urgentTasks.length} 个高优先或逾期节点，建议按流程图从前往后逐个确认。`,
      level: 'medium',
    },
    {
      title: '临时工编成可视化',
      description: `目前临时人员共 ${memberMap.TEMP || 0} 名，适合重点对照签到、物料和接送节点。`,
      level: 'low',
    },
    {
      title: '逾期节点预警',
      description: `${overdueCount} 个节点处于逾期或高风险状态，建议在流程图中继续靠前展示。`,
      level: 'high',
    },
    {
      title: '下一节点提醒',
      description: nextTask
        ? `下一条节点是「${nextTask.title}」，负责人 ${nextTask.owner?.name || '未指派'}，截止时间 ${formatDate(nextTask.dueTime)}。`
        : '当前没有排在最前面的待处理节点。',
      level: 'low',
    },
  ]
    .map(
      (item) => `
      <article class="signal-item">
        <div class="signal-row">
          <h4>${item.title}</h4>
          <span class="signal-state ${item.level}">${item.level}</span>
        </div>
        <p>${item.description}</p>
      </article>
    `,
    )
    .join('');

  renderTaskPublisher(data);
  renderEventPipeline(eventStats, pendingEvents);
  document.querySelector('#pendingEvents').innerHTML = eventList.length
    ? eventList
        .map((event) => {
          const proposedTask = getEventTask(event);
          const confidence = formatConfidence(event.confidence);
          const confidenceWidth = getConfidenceWidth(event.confidence);
          const isPending = event.status === 'pending_review';

          return `
            <article class="feishu-item">
              <div class="feishu-head">
                <div>
                  <h4>${event.title}</h4>
                  <div class="feishu-summary">${event.description || event.rawContent || '暂无事件说明'}</div>
                </div>
                <span class="feishu-status ${event.status}">${eventStatusMap[event.status] || event.status}</span>
              </div>
              <div class="confidence-bar"><span style="width:${confidenceWidth}%"></span></div>
              <div class="feishu-meta">
                <span class="chip">来源 ${sourceTypeMap[event.sourceType] || event.sourceType}</span>
                <span class="chip">置信度 ${confidence}</span>
                <span class="chip">发送人 ${event.sourceSender || '未记录'}</span>
                <span class="chip">可见 ${visibilityScopeMap[event.visibilityScope] || event.visibilityScope || '管理层'}</span>
              </div>
              <div class="feishu-preview">
                <div class="feishu-preview-item">
                  <strong>${proposedTask.title || event.title || '未命名事项'}</strong>
                  <span>${proposedTask.moduleName || '未匹配模块'} · ${proposedTask.ownerName || '待指定负责人'} · ${proposedTask.priority || 'MEDIUM'}</span>
                </div>
                <div class="feishu-preview-item">
                  <strong>原始内容</strong>
                  <span>${event.rawContent || '暂无原文'}</span>
                </div>
              </div>
              ${
                isPending
                  ? `<div class="event-actions">
                      <button class="button primary" type="button" data-event-action="confirm-task" data-event-id="${event.id}">确认入库</button>
                      <button class="button secondary" type="button" data-event-action="confirm-edit" data-event-id="${event.id}">修改确认</button>
                      <button class="button secondary" type="button" data-event-action="duplicate" data-event-id="${event.id}">任务重复</button>
                      <button class="button tertiary" type="button" data-event-action="more-info" data-event-id="${event.id}">补充信息</button>
                      <button class="button danger" type="button" data-event-action="reject" data-event-id="${event.id}">驳回</button>
                    </div>`
                  : `<div class="event-actions locked">
                      <span class="chip">${eventStatusMap[event.status] || event.status}</span>
                      <span class="chip">${event.confirmedAt ? `确认 ${formatDate(event.confirmedAt)}` : `更新 ${formatDate(event.updatedAt || event.createdAt)}`}</span>
                    </div>`
              }
              <div class="feishu-foot">
                <span>${isPending ? '待确认事件需要项目经理处理。' : '事件已进入正式流程，继续保留在全量事件列表中。'}</span>
                <strong>${formatDate(event.createdAt)}</strong>
              </div>
            </article>
          `;
        })
        .join('')
    : '<div class="empty">当前项目还没有事件。后续飞书、微信、App 或手动录入的内容会进入这里统一展示。</div>';
}

async async function fetchProjects() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('/api/projects', { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error('request failed: ' + response.status);
    }
    const projects = await response.json();
    return Array.isArray(projects) ? projects : [];
  } catch(e) {
    return [];
  }
}

async function createProject(projectName) {
  const response = await fetch('/api/projects/bootstrap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: projectName }),
  });

  if (!response.ok) {
    let message = `create project failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message) {
        message = Array.isArray(payload.message) ? payload.message.join('，') : String(payload.message);
      }
    } catch {
      // ignore parse failure
    }
    throw new Error(message);
  }

  return response.json();
}

async function loadDashboard(projectId) {
  if (!projectId) {
    render({
  project: { modules: [], members: [] },
  tasks: [],
  events: [],
  pendingEvents: [],
  eventQueue: [],
});
    currentProjectCode = '';
    syncCustomerServiceMessages();
    stopEventPolling();
    return;
  }

  const response = await fetch(`/api/projects/${projectId}/dashboard`);
  if (!response.ok) {
    throw new Error(`dashboard request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data?.project) {
    throw new Error('project not found');
  }

  render(data, 'live');
  latestDashboardData = data;
  currentProjectCode = projectId;
  syncCustomerServiceMessages();
  startEventPolling();
}

function formatDateTimeLocal(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function openEventReviewModal(eventId) {
  const event = [
    ...(latestDashboardData?.events || []),
    ...(latestDashboardData?.pendingEvents || []),
    ...({
  project: { modules: [], members: [] },
  tasks: [],
  events: [],
  pendingEvents: [],
  eventQueue: [],
}.events || []),
    ...({
  project: { modules: [], members: [] },
  tasks: [],
  events: [],
  pendingEvents: [],
  eventQueue: [],
}.pendingEvents || []),
  ].find((item) => item.id === eventId);
  if (!event) {
    throw new Error('未找到要确认的事件');
  }

  const proposedTask = getEventTask(event);
  document.querySelector('#reviewEventId').value = event.id;
  document.querySelector('#reviewTaskTitle').value = proposedTask.title || event.title || '';
  document.querySelector('#reviewModuleName').value = proposedTask.moduleName || '';
  document.querySelector('#reviewPriority').value = proposedTask.priority || 'MEDIUM';
  document.querySelector('#reviewOwnerName').value = proposedTask.ownerName || '';
  document.querySelector('#reviewAssistantName').value = proposedTask.assistantName || '';
  document.querySelector('#reviewDueTime').value = formatDateTimeLocal(proposedTask.dueTime);
  document.querySelector('#reviewDescription').value = proposedTask.description || event.description || '';
  document.querySelector('#reviewRawContent').innerHTML = `
    <strong>原始内容：</strong>${event.rawContent || '暂无原文'}<br />
    <strong>来源：</strong>${sourceTypeMap[event.sourceType] || event.sourceType} ·
    <strong>置信度：</strong>${formatConfidence(event.confidence)}
  `;
  document.querySelector('#eventReviewModal').classList.add('open');
  document.querySelector('#eventReviewModal').setAttribute('aria-hidden', 'false');
  stopEventPolling();
}

function closeEventReviewModal() {
  document.querySelector('#eventReviewModal').classList.remove('open');
  document.querySelector('#eventReviewModal').setAttribute('aria-hidden', 'true');
  startEventPolling();
}

function getOverviewData() {
  return latestDashboardData;
}

function renderOverviewEvents(data) {
  const eventMap = new Map();
  [...(data.pendingEvents || []), ...(data.events || [])].forEach((event) => {
    if (event?.id) {
      eventMap.set(event.id, event);
    }
  });
  const statusOrder = {
    pending_review: 0,
    needs_more_info: 1,
    confirmed: 2,
    in_progress: 3,
    completed: 4,
    rejected: 5,
    cancelled: 6,
  };
  const events = [...eventMap.values()].sort((a, b) => {
    const aRank = statusOrder[a.status] ?? 9;
    const bRank = statusOrder[b.status] ?? 9;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  if (!events.length) {
    return '<div class="empty">当前项目还没有 Event。新的飞书、微信、App 或手动录入事项会先进入这里。</div>';
  }

  return events
    .map((event) => {
      const proposedTask = getEventTask(event);
      const title = proposedTask.title || event.title || '未命名事项';
      const meta = [
        sourceTypeMap[event.sourceType] || event.sourceType || '未知来源',
        eventStatusMap[event.status] || event.status || '待确认',
        `置信度 ${formatConfidence(event.confidence)}`,
        `创建 ${formatDate(event.createdAt)}`,
      ].filter(Boolean);

      return `
        <article class="overview-detail-item event-${escapeHtml(event.status || 'unknown')}">
          <div class="overview-detail-item-head">
            <div>
              <span class="overview-detail-kicker">Event Task</span>
              <h4>${escapeHtml(title)}</h4>
            </div>
            <span class="overview-detail-status">${escapeHtml(eventStatusMap[event.status] || event.status || '待确认')}</span>
          </div>
          <p>${escapeHtml(event.description || event.rawContent || '暂无事件说明')}</p>
          <div class="overview-detail-meta">
            ${meta.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}
            <span class="chip">模块 ${escapeHtml(proposedTask.moduleName || '未匹配')}</span>
            <span class="chip">负责人 ${escapeHtml(proposedTask.ownerName || '待指定')}</span>
            <span class="chip">优先级 ${escapeHtml(getPriorityLabel(proposedTask.priority))}</span>
          </div>
          ${
            event.rawContent
              ? `<div class="overview-detail-source"><strong>原始内容</strong><span>${escapeHtml(event.rawContent)}</span></div>`
              : ''
          }
        </article>
      `;
    })
    .join('');
}

function renderOverviewPeople(data) {
  const members = data.project?.members || [];
  const memberStats = toCountMap(data.memberStats || [], 'role');

  if (!members.length) {
    const stats = Object.entries(roleNameMap)
      .map(([role, label]) => ({ role, label, count: memberStats[role] || 0 }))
      .filter((item) => item.count > 0);

    return stats.length
      ? stats
          .map(
            (item) => `
              <article class="overview-detail-item compact">
                <div class="overview-detail-item-head">
                  <div>
                    <span class="overview-detail-kicker">People Ops</span>
                    <h4>${escapeHtml(item.label)}</h4>
                  </div>
                  <span class="overview-detail-status">${item.count} 人</span>
                </div>
                <p>当前接口只返回角色统计，成员明细可在前期录入或项目结构中继续补齐。</p>
              </article>
            `,
          )
          .join('')
      : '<div class="empty">当前项目还没有成员数据。前期录入完成后，这里会显示人员明细。</div>';
  }

  return members
    .map((member) => {
      const name = getMemberName(member);
      const role = roleNameMap[member.role] || member.role || '成员';
      const moduleName = member.module?.name || member.moduleName || member.department || '项目组';
      const contact = member.user?.phone || member.user?.email || member.phone || member.email || '暂无联系方式';

      return `
        <article class="overview-detail-item people">
          <div class="overview-detail-avatar">${escapeHtml(getInitials(name))}</div>
          <div>
            <div class="overview-detail-item-head inline">
              <h4>${escapeHtml(name)}</h4>
              <span class="overview-detail-status">${escapeHtml(role)}</span>
            </div>
            <p>${escapeHtml(moduleName)} · ${escapeHtml(contact)}</p>
          </div>
        </article>
      `;
    })
    .join('');
}

function openOverviewDetailModal(type) {
  const modal = document.querySelector('#overviewDetailModal');
  const title = document.querySelector('#overviewDetailTitle');
  const eyebrow = document.querySelector('#overviewDetailEyebrow');
  const subtitle = document.querySelector('#overviewDetailSubtitle');
  const list = document.querySelector('#overviewDetailList');
  const data = getOverviewData();

  if (type === 'people') {
    eyebrow.textContent = 'People Ops';
    title.textContent = '人员列表';
    subtitle.textContent = '查看当前项目的管理层、组长、执行人员和临时人员。';
    list.innerHTML = renderOverviewPeople(data);
  } else {
    eyebrow.textContent = 'Event View';
    title.textContent = '事件任务列表';
    subtitle.textContent = '查看当前项目 AI 识别的事件、处理状态与拟生成任务。';
    list.innerHTML = renderOverviewEvents(data);
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  stopEventPolling();
}

function closeOverviewDetailModal() {
  const modal = document.querySelector('#overviewDetailModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  startEventPolling();
}

function stopEventPolling() {
  if (pollingTimer) {
    window.clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

function startEventPolling() {
  stopEventPolling();
  if (!currentProjectCode) {
    return;
  }

  pollingTimer = window.setInterval(async () => {
    try {
      await loadDashboard(currentProjectCode);
      const status = document.querySelector('#loadStatus');
      if (status) {
        status.textContent = `已自动刷新 AI 事件队列：${new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}`;
      }
    } catch {
      stopEventPolling();
    }
  }, 3000);
}

async function reviewEvent(eventId, action) {
  if (!currentProjectCode) {
    throw new Error('请先选择项目');
  }

  let endpoint = `/api/projects/${encodeURIComponent(currentProjectCode)}/events/${encodeURIComponent(eventId)}`;
  let body = {};

  if (action === 'confirm-task') {
    openEventReviewModal(eventId);
    return;
  } else if (action === 'confirm-edit') {
    openEventReviewModal(eventId);
    return;
  } else if (action === 'reject') {
    const reason = window.prompt('请输入驳回原因，例如：重复任务 / 已完成 / 信息错误 / 无需处理');
    if (!reason || !reason.trim()) {
      throw new Error('驳回必须填写原因，已取消。');
    }
    endpoint += '/reject';
    body = { comment: reason.trim() };
  } else if (action === 'duplicate') {
    const confirmed = window.confirm('确认将该事件标记为“任务重复”并驳回吗？');
    if (!confirmed) {
      throw new Error('已取消任务重复标记。');
    }
    endpoint += '/reject';
    body = { comment: '任务重复，已存在相同或相近任务，无需重复生成。' };
  } else if (action === 'more-info') {
    endpoint += '/needs-more-info';
    body = { comment: '项目经理要求补充信息' };
  } else {
    throw new Error('未知事件操作');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`event review failed: ${response.status}`);
  }

  await loadDashboard(currentProjectCode);
}

async function submitEventReview() {
  if (!currentProjectCode) {
    throw new Error('请先选择项目');
  }

  const eventId = document.querySelector('#reviewEventId').value;
  const task = {
    title: document.querySelector('#reviewTaskTitle').value.trim(),
    moduleName: document.querySelector('#reviewModuleName').value.trim(),
    ownerName: document.querySelector('#reviewOwnerName').value.trim(),
    assistantName: document.querySelector('#reviewAssistantName').value.trim(),
    priority: document.querySelector('#reviewPriority').value,
    dueTime: document.querySelector('#reviewDueTime').value
      ? new Date(document.querySelector('#reviewDueTime').value).toISOString()
      : undefined,
    description: document.querySelector('#reviewDescription').value.trim(),
  };

  if (!eventId || !task.title) {
    throw new Error('请填写任务标题');
  }

  const response = await fetch(
    `/api/projects/${encodeURIComponent(currentProjectCode)}/events/${encodeURIComponent(eventId)}/confirm`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        proposedChanges: { task },
        createTask: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`event confirm failed: ${response.status}`);
  }

  closeEventReviewModal();
  await loadDashboard(currentProjectCode);
}

async function seedDemoEvents(projectCode) {
  if (!projectCode) {
    throw new Error('请先选择一个项目');
  }

  const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/events/demo-seed`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`seed demo events failed: ${response.status}`);
  }

  await loadDashboard(projectCode);
}

function renderProjectOptions(projects, selectedProjectId = '') {
  const select = document.querySelector('#projectSelect');
  const quickProjects = document.querySelector('#quickProjects');

  if (!projects.length) {
    select.innerHTML = '<option value="">暂无项目</option>';
    quickProjects.innerHTML = '';
    return;
  }

  select.innerHTML = [
    '<option value="">请选择项目</option>',
    ...projects.map(
      (project) =>
        `<option value="${getProjectCode(project)}" ${getProjectCode(project) === selectedProjectId ? 'selected' : ''}>${project.name} · ${getProjectCode(project) || '未生成编码'}</option>`,
    ),
  ].join('');

  quickProjects.innerHTML = projects
    .slice(0, 3)
    .map(
      (project) => `
      <button class="quick-project" type="button" data-project-code="${getProjectCode(project)}">
        ${project.name} · ${getProjectCode(project) || '未生成编码'}
      </button>
    `,
    )
    .join('');
}

function syncProjectInputs(projectCode) {
  const select = document.querySelector('#projectSelect');
  if (select) {
    select.value = projectCode || '';
  }
}

async function loadLatestProjectDashboard() {
  const projects = await fetchProjects();
  const latestProject = projects[0] ?? null;
  const latestProjectCode = getProjectCode(latestProject);
  if (!latestProjectCode) {
    throw new Error('no projects found');
  }

  renderProjectOptions(projects, latestProjectCode);
  syncProjectInputs(latestProjectCode);
  await loadDashboard(latestProjectCode);
  window.history.replaceState({}, '', `?projectCode=${encodeURIComponent(latestProjectCode)}`);
  return latestProjectCode;
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const rawProjectIdentifier = params.get('projectCode') || params.get('projectId') || '';
  const select = document.querySelector('#projectSelect');
  const form = document.querySelector('#loadForm');
  const createProjectButton = document.querySelector('#createProject');
  const deleteProjectButton = document.querySelector('#deleteProject');
  const openIntakeWorkbookButton = document.querySelector('#openIntakeWorkbook');
  const openProjectStructureButton = document.querySelector('#openProjectStructure');
  const openProjectFilesButton = document.querySelector('#openProjectFiles');
  const pendingEventsContainer = document.querySelector('#pendingEvents');
  const eventReviewModal = document.querySelector('#eventReviewModal');
  const eventReviewForm = document.querySelector('#eventReviewForm');
  const closeEventReviewButton = document.querySelector('#closeEventReview');
  const cancelEventReviewButton = document.querySelector('#cancelEventReview');
  const overviewDetailModal = document.querySelector('#overviewDetailModal');
  const closeOverviewDetailButton = document.querySelector('#closeOverviewDetail');
  const status = document.querySelector('#loadStatus');
  const quickProjects = document.querySelector('#quickProjects');
  const publishModeTabs = document.querySelector('#publishModeTabs');
  const publishRecipientList = document.querySelector('#publishRecipientList');
  const publishTaskText = document.querySelector('#publishTaskText');
  const translateTaskPublishButton = document.querySelector('#translateTaskPublish');
  const confirmTaskPublishButton = document.querySelector('#confirmTaskPublish');
  const customerServiceLauncher = document.querySelector('#customerServiceLauncher');
  const customerServiceClose = document.querySelector('#customerServiceClose');
  const customerServiceForm = document.querySelector('#customerServiceForm');
  const customerServiceInput = document.querySelector('#customerServiceInput');

  renderEmpty();
  syncCustomerServiceMessages();
  renderProjectOptions([], '');
  status.textContent = '请先创建或选择项目，点击加载按钮。';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const projectCode = select.value.trim();
    if (!projectCode) {
      status.textContent = '请先选择项目。';
      return;
    }
    status.textContent = '正在加载项目数据...';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(function(){ controller.abort(); status.textContent = '加载超时，请重试。'; }, 10000);
      
      await loadDashboard(projectCode);
      clearTimeout(timeoutId);
      
      syncProjectInputs(projectCode);
      status.textContent = '已载入项目 ' + (select.selectedOptions[0]?.textContent || projectCode);
      window.history.replaceState({}, '', '?projectCode=' + encodeURIComponent(projectCode));
    } catch(e) {
      if (status.textContent !== '加载超时，请重试。') {
        status.textContent = '加载失败: ' + (e.message || '未知错误');
      }
      renderEmpty();
    }
  });

  select.addEventListener('change', async () => {
    const projectCode = select.value.trim();
    if (!projectCode) {
      return;
    }

    status.textContent = '正在切换项目...';
    try {
      await loadDashboard(projectCode);
      syncProjectInputs(projectCode);
      status.textContent = `已切换到项目 ${select.selectedOptions[0]?.textContent || projectCode}。`;
      window.history.replaceState({}, '', `?projectCode=${encodeURIComponent(projectCode)}`);
    } catch {
      status.textContent = '项目切换失败，当前保持原页面。';
    }
  });

  quickProjects.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-project-code]');
    if (!target) {
      return;
    }

    const projectCode = target.getAttribute('data-project-code');
    if (!projectCode) {
      return;
    }

    status.textContent = '正在切换项目...';
    try {
      await loadDashboard(projectCode);
      syncProjectInputs(projectCode);
      status.textContent = `已切换到项目 ${target.textContent || projectCode}。`;
      window.history.replaceState({}, '', `?projectCode=${encodeURIComponent(projectCode)}`);
    } catch {
      status.textContent = '项目切换失败，当前保持原页面。';
    }
  });

    syncProjectInputs('');
    render({
  project: { modules: [], members: [] },
  tasks: [],
  events: [],
  pendingEvents: [],
  eventQueue: [],
});
    stopEventPolling();
    status.textContent = '已切回演示数据。';
    window.history.replaceState({}, '', window.location.pathname);
  });

  openProjectStructureButton?.addEventListener('click', () => {
    const projectCode = select.value.trim() || currentProjectCode || getProjectCode(latestDashboardData?.project);
    const query = projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : '';
    window.location.href = `/console/structure${query}`;
  });

  openProjectFilesButton?.addEventListener('click', () => {
    const projectCode = select.value.trim() || currentProjectCode || getProjectCode(latestDashboardData?.project);
    const query = projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : '';
    window.location.href = `/console/files${query}`;
  });

  publishModeTabs?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-publish-'']');
    if (!target) {
      return;
    }

    publishRecipientMode = target.getAttribute('data-publish-''') || 'single';
    latestPublishPreview = null;
    renderPublishPreview(null);

    const members = getProjectMembers(latestDashboardData);
    if (publishRecipientMode === 'single') {
      const firstSelected = [...selectedPublishMemberIds].find((id) => members.some((member) => member.id === id));
      selectedPublishMemberIds = new Set(firstSelected ? [firstSelected] : members[0] ? [members[0].id] : []);
    }

    renderTaskPublisher(latestDashboardData);
    setTaskPublishStatus('发布对象已更新，请重新 AI 转译后再确认发布。');
  });

  publishRecipientList?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-publish-member-id]');
    if (!target || publishRecipientMode === 'all') {
      return;
    }

    const memberId = target.getAttribute('data-publish-member-id');
    if (!memberId) {
      return;
    }

    if (publishRecipientMode === 'single') {
      selectedPublishMemberIds = new Set([memberId]);
    } else if (selectedPublishMemberIds.has(memberId)) {
      selectedPublishMemberIds.delete(memberId);
    } else {
      selectedPublishMemberIds.add(memberId);
    }

    latestPublishPreview = null;
    renderPublishPreview(null);
    renderTaskPublisher(latestDashboardData);
    setTaskPublishStatus('发布对象已更新，请重新 AI 转译后再确认发布。');
  });

  publishTaskText?.addEventListener('input', () => {
    latestPublishPreview = null;
    renderPublishPreview(null);
    setTaskPublishStatus('任务描述已更新，请点击 AI 转译生成发布预览。');
  });

  translateTaskPublishButton?.addEventListener('click', async () => {
    setTaskPublishStatus('正在 AI 转译任务...');
    try {
      await translateTaskPublish();
    } catch (error) {
      latestPublishPreview = null;
      renderPublishPreview(null);
      setTaskPublishStatus(error?.message || 'AI 转译失败，请稍后再试。');
    }
  });

  confirmTaskPublishButton?.addEventListener('click', async () => {
    setTaskPublishStatus('正在发布任务并写入小程序通知...');
    try {
      await confirmTaskPublish();
    } catch (error) {
      setTaskPublishStatus(error?.message || '任务发布失败，请稍后再试。');
    }
  });

  customerServiceLauncher?.addEventListener('click', () => {
    const widget = document.querySelector('#customerServiceWidget');
    setCustomerServiceOpen(!widget?.classList.contains('open'));
  });

  customerServiceClose?.addEventListener('click', () => {
    setCustomerServiceOpen(false);
  });

  customerServiceForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = customerServiceInput?.value.trim() || '';
    if (!question) {
      return;
    }

    appendCustomerServiceMessage('user', question);
    customerServiceInput.value = '';
    try {
      const reply = await askCustomerAgent(question, {
        provider: 'codex',
        sessionId: 'customer-service-widget',
        fallbackToBuiltin: true,
      });
      appendCustomerServiceMessage('assistant', reply);
    } catch (error) {
      appendCustomerServiceMessage('assistant', `${error?.message || '客服暂时不可用'}。先给你本地判断：${buildAgentReply(question)}`);
    }
  });

  document.querySelectorAll('[data-overview-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      openOverviewDetailModal(button.getAttribute('data-overview-dialog'));
    });
  });

  pendingEventsContainer.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-event-action]');
    if (!target) {
      return;
    }

    const action = target.getAttribute('data-event-action');
    const eventId = target.getAttribute('data-event-id');
    if (!action || !eventId) {
      return;
    }

    status.textContent = '正在处理 AI 事件...';

    try {
      await reviewEvent(eventId, action);
      status.textContent = '事件已处理，dashboard 已刷新。';
    } catch (error) {
      status.textContent = error?.message || '事件处理失败，请稍后再试。';
    }
  });

  closeEventReviewButton.addEventListener('click', closeEventReviewModal);
  cancelEventReviewButton.addEventListener('click', closeEventReviewModal);
  eventReviewModal.addEventListener('click', (event) => {
    if (event.target === eventReviewModal) {
      closeEventReviewModal();
    }
  });

  closeOverviewDetailButton.addEventListener('click', closeOverviewDetailModal);
  overviewDetailModal.addEventListener('click', (event) => {
    if (event.target === overviewDetailModal) {
      closeOverviewDetailModal();
    }
  });

  eventReviewForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '正在确认事件并生成正式任务...';

    try {
      await submitEventReview();
      status.textContent = '事件已确认入库，正式任务已进入时间与进度流程图。';
    } catch (error) {
      status.textContent = error?.message || '确认入库失败，请稍后再试。';
    }
  });

  createProjectButton.addEventListener('click', async () => {
    const projectName = window.prompt('请输入新项目名称');
    if (!projectName || !projectName.trim()) {
      status.textContent = '已取消新增项目。';
      return;
    }

    const trimmedName = projectName.trim();
    status.textContent = `正在创建项目「${trimmedName}」...`;

    try {
      const created = await createProject(trimmedName);
      const projects = await fetchProjects();
      const createdProjectCode = created.project?.code || created.project?.projectCode || '';
      renderProjectOptions(projects, createdProjectCode);
      syncProjectInputs(createdProjectCode);
      await loadDashboard(createdProjectCode);
      status.textContent = `已创建项目「${trimmedName}」，项目编码为 ${createdProjectCode || '--'}，模板已放入 ${created.folderName}。`;
      window.history.replaceState({}, '', `?projectCode=${encodeURIComponent(createdProjectCode)}`);
    } catch (error) {
      status.textContent = error?.message || '新增项目失败，请稍后再试。';
      render({
  project: { modules: [], members: [] },
  tasks: [],
  events: [],
  pendingEvents: [],
  eventQueue: [],
});
    }
  });

  openIntakeWorkbookButton.addEventListener('click', () => {
    const projectCode = select.value.trim();
    if (!projectCode) {
      status.textContent = '请先选择一个项目，再进行信息录入。';
      return;
    }
    window.location.href = '/agent/intake/' + encodeURIComponent(projectCode);
  });

  deleteProjectButton.addEventListener('click', async () => {
    const projectCode = select.value.trim();
    if (!projectCode) {
      status.textContent = '请先选择一个项目，再执行删除。';
      return;
    }

    const projectLabel = select.selectedOptions[0]?.textContent || projectCode;
    const confirmed = window.confirm(`删除项目会同时清除数据库和项目文件夹，是否继续删除「${projectLabel}」？`);
    if (!confirmed) {
      status.textContent = '已取消删除。';
      return;
    }

    const password = window.prompt('请输入删除密码');
    if (!password) {
      status.textContent = '已取消删除。';
      return;
    }

    status.textContent = `正在删除项目「${projectLabel}」...`;

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        let message = `delete project failed: ${response.status}`;
        try {
          const payload = await response.json();
          if (payload?.message) {
            message = Array.isArray(payload.message) ? payload.message.join('，') : String(payload.message);
          }
        } catch {
          // ignore parse failure
        }
        throw new Error(message);
      }

      const result = await response.json();
      const projects = await fetchProjects();
      const nextProject = projects[0] || null;
      const nextProjectCode = getProjectCode(nextProject);

      renderProjectOptions(projects, nextProjectCode);

      if (nextProjectCode) {
        syncProjectInputs(nextProjectCode);
        await loadDashboard(nextProjectCode);
        window.history.replaceState({}, '', `?projectCode=${encodeURIComponent(nextProjectCode)}`);
        status.textContent = `已删除项目「${projectLabel}」，当前自动切换到 ${nextProjectCode}。`;
      } else {
        syncProjectInputs('');
        render({
  project: { modules: [], members: [] },
  tasks: [],
  events: [],
  pendingEvents: [],
  eventQueue: [],
});
        window.history.replaceState({}, '', window.location.pathname);
        status.textContent = `已删除项目「${projectLabel}」，当前没有可用项目，已切回演示数据。`;
      }

      if (result?.removedFolderPath) {
        status.textContent += ` 项目文件夹已清理。`;
      }
    } catch (error) {
      status.textContent = error?.message || '删除项目失败，请稍后再试。';
    }
  });

  if (rawProjectIdentifier) {
    try {
      status.textContent = '正在自动加载项目数据...';
      await loadDashboard(rawProjectIdentifier);
      status.textContent = `已载入项目 ${select.selectedOptions[0]?.textContent || rawProjectIdentifier} 的 dashboard 数据。`;
    } catch {
      render({
  project: { modules: [], members: [] },
  tasks: [],
  events: [],
  pendingEvents: [],
  eventQueue: [],
});
      status.textContent = '自动加载失败，已展示演示数据。';
    }
  } else {
    try {
      status.textContent = '正在查找最新项目...';
      const latestProjectCode = await loadLatestProjectDashboard();
      status.textContent = `已自动载入最新项目 ${latestProjectCode} 的 dashboard 数据。`;
    } catch {
      render({
  project: { modules: [], members: [] },
  tasks: [],
  events: [],
  pendingEvents: [],
  eventQueue: [],
});
      status.textContent = '当前展示演示数据，可通过项目下拉切换到真实接口。';
    }
  }
}

bootstrap();
