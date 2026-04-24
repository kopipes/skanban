const API_STATE_ENDPOINT = "/api/state";
const LEGACY_LOCAL_STORAGE_KEYS = [
  "simple_kanban_process_v3",
  "simple_kanban_process_v2",
  "simple_kanban_process_v1",
];
const BOARD_COLUMNS = [
  { key: "todo", label: "To Do", color: "planning" },
  { key: "in_progress", label: "In Progress", color: "active" },
  { key: "review", label: "Review", color: "on_hold" },
  { key: "done", label: "Done", color: "completed" },
];
const HISTORY_LIMIT = 40;
const DELETE_PROJECT_CONFIRM_TEXT = "DELETE PROJECT";
const DELETE_PROJECT_PASSWORD = "Shushitei99";

let state = { selectedProjectId: "", projects: [] };
const undoStack = [];
let currentProjectView = "active";
let stateReady = false;

const statsGrid = document.getElementById("stats-grid");
const viewMenu = document.getElementById("view-menu");
const projectTabs = document.getElementById("project-tabs");
const projectLine = document.getElementById("project-line");
const boardGrid = document.getElementById("board-grid");

const undoActionButton = document.getElementById("undo-action");
const openProjectModalButton = document.getElementById("open-project-modal");
const openTaskModalButton = document.getElementById("open-task-modal");

const projectModal = document.getElementById("project-modal");
const projectForm = document.getElementById("project-form");
const projectModalTitle = document.getElementById("project-modal-title");
const projectIdInput = document.getElementById("project-id");
const projectNameInput = document.getElementById("project-name");
const projectDescriptionInput = document.getElementById("project-description");
const projectStatusInput = document.getElementById("project-status");
const projectDeadlineInput = document.getElementById("project-deadline");
const projectNotesInput = document.getElementById("project-notes");
const deleteProjectButton = document.getElementById("delete-project-btn");

const projectDeleteModal = document.getElementById("project-delete-modal");
const projectDeleteForm = document.getElementById("project-delete-form");
const deleteProjectIdInput = document.getElementById("delete-project-id");
const deleteProjectConfirmTextInput = document.getElementById("delete-project-confirm-text");
const deleteProjectPasswordInput = document.getElementById("delete-project-password");
const deleteProjectError = document.getElementById("delete-project-error");

const taskModal = document.getElementById("task-modal");
const taskForm = document.getElementById("task-form");
const taskModalTitle = document.getElementById("task-modal-title");
const taskIdInput = document.getElementById("task-id");
const taskTitleInput = document.getElementById("task-title");
const taskDescriptionInput = document.getElementById("task-description");
const taskStatusInput = document.getElementById("task-status");
const taskProgressInput = document.getElementById("task-progress");
const taskTypeInput = document.getElementById("task-type");
const taskPriorityInput = document.getElementById("task-priority");
const taskProgressDetailInput = document.getElementById("task-progress-detail");
const taskNotesInput = document.getElementById("task-notes");
const deleteTaskButton = document.getElementById("delete-task-btn");

undoActionButton.addEventListener("click", () => {
  if (!stateReady) {
    return;
  }
  undoLastAction();
});

openProjectModalButton.addEventListener("click", () => {
  openProjectModal();
});

openTaskModalButton.addEventListener("click", () => {
  if (currentProjectView === "archive") {
    alert("Archive view is read-only. Switch to Active projects.");
    return;
  }
  if (!getSelectedProject()) {
    alert("Please create/select a project first.");
    return;
  }
  openTaskModal();
});

viewMenu.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }
  const nextView = button.dataset.view;
  if (nextView !== "active" && nextView !== "archive") {
    return;
  }
  currentProjectView = nextView;
  render();
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    const modal = document.getElementById(button.dataset.closeModal);
    if (modal && modal.open) {
      modal.close();
    }
  });
});

deleteProjectButton.addEventListener("click", () => {
  const editingId = projectIdInput.value.trim();
  if (!editingId) {
    return;
  }
  openDeleteProjectModal(editingId);
});

projectDeleteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!stateReady) {
    return;
  }

  const projectId = deleteProjectIdInput.value.trim();
  const confirmationText = deleteProjectConfirmTextInput.value.trim();
  const password = deleteProjectPasswordInput.value;

  if (confirmationText !== DELETE_PROJECT_CONFIRM_TEXT) {
    deleteProjectError.textContent = "Confirmation text must be exactly DELETE PROJECT.";
    return;
  }

  if (password !== DELETE_PROJECT_PASSWORD) {
    deleteProjectError.textContent = "Wrong password. Project was not deleted.";
    return;
  }

  const index = state.projects.findIndex((project) => project.id === projectId);
  if (index === -1) {
    deleteProjectError.textContent = "Project not found.";
    return;
  }

  pushUndoSnapshot();
  state.projects.splice(index, 1);
  if (state.selectedProjectId === projectId) {
    state.selectedProjectId = "";
  }
  saveState();
  projectDeleteModal.close();
  render();
});

projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!stateReady) {
    return;
  }

  const name = projectNameInput.value.trim();
  if (!name) {
    return;
  }

  const editingId = projectIdInput.value.trim();
  if (editingId) {
    const project = state.projects.find((item) => item.id === editingId);
    if (project) {
      pushUndoSnapshot();
      project.name = name;
      project.description = projectDescriptionInput.value.trim();
      project.status = projectStatusInput.value;
      project.deadline = projectDeadlineInput.value;
      project.notes = projectNotesInput.value.trim();
      syncProjectArchive(project);
    }
  } else {
    pushUndoSnapshot();
    const newProject = {
      id: uid(),
      name,
      description: projectDescriptionInput.value.trim(),
      status: projectStatusInput.value,
      deadline: projectDeadlineInput.value,
      notes: projectNotesInput.value.trim(),
      createdAt: Date.now(),
      tasks: [],
    };
    syncProjectArchive(newProject);
    state.projects.unshift(newProject);
    state.selectedProjectId = newProject.id;
  }

  saveState();
  projectModal.close();
  render();
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!stateReady) {
    return;
  }
  const project = getSelectedProject();
  if (!project) {
    return;
  }

  const title = taskTitleInput.value.trim();
  if (!title) {
    return;
  }

  const payload = {
    title,
    description: taskDescriptionInput.value.trim(),
    status: taskStatusInput.value,
    progress: clampProgress(taskProgressInput.value),
    type: taskTypeInput.value,
    priority: taskPriorityInput.value,
    progressDetail: taskProgressDetailInput.value.trim(),
    notes: taskNotesInput.value.trim(),
  };

  if (payload.status === "done") {
    payload.progress = 100;
  }

  const editingId = taskIdInput.value.trim();
  if (editingId) {
    const task = project.tasks.find((item) => item.id === editingId);
    if (task) {
      pushUndoSnapshot();
      Object.assign(task, payload);
    }
  } else {
    pushUndoSnapshot();
    project.tasks.unshift({
      id: uid(),
      createdAt: Date.now(),
      ...payload,
    });
  }

  saveState();
  taskModal.close();
  render();
});

deleteTaskButton.addEventListener("click", () => {
  if (!stateReady) {
    return;
  }
  const project = getSelectedProject();
  const editingId = taskIdInput.value.trim();
  if (!project || !editingId) {
    return;
  }
  const found = project.tasks.some((item) => item.id === editingId);
  if (!found) {
    return;
  }
  pushUndoSnapshot();
  project.tasks = project.tasks.filter((item) => item.id !== editingId);
  saveState();
  taskModal.close();
  render();
});

projectTabs.addEventListener("click", (event) => {
  if (!stateReady) {
    return;
  }
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  if (button.dataset.action === "new-project") {
    openProjectModal();
    return;
  }

  const projectId = button.dataset.projectId;
  if (projectId) {
    state.selectedProjectId = projectId;
    saveState();
    render();
  }
});

projectLine.addEventListener("click", (event) => {
  if (!stateReady) {
    return;
  }
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "project-details") {
    return;
  }
  const project = getSelectedProject();
  if (!project) {
    return;
  }
  openProjectModal(project);
});

