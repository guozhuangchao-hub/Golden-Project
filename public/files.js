const fileCategoryMap = {
  plans: { label: '方案资料', note: '方案、策划、计划类文件' },
  spreadsheets: { label: '表格', note: 'Excel、CSV 和清单数据' },
  documents: { label: '文档', note: 'Word、Markdown、文本文件' },
  presentations: { label: '演示', note: 'PPT 和汇报材料' },
  pdfs: { label: 'PDF', note: '正式版、扫描件和导出文件' },
  images: { label: '图片', note: '现场图、设计图和素材' },
  others: { label: '其他', note: '未归类活动文件' },
};

let currentProjectCode = '';
let latestFileData = null;
let activeCategory = 'all';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getProjectCode(project) {
  return project?.code || project?.projectCode || project?.id || '';
}

function formatDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function fetchProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) {
    throw new Error(`projects request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchProjectFiles(projectCode) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/files`);
  if (!response.ok) {
    throw new Error(`project files request failed: ${response.status}`);
  }
  return response.json();
}

async function openProjectFile(filePath) {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(currentProjectCode)}/files/open?path=${encodeURIComponent(filePath)}`,
    {
      method: 'POST',
    },
  );

  if (!response.ok) {
    throw new Error(`project file open failed: ${response.status}`);
  }

  return response.json();
}

function renderProjectOptions(projects, selectedCode) {
  const select = document.querySelector('#filesProjectSelect');
  if (!projects.length) {
    select.innerHTML = '<option value="">暂无项目</option>';
    return;
  }

  select.innerHTML = projects
    .map((project) => {
      const code = getProjectCode(project);
      return `<option value="${escapeHtml(code)}" ${code === selectedCode ? 'selected' : ''}>${escapeHtml(project.name)} · ${escapeHtml(code)}</option>`;
    })
    .join('');
}

function getVisibleFiles() {
  const files = latestFileData?.files || [];
  if (activeCategory === 'all') {
    return files;
  }
  return files.filter((file) => file.category === activeCategory);
}

function renderSummary(data) {
  const counts = data.summary?.categoryCounts || {};
  const files = data.files || [];
  const latestFile = files[0] || null;
  const plans = counts.plans || 0;
  const fileTypes = new Set(files.map((file) => file.extension)).size;

  document.querySelector('#fileSummary').innerHTML = [
    ['全部文件', data.summary?.total || 0, `${fileTypes} 种格式`],
    ['方案资料', plans, '方案 / 策划 / 计划'],
    ['表格清单', counts.spreadsheets || 0, 'Excel / CSV'],
    ['最近更新', latestFile ? formatDate(latestFile.updatedAt) : '--', latestFile?.name || '暂无文件'],
  ]
    .map(
      ([label, value, note]) => `
        <article class="file-summary-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <p>${escapeHtml(note)}</p>
        </article>
      `,
    )
    .join('');
}

function renderTabs(data) {
  const counts = data.summary?.categoryCounts || {};
  const tabs = [
    ['all', '全部', data.summary?.total || 0],
    ...Object.entries(fileCategoryMap).map(([key, meta]) => [key, meta.label, counts[key] || 0]),
  ];

  document.querySelector('#fileCategoryTabs').innerHTML = tabs
    .map(
      ([key, label, count]) => `
        <button class="file-tab ${key === activeCategory ? 'active' : ''}" type="button" data-file-category="${escapeHtml(key)}">
          <span>${escapeHtml(label)}</span>
          <strong>${count}</strong>
        </button>
      `,
    )
    .join('');
}

function renderFiles() {
  const board = document.querySelector('#fileBoard');
  const visibleFiles = getVisibleFiles();

  if (!visibleFiles.length) {
    board.innerHTML = '<div class="empty file-empty">当前分类下没有文件。把文件放入项目文件夹后刷新页面即可看到。</div>';
    return;
  }

  board.innerHTML = visibleFiles
    .map((file) => {
      const category = fileCategoryMap[file.category] || fileCategoryMap.others;
      const downloadUrl = `/api/projects/${encodeURIComponent(currentProjectCode)}/files/download?path=${encodeURIComponent(file.relativePath)}`;

      return `
        <article class="file-card" data-file-open="${escapeHtml(file.relativePath)}" tabindex="0" role="button">
          <div class="file-icon">${escapeHtml(file.extension)}</div>
          <div class="file-card-main">
            <div class="file-card-head">
              <div>
                <span>${escapeHtml(category.label)}</span>
                <h4><button class="file-open-link" type="button" data-file-open="${escapeHtml(file.relativePath)}">${escapeHtml(file.name)}</button></h4>
              </div>
              <a class="button compact file-download" href="${downloadUrl}">下载</a>
            </div>
            <p>${escapeHtml(category.note)} · 点击文件卡片可直接打开。</p>
            <div class="file-meta">
              <span class="chip">${escapeHtml(file.directory)}</span>
              <span class="chip">${escapeHtml(file.sizeLabel)}</span>
              <span class="chip">更新 ${escapeHtml(formatDate(file.updatedAt))}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderFilePage(data) {
  latestFileData = data;
  const projectCode = getProjectCode(data.project);

  document.querySelector('#filesProjectName').textContent = data.project?.name || '项目文件';
  document.querySelector('#filesProjectMeta').textContent =
    `项目编码 ${projectCode || '--'} · 文件夹 ${data.folderName || '--'} · 共 ${data.summary?.total || 0} 个文件`;
  document.querySelector('#fileFolderMeta').textContent = data.folderPath
    ? `来源目录：${data.folderPath}`
    : '按文件类型自动分组，点击文件可下载查看。';
  document.querySelector('#backToDashboard').href = `/console/dashboard${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ''}`;

  renderSummary(data);
  renderTabs(data);
  renderFiles();
}

