const statusNameMapMobile = {
  PENDING_CONFIRMATION: '待确认',
  CONFIRMED: '已确认',
  IN_PROGRESS: '执行中',
  COMPLETED: '已完成',
  OVERDUE: '已逾期',
  CANCELLED: '已取消',
};

const eventStatusMapMobile = {
  pending_review: '待确认',
  confirmed: '已确认',
  in_progress: '执行中',
  completed: '已完成',
  rejected: '已驳回',
  cancelled: '已取消',
  needs_more_info: '需补充',
};

const sourceTypeMapMobile = {
  feishu: '飞书',
  wechat_import: '微信',
  app_report: 'App',
  manual: '手动',
  dingtalk: '钉钉',
  wecom: '企微',
};

let currentMobileProjectCode = '';

function getProjectCodeMobile(project) {
  return project?.code || project?.id || '';
}

function formatMobileDate(value) {
  if (!value) return '未排期';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getTaskActions(task) {
  const actions = [];

  if (task.status === 'PENDING_CONFIRMATION') {
    actions.push(['confirm', '确认收到', 'primary']);
  }

  if (task.status === 'CONFIRMED' || task.status === 'PENDING_CONFIRMATION') {
    actions.push(['start', '开始执行', 'primary']);
  }

  if (task.status === 'IN_PROGRESS' || task.status === 'CONFIRMED') {
    actions.push(['complete', '完成任务', 'primary']);
  }

  if (task.status !== 'COMPLETED' && task.status !== 'CANCELLED') {
    actions.push(['help', '申请协助', 'ghost']);
  }

  return actions;
}

async function updateTaskStatus(taskId, action) {
  const endpointMap = {
    confirm: 'confirm',
    start: 'start',
    complete: 'complete',
  };
  const endpoint = endpointMap[action];
  if (!endpoint) {
    throw new Error('未知任务动作');
  }

  const response = await fetch(
    `/api/projects/${encodeURIComponent(currentMobileProjectCode)}/tasks/${encodeURIComponent(taskId)}/${endpoint}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        toStatus:
          action === 'confirm'
            ? 'CONFIRMED'
            : action === 'start'
              ? 'IN_PROGRESS'
              : 'COMPLETED',
        content: `手机端执行动作：${action}`,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`task action failed: ${response.status}`);
  }
}

async function requestHelp(taskId, taskTitle) {
  const reason = window.prompt('请输入需要协助的原因', '现场需要协助，请项目经理协调人员。');
  if (!reason || !reason.trim()) {
    throw new Error('已取消申请协助');
  }

  const response = await fetch(`/api/projects/${encodeURIComponent(currentMobileProjectCode)}/events/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      eventType: 'help_request',
      title: `申请协助：${taskTitle}`,
      description: reason.trim(),
      confidence: 1,
      sourceType: 'app_report',
      sourceChannel: 'mobile_app_demo',
      sourceSender: '现场执行端',
      sourceSenderRole: 'staff',
      rawContent: reason.trim(),
      visibilityScope: 'admin',
      proposedChanges: {
        taskId,
        reason: reason.trim(),
        action: 'request_help',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`help request failed: ${response.status}`);
  }
}

async function fetchMobileData(projectCode) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/dashboard`);
  if (!response.ok) {
    throw new Error(`mobile dashboard failed: ${response.status}`);
  }
  return response.json();
}

async function fetchLatestProjectCode() {
  const response = await fetch('/api/projects');
  if (!response.ok) {
    throw new Error(`projects failed: ${response.status}`);
  }
  const projects = await response.json();
  return getProjectCodeMobile(projects[0]);
}

function renderMobile(data) {
  const project = data.project || {};
  const tasks = data.tasks || [];
  const events = data.events || [];
  const pendingEvents = data.pendingEvents || [];
  const modules = project.modules || [];

  document.querySelector('#mobileProjectName').textContent = project.name || '现场任务';
  document.querySelector('#mobileProjectMeta').textContent =
    `${project.code || '--'} · ${project.location || '地点待补充'} · ${tasks.length} 个任务`;
  document.querySelector('#taskCount').textContent = tasks.length;
  document.querySelector('#eventCount').textContent = events.length;
  document.querySelector('#moduleCount').textContent = modules.length;

  document.querySelector('#mobileStats').innerHTML = [
    ['任务', tasks.length],
    ['待确认', pendingEvents.length],
    ['模块', modules.length],
  ]
    .map(
      ([label, value]) => `
        <div class="stat-pill">
          <strong>${value}</strong>
          <span>${label}</span>
        </div>
      `,
    )
    .join('');

  document.querySelector('#mobileTasks').innerHTML = tasks.length
    ? tasks
        .map(
          (task) => `
            <article class="mobile-card">
              <h3>${task.title}</h3>
              <p>${task.description || '暂无任务说明，等待项目经理补充。'}</p>
              <div class="meta-row">
                <span class="tag hot">${statusNameMapMobile[task.status] || task.status}</span>
                <span class="tag">${task.module?.name || '项目级任务'}</span>
                <span class="tag">负责人 ${task.owner?.name || '未指派'}</span>
                <span class="tag">截止 ${formatMobileDate(task.dueTime)}</span>
              </div>
              <div class="task-actions">
                ${getTaskActions(task)
                  .map(
                    ([action, label, tone]) =>
                      `<button class="${tone}" type="button" data-task-action="${action}" data-task-id="${task.id}" data-task-title="${task.title}">${label}</button>`,
                  )
                  .join('')}
              </div>
            </article>
          `,
        )
        .join('')
    : '<div class="empty-mobile">当前没有分配到任务。AI事件确认后，任务会出现在这里。</div>';

  document.querySelector('#mobileEvents').innerHTML = events.length
    ? events
        .slice(0, 12)
        .map(
          (event) => `
            <article class="mobile-card">
              <h3>${event.title}</h3>
              <p>${event.description || event.rawContent || '暂无事件说明'}</p>
              <div class="meta-row">
                <span class="tag hot">${eventStatusMapMobile[event.status] || event.status}</span>
                <span class="tag">${sourceTypeMapMobile[event.sourceType] || event.sourceType}</span>
                <span class="tag">发送人 ${event.sourceSender || '未记录'}</span>
              </div>
            </article>
          `,
        )
        .join('')
    : '<div class="empty-mobile">暂无事件流。</div>';

  document.querySelector('#mobileModules').innerHTML = modules.length
    ? modules
        .map(
          (module) => `
            <article class="mobile-card">
              <h3>${module.name}</h3>
              <p>${module.description || '暂无模块说明'}</p>
              <div class="meta-row">
                <span class="tag green">${module.status || 'PENDING'}</span>
                <span class="tag">排序 ${module.sortOrder || 0}</span>
              </div>
            </article>
          `,
        )
        .join('')
    : '<div class="empty-mobile">当前项目还没有模块，前期录入后会自动生成。</div>';
}

function setupTabs() {
  document.querySelector('#mobileTabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;

    const tab = button.getAttribute('data-tab');
    document.querySelectorAll('#mobileTabs button').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    document.querySelector(`#tab-${tab}`).classList.add('active');
  });
}