boardGrid.addEventListener("click", (event) => {
  if (!stateReady) {
    return;
  }
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  if (currentProjectView === "archive") {
    return;
  }

  const project = getSelectedProject();
  if (!project) {
    return;
  }

  if (button.dataset.action === "add-task-column") {
    openTaskModal(null, button.dataset.status);
    return;
  }

  if (button.dataset.action === "edit-task") {
    const task = project.tasks.find((item) => item.id === button.dataset.taskId);
    if (task) {
      openTaskModal(task);
    }
    return;
  }

  if (button.dataset.action === "advance-task") {
    const task = project.tasks.find((item) => item.id === button.dataset.taskId);
    if (!task) {
      return;
    }
    pushUndoSnapshot();
    task.status = nextStatus(task.status);
    if (task.status === "done") {
      task.progress = 100;
    }
    saveState();
    render();
  }
});

function render() {
  const changedSelection = ensureSelectionForCurrentView();
  if (changedSelection) {
    saveState();
  }
  const project = getSelectedProject();
  renderViewMenu();
  renderStats(project);
  renderProjectTabs();
  renderProjectLine(project);
  renderBoard(project);
  updateUndoButton();
  openTaskModalButton.disabled = currentProjectView === "archive" || !project;
}

function undoLastAction() {
  if (!undoStack.length) {
    return;
  }
  state = undoStack.pop();
  saveState();
  if (projectModal.open) {
    projectModal.close();
  }
  if (taskModal.open) {
    taskModal.close();
  }
  if (projectDeleteModal.open) {
    projectDeleteModal.close();
  }
  render();
}