async function loadFiles(projectCode) {
  const data = await fetchProjectFiles(projectCode);
  currentProjectCode = projectCode;
  activeCategory = 'all';
  renderFilePage(data);
  document.querySelector('#filesProjectSelect').value = projectCode;
  window.history.replaceState({}, '', `?projectCode=${encodeURIComponent(projectCode)}`);
}

async function loadLatestProject() {
  const projects = await fetchProjects();
  const latestProject = projects[0] || null;
  const latestProjectCode = getProjectCode(latestProject);
  renderProjectOptions(projects, latestProjectCode);
  if (!latestProjectCode) {
    throw new Error('no projects found');
  }
  await loadFiles(latestProjectCode);
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const rawProjectCode = params.get('projectCode') || params.get('projectId') || '';
  const status = document.querySelector('#filesStatus');
  const select = document.querySelector('#filesProjectSelect');
  const board = document.querySelector('#fileBoard');

  try {
    const projects = await fetchProjects();
    const selected = rawProjectCode || getProjectCode(projects[0]);
    renderProjectOptions(projects, selected);

    if (selected) {
      status.textContent = '正在加载项目文件...';
      await loadFiles(selected);
      status.textContent = `已加载 ${selected} 的项目文件。`;
    } else {
      status.textContent = '当前没有可用项目。';
    }
  } catch (error) {
    status.textContent = error?.message || '项目文件加载失败。';
    if (!rawProjectCode) {
      try {
        await loadLatestProject();
      } catch {
        // keep the original error text
      }
    }
  }

  document.querySelector('#loadFilesProject').addEventListener('click', async () => {
    const projectCode = select.value.trim();
    if (!projectCode) {
      status.textContent = '请先选择一个项目。';
      return;
    }

    try {
      status.textContent = '正在切换项目文件...';
      await loadFiles(projectCode);
      status.textContent = `已切换到 ${projectCode} 的项目文件。`;
    } catch (error) {
      status.textContent = error?.message || '项目文件切换失败。';
    }
  });

  document.querySelector('#fileCategoryTabs').addEventListener('click', (event) => {
    const target = event.target.closest('[data-file-category]');
    if (!target || !latestFileData) {
      return;
    }

    activeCategory = target.getAttribute('data-file-category') || 'all';
    renderTabs(latestFileData);
    renderFiles();
  });

  board.addEventListener('click', async (event) => {
    if (event.target.closest('.file-download')) {
      return;
    }

    const target = event.target.closest('[data-file-open]');
    const filePath = target?.getAttribute('data-file-open');
    if (!filePath) {
      return;
    }

    try {
      status.textContent = '正在打开项目文件...';
      const result = await openProjectFile(filePath);
      status.textContent = `已打开 ${result.fileName}。`;
    } catch (error) {
      status.textContent = error?.message || '打开项目文件失败。';
    }
  });

  board.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const target = event.target.closest('.file-card');
    const filePath = target?.getAttribute('data-file-open');
    if (!filePath) {
      return;
    }

    event.preventDefault();

    try {
      status.textContent = '正在打开项目文件...';
      const result = await openProjectFile(filePath);
      status.textContent = `已打开 ${result.fileName}。`;
    } catch (error) {
      status.textContent = error?.message || '打开项目文件失败。';
    }
  });
}

bootstrap();