function setupTaskActions() {
  document.querySelector('#mobileTasks').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-task-action]');
    if (!button) return;

    const action = button.getAttribute('data-task-action');
    const taskId = button.getAttribute('data-task-id');
    const taskTitle = button.getAttribute('data-task-title') || '未命名任务';

    button.disabled = true;
    button.textContent = '处理中...';

    try {
      if (action === 'help') {
        await requestHelp(taskId, taskTitle);
      } else {
        await updateTaskStatus(taskId, action);
      }

      renderMobile(await fetchMobileData(currentMobileProjectCode));
    } catch (error) {
      window.alert(error?.message || '操作失败，请稍后再试。');
    }
  });
}

async function bootstrapMobile() {
  setupTabs();
  setupTaskActions();
  const params = new URLSearchParams(window.location.search);
  const projectCode = params.get('projectCode') || (await fetchLatestProjectCode());
  currentMobileProjectCode = projectCode;
  const data = await fetchMobileData(projectCode);
  renderMobile(data);

  window.setInterval(async () => {
    try {
      renderMobile(await fetchMobileData(projectCode));
    } catch {
      // Demo polling only; keep current screen if network hiccups.
    }
  }, 3000);
}

bootstrapMobile().catch((error) => {
  document.querySelector('#mobileProjectMeta').textContent = error?.message || '加载失败';
});