function pushUndoSnapshot() {
  undoStack.push(cloneState(state));
  if (undoStack.length > HISTORY_LIMIT) {
    undoStack.shift();
  }
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function updateUndoButton() {
  undoActionButton.disabled = undoStack.length === 0;
  undoActionButton.textContent = undoStack.length === 0 ? "Back" : `Back (${undoStack.length})`;
}

function renderViewMenu() {
  const activeCount = getProjectsByView("active").length;
  const archiveCount = getProjectsByView("archive").length;
  viewMenu.innerHTML = `
    <button class="menu-btn ${currentProjectView === "active" ? "active" : ""}" data-view="active">
      Active (${activeCount})
    </button>
    <button class="menu-btn ${currentProjectView === "archive" ? "active" : ""}" data-view="archive">
      Archive (${archiveCount})
    </button>
  `;
}

function renderStats(project) {
  if (!project) {
    const emptyLabel = currentProjectView === "archive" ? "no archived project" : "no project selected";
    statsGrid.innerHTML = `
      <article class="stat-card"><div class="label">Progress</div><h3>0%</h3><p class="desc">overall project</p></article>
      <article class="stat-card"><div class="label">Tasks</div><h3>0</h3><p class="desc">0 completed</p></article>
      <article class="stat-card"><div class="label">In Progress</div><h3>0</h3><p class="desc">active tasks</p></article>
      <article class="stat-card"><div class="label">Deadline</div><h3>-</h3><p class="desc">${emptyLabel}</p></article>
    `;
    return;
  }

  const progress = calcProjectProgress(project);
  const totalTasks = project.tasks.length;
  const completedTasks = project.tasks.filter((task) => task.status === "done").length;
  const activeTasks = project.tasks.filter((task) => task.status === "in_progress" || task.status === "review").length;
  const deadline = project.deadline || "No deadline";

  statsGrid.innerHTML = `
    <article class="stat-card">
      <div class="label">Progress</div>
      <h3>${progress}%</h3>
      <p class="desc">overall project</p>
    </article>
    <article class="stat-card">
      <div class="label">Tasks</div>
      <h3>${totalTasks}</h3>
      <p class="desc">${completedTasks} completed</p>
    </article>
    <article class="stat-card">
      <div class="label">In Progress</div>
      <h3>${activeTasks}</h3>
      <p class="desc">active tasks</p>
    </article>
    <article class="stat-card">
      <div class="label">Deadline</div>
      <h3>${escapeHtml(deadline)}</h3>
      <p class="desc ${project.status === "active" ? "active" : ""}">${labelProjectStatus(project.status).toLowerCase()}</p>
    </article>
  `;
}

function renderProjectTabs() {
  const visibleProjects = getProjectsByView(currentProjectView);

  if (!visibleProjects.length) {
    projectTabs.innerHTML =
      currentProjectView === "active"
        ? `<button class="project-pill" data-action="new-project">+ New Project</button>`
        : `<p class="project-desc">No archived projects yet.</p>`;
    return;
  }

  projectTabs.innerHTML = `
    ${visibleProjects
      .map((project) => {
        const selected = project.id === state.selectedProjectId ? "selected" : "";
        return `
          <button class="project-pill ${selected}" data-project-id="${project.id}">
            ${escapeHtml(project.name)}
            <span class="dot ${project.status}"></span>
          </button>
        `;
      })
      .join("")}
    ${currentProjectView === "active" ? `<button class="project-pill" data-action="new-project">+ New</button>` : ""}
  `;
}

function renderProjectLine(project) {
  if (!project) {
    projectLine.innerHTML =
      currentProjectView === "archive"
        ? `<p class="project-desc">Completed projects will appear in archive.</p>`
        : `<p class="project-desc">Create your first project to start the board.</p>`;
    return;
  }

  projectLine.innerHTML = `
    <span class="status-word ${project.status}">${labelProjectStatus(project.status).toLowerCase()}</span>
    <span>|</span>
    <span class="project-desc">${escapeHtml(truncate(project.description || "No description yet.", 130))}</span>
    <button class="compact-btn" data-action="project-details">${currentProjectView === "archive" ? "Details / Restore" : "Details"}</button>
  `;
}

function renderBoard(project) {
  if (!project) {
    boardGrid.innerHTML = "";
    return;
  }

  const readOnly = currentProjectView === "archive";
  boardGrid.innerHTML = BOARD_COLUMNS.map((column) => {
    const tasks = project.tasks.filter((task) => task.status === column.key);
    return `
      <article class="board-col">
        <div class="col-head">
          <div class="col-title">
            <span class="dot ${column.color}"></span>
            <span>${column.label}</span>
          </div>
          <span class="count-pill">${tasks.length}</span>
        </div>
        <div class="tasks">
          ${tasks.length ? tasks.map((task) => renderTaskCard(task, readOnly)).join("") : `<p class="empty">No task</p>`}
        </div>
        ${readOnly ? "" : `<button class="add-task-col" data-action="add-task-column" data-status="${column.key}">+ add task</button>`}
      </article>
    `;
  }).join("");
}

function renderTaskCard(task, readOnly = false) {
  const canAdvance = task.status !== "done";
  return `
    <article class="task-card">
      <h4>${escapeHtml(task.title)}</h4>
      <p class="task-desc">${escapeHtml(truncate(task.description || "No description", 90))}</p>
      <div class="task-meta">
        <span class="type-pill type-${task.type}">${escapeHtml(task.type)}</span>
        <span class="priority">
          <span class="dot priority-dot ${task.priority}"></span>
          ${escapeHtml(task.priority)}
        </span>
      </div>
      <div class="task-progress">
        <div class="bar"><span style="width:${clampProgress(task.progress)}%"></span></div>
        <div class="progress-label">${clampProgress(task.progress)}% complete</div>
        ${
          task.progressDetail
            ? `<div class="progress-detail">${escapeHtml(truncate(task.progressDetail, 70))}</div>`
            : ""
        }
      </div>
      ${
        readOnly
          ? ""
          : `<div class="task-actions">
              <button class="link-btn" data-action="edit-task" data-task-id="${task.id}">Details</button>
              ${
                canAdvance
                  ? `<button class="link-btn" data-action="advance-task" data-task-id="${task.id}">Move Next</button>`
                  : ""
              }
            </div>`
      }
    </article>
  `;
}

function openDeleteProjectModal(projectId) {
  deleteProjectIdInput.value = projectId;
  deleteProjectConfirmTextInput.value = "";
  deleteProjectPasswordInput.value = "";
  deleteProjectError.textContent = "";
  if (projectModal.open) {
    projectModal.close();
  }
  projectDeleteModal.showModal();
}

function openProjectModal(project = null) {
  deleteProjectError.textContent = "";
  if (project) {
    projectModalTitle.textContent = "Edit Project";
    projectIdInput.value = project.id;
    projectNameInput.value = project.name;
    projectDescriptionInput.value = project.description || "";
    projectStatusInput.value = project.status;
    projectDeadlineInput.value = project.deadline || "";
    projectNotesInput.value = project.notes || "";
    deleteProjectButton.style.display = "inline-block";
  } else {
    projectModalTitle.textContent = "Add Project";
    projectIdInput.value = "";
    projectNameInput.value = "";
    projectDescriptionInput.value = "";
    projectStatusInput.value = "planning";
    projectDeadlineInput.value = "";
    projectNotesInput.value = "";
    deleteProjectButton.style.display = "none";
  }
  projectModal.showModal();
}

function openTaskModal(task = null, defaultStatus = "todo") {
  const project = getSelectedProject();
  if (!project) {
    return;
  }

  if (task) {
    taskModalTitle.textContent = "Edit Task";
    taskIdInput.value = task.id;
    taskTitleInput.value = task.title;
    taskDescriptionInput.value = task.description || "";
    taskStatusInput.value = task.status;
    taskProgressInput.value = clampProgress(task.progress);
    taskTypeInput.value = task.type || "task";
    taskPriorityInput.value = task.priority || "medium";
    taskProgressDetailInput.value = task.progressDetail || "";
    taskNotesInput.value = task.notes || "";
    deleteTaskButton.style.display = "inline-block";
  } else {
    taskModalTitle.textContent = "Add Task";
    taskIdInput.value = "";
    taskTitleInput.value = "";
    taskDescriptionInput.value = "";
    taskStatusInput.value = defaultStatus;
    taskProgressInput.value = defaultStatus === "done" ? "100" : "0";
    taskTypeInput.value = "task";
    taskPriorityInput.value = "medium";
    taskProgressDetailInput.value = "";
    taskNotesInput.value = "";
    deleteTaskButton.style.display = "none";
  }
  taskModal.showModal();
}

function getSelectedProject() {
  return getProjectsByView(currentProjectView).find((project) => project.id === state.selectedProjectId) || null;
}

function getProjectsByView(view) {
  if (view === "archive") {
    return state.projects.filter((project) => isProjectArchived(project));
  }
  return state.projects.filter((project) => !isProjectArchived(project));
}

function ensureSelectionForCurrentView() {
  const visibleProjects = getProjectsByView(currentProjectView);
  if (!visibleProjects.length) {
    if (state.selectedProjectId !== "") {
      state.selectedProjectId = "";
      return true;
    }
    return false;
  }

  const found = visibleProjects.some((project) => project.id === state.selectedProjectId);
  if (found) {
    return false;
  }
  state.selectedProjectId = visibleProjects[0].id;
  return true;
}

function isProjectArchived(project) {
  return project.isArchived || project.status === "completed";
}

function calcProjectProgress(project) {
  if (!project.tasks.length) {
    return 0;
  }
  const total = project.tasks.reduce((sum, task) => sum + clampProgress(task.progress), 0);
  return Math.round(total / project.tasks.length);
}

function nextStatus(status) {
  const order = ["todo", "in_progress", "review", "done"];
  const index = order.indexOf(status);
  if (index === -1 || index === order.length - 1) {
    return "done";
  }
  return order[index + 1];
}

async function initApp() {
  renderLoadingState();
  try {
    const serverState = await fetchStateFromServer();
    if (serverState && Array.isArray(serverState.projects)) {
      state = normalizeState(serverState);
    } else {
      const legacyState = readLegacyLocalState();
      state = normalizeState(legacyState || seedState());
      await persistStateToServer(state);
    }
    stateReady = true;
    render();
  } catch (error) {
    console.error("Failed to initialize state from SQLite API:", error);
    const legacyState = readLegacyLocalState();
    state = normalizeState(legacyState || seedState());
    stateReady = true;
    render();
    alert("SQLite server is not reachable. Run server.py and refresh this page.");
  }
}

function renderLoadingState() {
  viewMenu.innerHTML = "";
  projectTabs.innerHTML = `<p class="project-desc">Loading projects...</p>`;
  projectLine.innerHTML = `<p class="project-desc">Connecting to SQLite...</p>`;
  statsGrid.innerHTML = `
    <article class="stat-card"><div class="label">Progress</div><h3>-</h3><p class="desc">loading</p></article>
    <article class="stat-card"><div class="label">Tasks</div><h3>-</h3><p class="desc">loading</p></article>
    <article class="stat-card"><div class="label">In Progress</div><h3>-</h3><p class="desc">loading</p></article>
    <article class="stat-card"><div class="label">Deadline</div><h3>-</h3><p class="desc">loading</p></article>
  `;
  boardGrid.innerHTML = "";
  openTaskModalButton.disabled = true;
  undoActionButton.disabled = true;
}

async function fetchStateFromServer() {
  const response = await fetch(API_STATE_ENDPOINT, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`GET ${API_STATE_ENDPOINT} failed with ${response.status}`);
  }
  const data = await response.json();
  return data.state || null;
}

async function persistStateToServer(nextState) {
  const response = await fetch(API_STATE_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: nextState }),
  });
  if (!response.ok) {
    throw new Error(`PUT ${API_STATE_ENDPOINT} failed with ${response.status}`);
  }
}

function readLegacyLocalState() {
  try {
    for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.projects)) {
        return parsed;
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}

function normalizeState(input) {
  if (!input || !Array.isArray(input.projects)) {
    return seedState();
  }

  const projects = input.projects.map((project) => {
    const status = normalizeProjectStatus(project.status);
    const normalizedProject = {
      id: project.id || uid(),
      name: project.name || "Untitled Project",
      description: project.description || "",
      status,
      deadline: project.deadline || "",
      notes: project.notes || "",
      isArchived: Boolean(project.isArchived),
      archivedAt: project.archivedAt || "",
      createdAt: project.createdAt || Date.now(),
      tasks: Array.isArray(project.tasks)
        ? project.tasks.map((task) => ({
            id: task.id || uid(),
            title: task.title || "Untitled Task",
            description: task.description || "",
            status: normalizeTaskStatus(task.status),
            progress: clampProgress(task.progress),
            type: normalizeTaskType(task.type),
            priority: normalizePriority(task.priority),
            progressDetail: task.progressDetail || "",
            notes: task.notes || "",
            createdAt: task.createdAt || Date.now(),
          }))
        : [],
    };
    syncProjectArchive(normalizedProject);
    return normalizedProject;
  });

  maybeInjectThirdSampleProject(projects);

  const selectedProjectId =
    projects.find((item) => item.id === input.selectedProjectId)?.id || (projects[0] ? projects[0].id : "");

  return { selectedProjectId, projects };
}

function saveState() {
  if (!stateReady) {
    return;
  }
  persistStateToServer(state).catch((error) => {
    console.error("Failed saving state to SQLite:", error);
  });
}

function seedState() {
  const firstProjectId = uid();
  const secondProjectId = uid();
  const thirdProjectId = uid();
  return {
    selectedProjectId: firstProjectId,
    projects: [
      {
        id: firstProjectId,
        name: "Website Redesign",
        description: "Redesign company website with new brand guidelines and improve conversion flow.",
        status: "active",
        deadline: "2026-06-30",
        notes: "Weekly sync each Friday.",
        createdAt: Date.now(),
        tasks: [
          {
            id: uid(),
            title: "Write unit tests for cart",
            description: "Cover add, remove, quantity update, and checkout edge cases.",
            status: "todo",
            progress: 10,
            type: "task",
            priority: "medium",
            progressDetail: "Test plan ready, execution starts this week.",
            notes: "",
            createdAt: Date.now(),
          },
          {
            id: uid(),
            title: "Product listing page",
            description: "Build product grid with filtering, sorting, and improved SEO routing.",
            status: "in_progress",
            progress: 55,
            type: "feat",
            priority: "high",
            progressDetail: "Filtering complete, final API tuning in progress.",
            notes: "",
            createdAt: Date.now(),
          },
          {
            id: uid(),
            title: "SEO meta optimization",
            description: "Add proper meta tags, OG tags, and schema definitions.",
            status: "review",
            progress: 80,
            type: "task",
            priority: "low",
            progressDetail: "Waiting for PM review on final copy.",
            notes: "",
            createdAt: Date.now(),
          },
          {
            id: uid(),
            title: "Redesign homepage hero",
            description: "Create a clear hero with CTA and updated brand messaging.",
            status: "done",
            progress: 100,
            type: "feat",
            priority: "high",
            progressDetail: "Approved and deployed.",
            notes: "",
            createdAt: Date.now(),
          },
        ],
      },
      {
        id: secondProjectId,
        name: "Mobile App MVP",
        description: "Build first version of mobile app for field operations team.",
        status: "planning",
        deadline: "2026-08-15",
        notes: "Research session with ops team next week.",
        createdAt: Date.now(),
        tasks: [
          {
            id: uid(),
            title: "Define MVP backlog",
            description: "Prioritize core flows and lock scope for first release.",
            status: "in_progress",
            progress: 40,
            type: "task",
            priority: "medium",
            progressDetail: "Core auth and tracking scope agreed.",
            notes: "Need final sign-off from operations manager.",
            createdAt: Date.now(),
          },
          {
            id: uid(),
            title: "Set up crash analytics",
            description: "Integrate error monitoring SDK for iOS and Android.",
            status: "todo",
            progress: 0,
            type: "chore",
            priority: "low",
            progressDetail: "",
            notes: "Waiting on infra API keys.",
            createdAt: Date.now(),
          },
        ],
      },
      {
        id: thirdProjectId,
        name: "API Integration",
        description: "Unify service integrations for payment, inventory, and shipping.",
        status: "on_hold",
        deadline: "2026-07-20",
        notes: "Blocked by vendor sandbox access.",
        createdAt: Date.now(),
        tasks: [
          {
            id: uid(),
            title: "Map endpoint contracts",
            description: "Document request-response schema for each external provider.",
            status: "review",
            progress: 75,
            type: "feat",
            priority: "high",
            progressDetail: "Payment and shipping contracts ready for review.",
            notes: "",
            createdAt: Date.now(),
          },
          {
            id: uid(),
            title: "Retry logic for timeout",
            description: "Handle timeout with exponential backoff and alert fallback.",
            status: "todo",
            progress: 20,
            type: "bug",
            priority: "high",
            progressDetail: "Draft middleware completed.",
            notes: "Need load test before release.",
            createdAt: Date.now(),
          },
        ],
      },
    ],
  };
}

function maybeInjectThirdSampleProject(projects) {
  if (projects.length >= 3) {
    return;
  }

  const names = new Set(projects.map((project) => project.name));
  const hasWebsite = names.has("Website Redesign");
  const hasMobile = names.has("Mobile App MVP");
  const hasApi = names.has("API Integration");

  if (hasWebsite && hasMobile && !hasApi) {
    projects.push(createApiIntegrationSampleProject());
  }
}

function createApiIntegrationSampleProject() {
  return {
    id: uid(),
    name: "API Integration",
    description: "Unify service integrations for payment, inventory, and shipping.",
    status: "on_hold",
    deadline: "2026-07-20",
    notes: "Blocked by vendor sandbox access.",
    createdAt: Date.now(),
    tasks: [
      {
        id: uid(),
        title: "Map endpoint contracts",
        description: "Document request-response schema for each external provider.",
        status: "review",
        progress: 75,
        type: "feat",
        priority: "high",
        progressDetail: "Payment and shipping contracts ready for review.",
        notes: "",
        createdAt: Date.now(),
      },
      {
        id: uid(),
        title: "Retry logic for timeout",
        description: "Handle timeout with exponential backoff and alert fallback.",
        status: "todo",
        progress: 20,
        type: "bug",
        priority: "high",
        progressDetail: "Draft middleware completed.",
        notes: "Need load test before release.",
        createdAt: Date.now(),
      },
    ],
  };
}

function syncProjectArchive(project) {
  if (project.status === "completed") {
    project.isArchived = true;
    if (!project.archivedAt) {
      project.archivedAt = Date.now();
    }
    return;
  }
  project.isArchived = false;
  project.archivedAt = "";
}

function normalizeProjectStatus(value) {
  const allowed = new Set(["planning", "active", "on_hold", "completed"]);
  return allowed.has(value) ? value : "planning";
}

function normalizeTaskStatus(value) {
  const allowed = new Set(["todo", "in_progress", "review", "done"]);
  return allowed.has(value) ? value : "todo";
}

function normalizeTaskType(value) {
  const allowed = new Set(["task", "feat", "bug", "chore"]);
  return allowed.has(value) ? value : "task";
}

function normalizePriority(value) {
  const allowed = new Set(["low", "medium", "high"]);
  return allowed.has(value) ? value : "medium";
}

function clampProgress(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function labelProjectStatus(status) {
  const map = {
    planning: "Planning",
    active: "Active",
    on_hold: "On Hold",
    completed: "Completed",
  };
  return map[status] || "Planning";
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

initApp();
