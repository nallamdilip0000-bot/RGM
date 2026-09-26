/**
 * Student Dashboard Logic
 * Personal Project Milestone Tracker
 */

let currentStudent = null;
let myProjects = [];
let selectedProjectForTeam = null;
let selectedProjectForMilestone = null;
let selectedProjectForTask = null;

// Selected members array for project creation modal
let newProjectMembers = []; // array of user objects

document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth('student')) return;
  currentStudent = getUser();

  // Populate basic profile in sidebar
  const regNoEl = document.getElementById('userRegNo');
  if (regNoEl) regNoEl.textContent = `${currentStudent.registerNumber || ''} • ${currentStudent.department ? currentStudent.department.split(' ')[0] : ''} ${currentStudent.year || ''}`;

  // Setup notification bell
  setupNotificationBell();

  // Mobile menu toggle
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
  }

  // Bind Sidebar Navigation Tabs
  document.querySelectorAll('.sidebar-nav .nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
      if (sidebar) sidebar.classList.remove('mobile-open');
    });
  });

  // Logout button
  const logoutBtn = document.getElementById('navLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Setup Modals
  setupModals();

  // Load initial data
  await loadDashboardData();
  await loadFacultyDropdown();
  setupSettingsAndProfile();
});

// Switch Tab
function switchTab(tabId) {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.querySelector(`.sidebar-nav .nav-item[data-tab="${tabId}"]`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.page-tab-content').forEach(content => content.classList.remove('active'));
  const activeContent = document.getElementById(tabId);
  if (activeContent) activeContent.classList.add('active');

  const pageHeadings = {
    tabDashboard: 'Student Dashboard',
    tabProjects: 'My Projects',
    tabTeam: 'Project Team Members',
    tabMilestones: 'Project Milestones',
    tabTasks: 'Tasks Management',
    tabDocuments: 'Documents & Deliverables',
    tabReport: 'Academic Project Report',
    tabNotifications: 'Notification Inbox',
    tabProfile: 'Student Profile',
    tabSettings: 'Notification Settings'
  };
  const headingEl = document.getElementById('pageHeading');
  if (headingEl) headingEl.textContent = pageHeadings[tabId] || 'Student Dashboard';

  // Trigger tab-specific refresh
  if (tabId === 'tabProjects') renderProjectsTable();
  if (tabId === 'tabDocuments') {
    const sel = document.getElementById('documentProjectSelect');
    if (sel && sel.value) handleDocumentProjectChange(sel.value);
    else if (myProjects.length > 0) handleDocumentProjectChange(myProjects[0]._id || myProjects[0].id);
  }
  if (tabId === 'tabReport') renderProjectReport();
  if (tabId === 'tabNotifications') renderNotificationInbox();
}

// Standard domains definition
const STANDARD_DOMAINS = [
  'Artificial Intelligence & Machine Learning (AI & ML)',
  'Data Science & Big Data Analytics',
  'Web Development & Full Stack',
  'Mobile App Development (Android / iOS / Flutter)',
  'Cybersecurity & Cryptography',
  'Cloud Computing & DevOps',
  'Internet of Things (IoT) & Embedded Systems',
  'Blockchain & Distributed Ledgers',
  'Computer Vision & Image Processing',
  'Natural Language Processing (NLP) & GenAI'
];

window.toggleDomainOtherInput = function(mode) {
  if (mode === 'create') {
    const sel = document.getElementById('projDomainSelect');
    const otherInp = document.getElementById('projDomainOther');
    if (!sel || !otherInp) return;
    if (sel.value === 'Other') {
      otherInp.style.display = 'block';
      otherInp.required = true;
      otherInp.focus();
    } else {
      otherInp.style.display = 'none';
      otherInp.required = false;
      otherInp.value = '';
    }
  } else if (mode === 'edit') {
    const sel = document.getElementById('editProjDomainSelect');
    const otherInp = document.getElementById('editProjDomainOther');
    if (!sel || !otherInp) return;
    if (sel.value === 'Other') {
      otherInp.style.display = 'block';
      otherInp.required = true;
      otherInp.focus();
    } else {
      otherInp.style.display = 'none';
      otherInp.required = false;
      otherInp.value = '';
    }
  }
};

// Setup Modals & Event Listeners
function setupModals() {
  const createModal = document.getElementById('createProjectModal');
  const btn1 = document.getElementById('btnOpenCreateProject');
  const btn2 = document.getElementById('btnOpenCreateProject2');

  function openCreateModal() {
    // Reset domain dropdown
    const domainSel = document.getElementById('projDomainSelect');
    const domainOther = document.getElementById('projDomainOther');
    if (domainSel) domainSel.value = '';
    if (domainOther) {
      domainOther.style.display = 'none';
      domainOther.value = '';
      domainOther.required = false;
    }

    // Reset form and set current student as Team Leader (Member #1)
    newProjectMembers = [{
      _id: currentStudent.id,
      id: currentStudent.id,
      name: currentStudent.name,
      registerNumber: currentStudent.registerNumber,
      department: currentStudent.department,
      email: currentStudent.email || '',
      phone: currentStudent.phone || '',
      isLeader: true
    }];
    renderSelectedMembers();
    createModal.classList.add('active');
  }

  if (btn1) btn1.addEventListener('click', openCreateModal);
  if (btn2) btn2.addEventListener('click', openCreateModal);

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  // Manual member entry inside create project modal
  const btnAddMember = document.getElementById('btnAddManualMember');
  const inputMemberName = document.getElementById('manualMemberName');
  const inputMemberReg = document.getElementById('manualMemberRegNo');
  const inputMemberEmail = document.getElementById('manualMemberEmail');
  const inputMemberPhone = document.getElementById('manualMemberPhone');

  if (btnAddMember) {
    btnAddMember.addEventListener('click', handleAddManualMember);
  }
  [inputMemberName, inputMemberReg, inputMemberEmail, inputMemberPhone].forEach(input => {
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddManualMember();
        }
      });
    }
  });

  // Create Project Form Submit
  const projForm = document.getElementById('createProjectForm');
  if (projForm) projForm.addEventListener('submit', handleCreateProjectSubmit);

  // Edit Project Form Listeners
  const btnEditAddMember = document.getElementById('btnEditAddManualMember');
  const inputEditMemberName = document.getElementById('editManualMemberName');
  const inputEditMemberReg = document.getElementById('editManualMemberRegNo');
  const inputEditMemberEmail = document.getElementById('editManualMemberEmail');
  const inputEditMemberPhone = document.getElementById('editManualMemberPhone');

  if (btnEditAddMember) {
    btnEditAddMember.addEventListener('click', addEditManualMember);
  }
  [inputEditMemberName, inputEditMemberReg, inputEditMemberEmail, inputEditMemberPhone].forEach(input => {
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addEditManualMember();
        }
      });
    }
  });

  const editProjForm = document.getElementById('editProjectForm');
  if (editProjForm) editProjForm.addEventListener('submit', handleEditProjectSubmit);

  // Milestones Modal
  const milestoneModal = document.getElementById('addMilestoneModal');
  const openMilestoneBtn = document.getElementById('btnOpenAddMilestone');
  if (openMilestoneBtn) {
    openMilestoneBtn.addEventListener('click', () => {
      if (!selectedProjectForMilestone) {
        showToast('Please select a project first', 'warning');
        return;
      }
      milestoneModal.classList.add('active');
    });
  }
  const milestoneForm = document.getElementById('addMilestoneForm');
  if (milestoneForm) milestoneForm.addEventListener('submit', handleCreateMilestoneSubmit);

  const editMilestoneForm = document.getElementById('editMilestoneForm');
  if (editMilestoneForm) editMilestoneForm.addEventListener('submit', handleEditMilestoneSubmit);

  // Tasks Modal
  const taskModal = document.getElementById('addTaskModal');
  const openTaskBtn = document.getElementById('btnOpenAddTask');
  if (openTaskBtn) {
    openTaskBtn.addEventListener('click', () => {
      if (!selectedProjectForTask) {
        showToast('Please select a project first', 'warning');
        return;
      }
      populateTaskModalDropdowns();
      taskModal.classList.add('active');
    });
  }
  const taskForm = document.getElementById('addTaskForm');
  if (taskForm) taskForm.addEventListener('submit', handleCreateTaskSubmit);

  const editTaskForm = document.getElementById('editTaskForm');
  if (editTaskForm) editTaskForm.addEventListener('submit', handleEditTaskSubmit);

  // Documents Modal & Event Listeners
  const uploadDocModal = document.getElementById('uploadDocModal');
  const openDocBtn = document.getElementById('btnOpenUploadDocModal');
  const subTypeSelect = document.getElementById('uploadDocSubmissionType');
  const memberGroup = document.getElementById('uploadDocMemberGroup');
  const docProjSelect = document.getElementById('uploadDocProjectSelect');

  function populateUploadDocMembers(projId) {
    const memberSelect = document.getElementById('uploadDocMemberSelect');
    if (!memberSelect) return;
    const proj = myProjects.find(p => (p._id || p.id) === projId) || myProjects[0];
    if (!proj || !Array.isArray(proj.teamMemberIds)) {
      memberSelect.innerHTML = `<option value="${currentStudent?.id || ''}" data-name="${escapeHtml(currentStudent?.name || 'Self')}" data-reg="${escapeHtml(currentStudent?.registerNumber || '')}">${escapeHtml(currentStudent?.name || 'Self')}</option>`;
      return;
    }
    memberSelect.innerHTML = proj.teamMemberIds.map(m => {
      const isSelf = String(m._id || m.id) === String(currentStudent?.id);
      return `<option value="${m._id || m.id}" data-name="${escapeHtml(m.name)}" data-reg="${escapeHtml(m.registerNumber || '')}" ${isSelf ? 'selected' : ''}>${escapeHtml(m.name)} ${m.registerNumber ? `(${m.registerNumber})` : ''}${isSelf ? ' [You]' : ''}</option>`;
    }).join('');
  }

  if (subTypeSelect && memberGroup) {
    subTypeSelect.addEventListener('change', () => {
      if (subTypeSelect.value === 'Individual') {
        memberGroup.style.display = 'block';
        const activeProjId = docProjSelect?.value || document.getElementById('documentProjectSelect')?.value || (myProjects[0]?._id || myProjects[0]?.id);
        populateUploadDocMembers(activeProjId);
      } else {
        memberGroup.style.display = 'none';
      }
    });
  }

  if (docProjSelect) {
    docProjSelect.addEventListener('change', (e) => {
      populateUploadDocMembers(e.target.value);
    });
  }

  if (openDocBtn) {
    openDocBtn.addEventListener('click', () => {
      const activeProjId = document.getElementById('documentProjectSelect')?.value || (myProjects[0]?._id || myProjects[0]?.id);
      if (docProjSelect && activeProjId) {
        docProjSelect.value = activeProjId;
      }
      if (subTypeSelect) {
        subTypeSelect.value = 'Team';
        if (memberGroup) memberGroup.style.display = 'none';
      }
      populateUploadDocMembers(activeProjId);
      if (uploadDocModal) uploadDocModal.classList.add('active');
    });
  }

  const uploadDocForm = document.getElementById('uploadDocForm');
  if (uploadDocForm) uploadDocForm.addEventListener('submit', handleUploadDocumentSubmit);

  const filterCategory = document.getElementById('docCategoryFilter');
  if (filterCategory) filterCategory.addEventListener('change', renderProjectDocuments);

  const btnRefreshDocs = document.getElementById('btnRefreshDocuments');
  if (btnRefreshDocs) {
    btnRefreshDocs.addEventListener('click', () => {
      const pid = document.getElementById('documentProjectSelect')?.value;
      if (pid) handleDocumentProjectChange(pid);
      showToast('Documents refreshed', 'info');
    });
  }
}

// Add member manually by Name, Register Number, Email and Phone
function handleAddManualMember() {
  const nameInput = document.getElementById('manualMemberName');
  const regInput = document.getElementById('manualMemberRegNo');
  const emailInput = document.getElementById('manualMemberEmail');
  const phoneInput = document.getElementById('manualMemberPhone');

  const name = nameInput ? nameInput.value.trim() : '';
  const registerNumber = regInput ? regInput.value.trim().toUpperCase() : '';
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const phone = phoneInput ? phoneInput.value.trim().replace(/\s+/g, '') : '';

  if (!name) {
    showToast('Please enter the team member name', 'warning');
    nameInput?.focus();
    return;
  }
  if (!registerNumber) {
    showToast('Please enter the team member register number', 'warning');
    regInput?.focus();
    return;
  }
  if (!email) {
    showToast('Please enter the team member email address', 'warning');
    emailInput?.focus();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Please enter a valid email address (e.g. student@rgm.edu)', 'warning');
    emailInput?.focus();
    return;
  }
  if (!phone) {
    showToast('Please enter the team member phone number', 'warning');
    phoneInput?.focus();
    return;
  }
  if (!/^\+?[0-9]{10,14}$/.test(phone)) {
    showToast('Please enter a valid 10-digit mobile number (e.g. 9876543210)', 'warning');
    phoneInput?.focus();
    return;
  }

  // Check duplicate register number
  const isDuplicateReg = newProjectMembers.some(m =>
    m.registerNumber && m.registerNumber.toUpperCase() === registerNumber
  );
  if (isDuplicateReg) {
    showToast(`Team member with register number "${registerNumber}" is already added.`, 'warning');
    return;
  }

  // Check duplicate email
  const isDuplicateEmail = newProjectMembers.some(m =>
    m.email && m.email.toLowerCase() === email
  );
  if (isDuplicateEmail) {
    showToast(`Team member with email "${email}" is already added.`, 'warning');
    return;
  }

  const memberId = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  newProjectMembers.push({
    _id: memberId,
    id: memberId,
    name,
    registerNumber,
    email,
    phone,
    isLeader: false
  });

  if (nameInput) nameInput.value = '';
  if (regInput) regInput.value = '';
  if (emailInput) emailInput.value = '';
  if (phoneInput) phoneInput.value = '';
  nameInput?.focus();

  renderSelectedMembers();
  showToast(`Added ${name} (${registerNumber})`, 'success');
}

// Remove member from temporary list
window.removeMemberFromProject = function(id) {
  if (id === currentStudent.id || newProjectMembers[0]?._id === id) {
    showToast('You are the Team Leader and cannot be removed.', 'warning');
    return;
  }
  newProjectMembers = newProjectMembers.filter(m => (m._id || m.id) !== id);
  renderSelectedMembers();
};

// --------------------------------------------------------------------------
// EDIT PROJECT MODAL LOGIC
// --------------------------------------------------------------------------
let editingProjectMembers = [];

window.openEditProjectModal = async function(projectId) {
  const project = myProjects.find(p => (p._id || p.id) === projectId);
  if (!project) return;

  document.getElementById('editProjIdHidden').value = projectId;
  document.getElementById('editProjName').value = project.projectName || '';
  document.getElementById('editProjDesc').value = project.description || '';
  
  // Set domain dropdown & custom other field
  const editSel = document.getElementById('editProjDomainSelect');
  const editOther = document.getElementById('editProjDomainOther');
  const currentDomain = (project.domain || '').trim();
  if (editSel) {
    if (STANDARD_DOMAINS.includes(currentDomain)) {
      editSel.value = currentDomain;
      if (editOther) {
        editOther.style.display = 'none';
        editOther.required = false;
        editOther.value = '';
      }
    } else if (currentDomain) {
      editSel.value = 'Other';
      if (editOther) {
        editOther.style.display = 'block';
        editOther.required = true;
        editOther.value = currentDomain;
      }
    } else {
      editSel.value = '';
      if (editOther) {
        editOther.style.display = 'none';
        editOther.required = false;
        editOther.value = '';
      }
    }
  } else {
    const legacyEditDomain = document.getElementById('editProjDomain');
    if (legacyEditDomain) legacyEditDomain.value = currentDomain;
  }

  document.getElementById('editProjStartDate').value = project.startDate ? project.startDate.split('T')[0] : '';
  document.getElementById('editProjDeadline').value = project.deadline ? project.deadline.split('T')[0] : '';

  // Populate faculty guide dropdown
  const facultySelect = document.getElementById('editProjFaculty');
  if (facultySelect) {
    try {
      const res = await apiRequest('/student/available-faculty');
      if (res.success && Array.isArray(res.data)) {
        facultySelect.innerHTML = res.data.map(f =>
          `<option value="${f._id || f.id}" ${String(project.facultyId?._id || project.facultyId?.id || project.facultyId) === String(f._id || f.id) ? 'selected' : ''}>${f.name} (${f.designation || 'Faculty'} &bull; ${f.department || ''})</option>`
        ).join('');
      }
    } catch (e) {}
  }

  // Populate team members
  editingProjectMembers = (project.teamMemberIds || []).map((m, idx) => ({
    _id: m._id || m.id || `mem_${idx}`,
    id: m.id || m._id || `mem_${idx}`,
    name: m.name,
    registerNumber: m.registerNumber || '',
    email: m.email || '',
    phone: m.phone || '',
    isLeader: Boolean(m.isLeader || idx === 0 || String(m._id || m.id) === String(currentStudent.id))
  }));

  renderEditSelectedMembers();
  document.getElementById('editProjectModal').classList.add('active');
};

function addEditManualMember() {
  const nameInput = document.getElementById('editManualMemberName');
  const regInput = document.getElementById('editManualMemberRegNo');
  const emailInput = document.getElementById('editManualMemberEmail');
  const phoneInput = document.getElementById('editManualMemberPhone');

  const name = nameInput ? nameInput.value.trim() : '';
  const registerNumber = regInput ? regInput.value.trim().toUpperCase() : '';
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const phone = phoneInput ? phoneInput.value.trim().replace(/\s+/g, '') : '';

  if (!name || !registerNumber) {
    showToast('Please enter both student name and register number.', 'warning');
    return;
  }

  const isDuplicateReg = editingProjectMembers.some(m =>
    m.registerNumber && m.registerNumber.toUpperCase() === registerNumber
  );
  if (isDuplicateReg) {
    showToast(`Member with register number "${registerNumber}" is already in the team.`, 'warning');
    return;
  }

  const memberId = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  editingProjectMembers.push({
    _id: memberId,
    id: memberId,
    name,
    registerNumber,
    email,
    phone,
    isLeader: false
  });

  if (nameInput) nameInput.value = '';
  if (regInput) regInput.value = '';
  if (emailInput) emailInput.value = '';
  if (phoneInput) phoneInput.value = '';
  nameInput?.focus();

  renderEditSelectedMembers();
  showToast(`Added ${name} (${registerNumber})`, 'success');
}

window.removeEditMemberFromProject = function(id) {
  if (id === currentStudent.id || editingProjectMembers[0]?._id === id || editingProjectMembers[0]?.id === id) {
    showToast('You are the Team Leader and cannot be removed.', 'warning');
    return;
  }
  editingProjectMembers = editingProjectMembers.filter(m => (m._id || m.id) !== id);
  renderEditSelectedMembers();
};

function renderEditSelectedMembers() {
  const container = document.getElementById('editSelectedMembersList');
  const countBadge = document.getElementById('editMemberCountBadge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${editingProjectMembers.length} Member${editingProjectMembers.length !== 1 ? 's' : ''}`;
  }

  container.innerHTML = editingProjectMembers.map((m, idx) => `
    <div class="member-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div class="member-list-item-left" style="display: flex; align-items: flex-start; gap: 10px;">
        <span class="member-seq-badge" style="width: 24px; height: 24px; border-radius: 50%; background: #e0e7ff; color: #4338ca; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-top: 2px;">${idx + 1}</span>
        <div>
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="font-weight: 600; color: #1e293b; font-size: 14px;">${m.name}</span>
            <span style="color: #64748b; font-size: 12px; font-weight: 500;">(${m.registerNumber})</span>
            ${m.isLeader ? '<span class="badge badge-inprogress" style="font-size: 10px; padding: 2px 6px;">Team Leader</span>' : ''}
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 3px; display: flex; gap: 12px; flex-wrap: wrap;">
            <span>✉️ ${m.email || 'No email'}</span>
            <span>📱 ${m.phone || 'No phone'}</span>
          </div>
        </div>
      </div>
      ${!m.isLeader
        ? `<button type="button" class="member-remove-btn" onclick="removeEditMemberFromProject('${m._id || m.id}')" title="Remove Member" style="background: none; border: none; font-size: 20px; color: #ef4444; cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>`
        : '<span style="font-size: 11px; font-weight: 600; color: #6366f1; background: #e0e7ff; padding: 3px 8px; border-radius: 4px;">Leader</span>'
      }
    </div>
  `).join('');
}

async function handleEditProjectSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editProjIdHidden').value;
  const projectName = document.getElementById('editProjName').value.trim();
  const description = document.getElementById('editProjDesc').value.trim();
  
  let domain = '';
  const editDomainSel = document.getElementById('editProjDomainSelect');
  const editDomainOther = document.getElementById('editProjDomainOther');
  if (editDomainSel) {
    if (editDomainSel.value === 'Other') {
      domain = editDomainOther ? editDomainOther.value.trim() : '';
    } else {
      domain = editDomainSel.value.trim();
    }
  } else {
    const legacyEditDomain = document.getElementById('editProjDomain');
    if (legacyEditDomain) domain = legacyEditDomain.value.trim();
  }

  const facultyId = document.getElementById('editProjFaculty').value;
  const startDate = document.getElementById('editProjStartDate').value;
  const deadline = document.getElementById('editProjDeadline').value;
  const submitBtn = document.getElementById('btnSaveEditProject');

  if (!projectName || !description || !domain || !startDate || !deadline) {
    showToast('Please fill all required project fields.', 'warning');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const payload = {
      projectName,
      description,
      domain,
      facultyId,
      startDate,
      deadline,
      teamMembers: editingProjectMembers,
      teamMemberIds: editingProjectMembers
    };

    const res = await apiRequest(`/projects/${id}`, 'PUT', payload);
    if (res.success) {
      showToast('Project details updated successfully!', 'success');
      document.getElementById('editProjectModal').classList.remove('active');
      await loadDashboardData();
    }
  } catch (err) {
    showToast(err.message || 'Failed to update project.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
}

window.handleDeleteProject = async function(projectId, projectName) {
  if (!confirm(`Are you sure you want to delete the project "${projectName}"?\n\nThis will permanently remove the project along with its milestones and tasks.`)) {
    return;
  }

  try {
    const res = await apiRequest(`/projects/${projectId}`, 'DELETE');
    if (res.success) {
      showToast('Project deleted successfully.', 'success');
      await loadDashboardData();
    }
  } catch (err) {
    showToast(err.message || 'Failed to delete project.', 'error');
  }
};

function renderSelectedMembers() {
  const container = document.getElementById('selectedMembersList');
  const countBadge = document.getElementById('memberCountBadge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${newProjectMembers.length} Member${newProjectMembers.length !== 1 ? 's' : ''}`;
    countBadge.className = 'badge badge-approved';
  }

  container.innerHTML = newProjectMembers.map((m, idx) => `
    <div class="member-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div class="member-list-item-left" style="display: flex; align-items: flex-start; gap: 10px;">
        <span class="member-seq-badge" style="width: 24px; height: 24px; border-radius: 50%; background: #e0e7ff; color: #4338ca; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-top: 2px;">${idx + 1}</span>
        <div>
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="font-weight: 600; color: #1e293b; font-size: 14px;">${m.name}</span>
            <span style="color: #64748b; font-size: 12px; font-weight: 500;">(${m.registerNumber})</span>
            ${m.isLeader ? '<span class="badge badge-inprogress" style="font-size: 10px; padding: 2px 6px;">Team Leader</span>' : ''}
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 3px; display: flex; gap: 12px; flex-wrap: wrap;">
            <span>✉️ ${m.email || 'No email'}</span>
            <span>📱 ${m.phone || 'No phone'}</span>
          </div>
        </div>
      </div>
      ${!m.isLeader
        ? `<button type="button" class="member-remove-btn" onclick="removeMemberFromProject('${m._id || m.id}')" title="Remove Member" style="background: none; border: none; font-size: 20px; color: #ef4444; cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>`
        : '<span style="font-size: 11px; font-weight: 600; color: #6366f1; background: #e0e7ff; padding: 3px 8px; border-radius: 4px;">Leader</span>'
      }
    </div>
  `).join('');
}

// Load Faculty Dropdown dynamically based on Student's Department + Year (Requirement 5)
async function loadFacultyDropdown() {
  const select = document.getElementById('projFaculty');
  const infoEl = document.getElementById('studentAllocInfo');
  if (!select) return;

  try {
    select.innerHTML = '<option value="">-- Checking allocated faculty guides... --</option>';
    const res = await apiRequest('/student/available-faculty');

    if (res.success && Array.isArray(res.data)) {
      const facultyList = res.data;
      if (facultyList.length === 0) {
        select.innerHTML = '<option value="">-- No faculty allocated for your Dept &amp; Year --</option>';
        if (infoEl) {
          infoEl.innerHTML = `<span style="color: #ef4444; font-weight: 600;">No faculty guides are currently allocated for your Department (${res.department || currentStudent.department}) &amp; Year (${res.year || currentStudent.year}). Please contact Admin.</span>`;
        }
      } else {
        select.innerHTML = '<option value="">-- Select Allocated Faculty Guide --</option>' +
          facultyList.map(f => `<option value="${f._id || f.id}">${f.name} (${f.designation || 'Faculty'} &bull; ${f.department || ''})</option>`).join('');
        if (infoEl) {
          infoEl.innerHTML = `<span style="color: #059669;">Showing <strong>${facultyList.length}</strong> faculty guide(s) allocated for <strong>${res.department} &bull; ${res.year}</strong>.</span>`;
        }
      }
    } else {
      select.innerHTML = '<option value="">Failed to load allocated faculty</option>';
    }
  } catch (err) {
    select.innerHTML = '<option value="">Failed to load faculty</option>';
    if (infoEl) {
      infoEl.innerHTML = `<span style="color: #ef4444;">${err.message || 'Error loading allocated faculty.'}</span>`;
    }
  }
}

// Create Project Submit Handler
async function handleCreateProjectSubmit(e) {
  e.preventDefault();
  const projectName = document.getElementById('projName').value.trim();
  const description = document.getElementById('projDesc').value.trim();
  
  let domain = '';
  const domainSel = document.getElementById('projDomainSelect');
  const domainOther = document.getElementById('projDomainOther');
  if (domainSel) {
    if (domainSel.value === 'Other') {
      domain = domainOther ? domainOther.value.trim() : '';
    } else {
      domain = domainSel.value.trim();
    }
  } else {
    const legacyDomain = document.getElementById('projDomain');
    if (legacyDomain) domain = legacyDomain.value.trim();
  }

  const facultyId = document.getElementById('projFaculty').value;
  const startDate = document.getElementById('projStartDate').value;
  const deadline = document.getElementById('projDeadline').value;
  const submitBtn = document.getElementById('btnSubmitProject');

  // Validate at least one member
  if (!newProjectMembers || newProjectMembers.length === 0) {
    showToast('Please add at least one team member.', 'error');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    const payload = {
      projectName,
      description,
      domain,
      facultyId,
      startDate,
      deadline,
      teamMembers: newProjectMembers.map(m => ({
        _id: m._id || m.id,
        id: m.id || m._id,
        name: m.name,
        registerNumber: m.registerNumber,
        email: m.email || '',
        phone: m.phone || '',
        isLeader: !!m.isLeader
      })),
      teamMemberIds: newProjectMembers.map(m => ({
        _id: m._id || m.id,
        id: m.id || m._id,
        name: m.name,
        registerNumber: m.registerNumber,
        email: m.email || '',
        phone: m.phone || '',
        isLeader: !!m.isLeader
      }))
    };

    const res = await apiRequest('/projects', 'POST', payload);
    if (res.success) {
      showToast('Project created & assigned to faculty guide!', 'success');
      document.getElementById('createProjectModal').classList.remove('active');
      document.getElementById('createProjectForm').reset();
      await loadDashboardData();
    }
  } catch (err) {
    showToast(err.message || 'Failed to submit project', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Project to Faculty';
  }
}

// Load Dashboard Data & Projects
async function loadDashboardData() {
  try {
    const res = await apiRequest('/projects');
    if (res.success) {
      myProjects = res.data;

      // Update KPI Cards
      const total = myProjects.length;
      const active = myProjects.filter(p => p.status === 'Approved' || p.status === 'In Progress').length;
      const completed = myProjects.filter(p => p.status === 'Completed').length;
      const overallAvg = total === 0 ? 0 : Math.round(myProjects.reduce((acc, p) => acc + (p.progress || 0), 0) / total);

      document.getElementById('cardTotalProjects').textContent = total;
      document.getElementById('cardActiveProjects').textContent = active;
      document.getElementById('cardCompletedProjects').textContent = completed;
      document.getElementById('cardOverallProgress').textContent = `${overallAvg}%`;

      // Render dashboard projects list
      renderDashboardProjectCards();
      // Render dropdowns in various tabs
      populateProjectDropdowns();

      // Count pending tasks across projects
      let pendingTasksCount = 0;
      for (const p of myProjects) {
        try {
          const tRes = await apiRequest(`/tasks/${p._id}`);
          if (tRes.success && tRes.data) {
            pendingTasksCount += tRes.data.filter(t => t.status !== 'Completed').length;
          }
        } catch (e) {}
      }
      document.getElementById('cardPendingTasks').textContent = pendingTasksCount;
    }
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

// Render Dashboard Project Cards
function renderDashboardProjectCards() {
  const container = document.getElementById('dashboardProjectsList');
  if (!container) return;

  if (!Array.isArray(myProjects) || myProjects.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: #f8fafc; border-radius: 12px; border: 1px dashed var(--border-color);">
        <p style="color: var(--text-muted); font-size: 15px; margin-bottom: 16px;">You are not enrolled in any projects yet.</p>
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('btnOpenCreateProject').click()">Create Your First Project</button>
      </div>
    `;
    return;
  }

  container.innerHTML = myProjects.map(p => {
    const projId = p._id || p.id;
    const statusClass = (p.status || 'Pending').toLowerCase().replace(/\s+/g, '');
    const isLeader = String(p.teamLeaderId?._id || p.teamLeaderId?.id || p.teamLeaderId) === String(currentStudent?.id);
    return `
      <div class="card" style="margin-bottom: 0; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color);">
        <div class="card-header" style="padding: 14px 18px;">
          <div>
            <h4 style="font-size: 16px; margin-bottom: 2px;">${escapeHtml(p.projectName)}</h4>
            <span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(p.domain || 'Academic Project')}</span>
          </div>
          <span class="badge badge-${statusClass}">${escapeHtml(p.status || 'Pending')}</span>
        </div>
        <div class="card-body" style="padding: 18px;">
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(p.description || 'No description provided.')}
          </p>
          <div style="margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
              <span>Progress</span>
              <strong>${p.progress || 0}%</strong>
            </div>
            <div class="progress-container">
              <div class="progress-bar-fill" style="width: ${p.progress || 0}%;"></div>
            </div>
          </div>
          <div style="font-size: 12px; color: #475569; display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px;">
            <div><strong>Faculty:</strong> ${escapeHtml(p.facultyId?.name || 'Assigned Faculty Guide')}</div>
            <div><strong>Team:</strong> ${p.teamMemberIds?.length || 0} Members ${isLeader ? '(Leader)' : ''}</div>
            <div><strong>Deadline:</strong> ${formatDate(p.deadline)}</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="openProjectMilestones('${projId}')">Milestones</button>
            <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="openProjectTasks('${projId}')">Tasks</button>
            <button class="btn btn-outline-primary btn-sm" onclick="openProjectDocuments('${projId}')" title="Upload / View Project Documents">📁 Files</button>
            <button class="btn btn-outline-primary btn-sm" onclick="openProjectReport('${projId}')" title="Academic Progress Report">📄 Report</button>
            ${isLeader ? `
              <button class="btn btn-outline-primary btn-sm" onclick="openEditProjectModal('${projId}')" title="Edit Project">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="handleDeleteProject('${projId}', '${escapeHtml(p.projectName)}')" title="Delete Project">Delete</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Projects Table Tab
function renderProjectsTable() {
  const tbody = document.getElementById('projectsTableBody');
  if (!tbody) return;

  if (!Array.isArray(myProjects) || myProjects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: #94a3b8;">No projects enrolled.</td></tr>';
    return;
  }

  tbody.innerHTML = myProjects.map(p => {
    const projId = p._id || p.id;
    const isLeader = String(p.teamLeaderId?._id || p.teamLeaderId?.id || p.teamLeaderId) === String(currentStudent?.id);
    const statusClass = (p.status || 'Pending').toLowerCase().replace(/\s+/g, '');
    return `
      <tr>
        <td><strong>${escapeHtml(p.projectName)}</strong></td>
        <td>${escapeHtml(p.domain || 'N/A')}</td>
        <td>${escapeHtml(p.facultyId?.name || 'Assigned Faculty Guide')}</td>
        <td>${isLeader ? '<span class="badge badge-approved">Team Leader</span>' : '<span class="badge badge-draft">Member</span>'}</td>
        <td>${formatDate(p.deadline)}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="progress-container" style="width: 70px;">
              <div class="progress-bar-fill" style="width: ${p.progress || 0}%;"></div>
            </div>
            <span style="font-size: 12px; font-weight: 600;">${p.progress || 0}%</span>
          </div>
        </td>
        <td><span class="badge badge-${statusClass}">${escapeHtml(p.status || 'Pending')}</span></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" onclick="openProjectMilestones('${projId}')">View</button>
            <button class="btn btn-sm btn-outline-primary" onclick="openProjectDocuments('${projId}')" title="Upload / View Documents">📁 Files</button>
            <button class="btn btn-sm btn-outline-primary" onclick="openProjectReport('${projId}')" title="Academic Progress Report">📄 Report</button>
            ${isLeader ? `
              <button class="btn btn-sm btn-outline-primary" onclick="openEditProjectModal('${projId}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="handleDeleteProject('${projId}', '${escapeHtml(p.projectName)}')">Delete</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.openProjectReport = function(projectId) {
  currentSelectedProjectId = projectId;
  const selectEl = document.getElementById('reportProjectSelect');
  if (selectEl) selectEl.value = projectId;
  switchTab('tabReport');
};

// Populate Project Select Dropdowns
function populateProjectDropdowns() {
  const selects = [
    { id: 'teamProjectSelect', handler: handleTeamProjectChange },
    { id: 'milestoneProjectSelect', handler: handleMilestoneProjectChange },
    { id: 'taskProjectSelect', handler: handleTaskProjectChange },
    { id: 'documentProjectSelect', handler: handleDocumentProjectChange },
    { id: 'uploadDocProjectSelect', handler: () => {} },
    { id: 'reportProjectSelect', handler: (pid) => renderProjectReport(pid) }
  ];

  selects.forEach(({ id, handler }) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (!Array.isArray(myProjects) || myProjects.length === 0) {
      el.innerHTML = '<option value="">-- No projects found --</option>';
      return;
    }

    el.innerHTML = myProjects.map(p => {
      const pId = p._id || p.id;
      return `<option value="${pId}">${escapeHtml(p.projectName)}</option>`;
    }).join('');

    el.onchange = (e) => handler(e.target.value);

    const firstId = myProjects[0]._id || myProjects[0].id;
    el.value = firstId;
    handler(firstId);
  });
}

// Tab Actions
window.openProjectMilestones = function(projectId) {
  switchTab('tabMilestones');
  const sel = document.getElementById('milestoneProjectSelect');
  if (sel) {
    sel.value = projectId;
    handleMilestoneProjectChange(projectId);
  }
};

window.openProjectTasks = function(projectId) {
  switchTab('tabTasks');
  const sel = document.getElementById('taskProjectSelect');
  if (sel) {
    sel.value = projectId;
    handleTaskProjectChange(projectId);
  }
};

// --------------------------------------------------------------------------
// TEAM TAB
// --------------------------------------------------------------------------
function handleTeamProjectChange(projectId) {
  selectedProjectForTeam = myProjects.find(p => (p._id || p.id) === projectId) || myProjects[0];
  renderTeamMembers();
}

function renderTeamMembers() {
  const container = document.getElementById('teamContainer');
  if (!container || !selectedProjectForTeam) return;

  const p = selectedProjectForTeam;
  const members = p.teamMemberIds || [];

  container.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h3 style="font-size: 18px; margin-bottom: 4px;">${p.projectName}</h3>
      <p style="color: var(--text-muted); font-size: 13px;">Faculty Guide: <strong>${p.facultyId?.name}</strong> &bull; Total Members: <strong>${members.length}</strong></p>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
      ${members.map((m, idx) => {
        const isLeader = p.teamLeaderId?._id === m._id;
        return `
          <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 12px; padding: 18px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div class="user-avatar" style="width: 42px; height: 42px; background: #3b82f6;">${m.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <h4 style="font-size: 14px; margin: 0;">${m.name}</h4>
                <div style="font-size: 12px; color: #64748b;">${m.registerNumber}</div>
              </div>
            </div>
            <div style="font-size: 12px; color: #475569; display: flex; flex-direction: column; gap: 4px;">
              <div>Department: ${m.department || 'Computer Science & Engineering'}</div>
              <div>Email: ${m.email || 'N/A'}</div>
              <div>Phone: ${m.phone || 'N/A'}</div>
            </div>
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #f1f5f9;">
              ${isLeader ? '<span class="badge badge-inprogress">Team Leader</span>' : '<span class="badge badge-draft">Team Member</span>'}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// --------------------------------------------------------------------------
// MILESTONES TAB
// --------------------------------------------------------------------------
let currentProjectMilestones = [];

async function handleMilestoneProjectChange(projectId) {
  selectedProjectForMilestone = projectId;
  const container = document.getElementById('milestonesListContainer');
  if (!container) return;

  try {
    const res = await apiRequest(`/milestones/${projectId}`);
    if (res.success) {
      currentProjectMilestones = res.data || [];
      const milestones = currentProjectMilestones;
      if (milestones.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); padding: 24px; text-align: center;">No milestones created yet. Click "Add Milestone" to start.</p>';
        return;
      }

      container.innerHTML = milestones.map(m => {
        let deadlineBadgeHtml = '';
        if (m.deadlineStatus === 'Pending_Approval') {
          deadlineBadgeHtml = `
            <div style="margin-top: 8px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 6px 10px; font-size: 11px; color: #1e40af; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
              <span><strong>⏳ Extension Requested:</strong> Proposed new date: <strong>${formatDate(m.requestedDeadline)}</strong></span>
              <span style="font-weight: 600; color: #2563eb;">Awaiting Faculty Approval</span>
            </div>
          `;
        } else if (m.deadlineStatus === 'Rejected') {
          deadlineBadgeHtml = `
            <div style="margin-top: 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 6px 10px; font-size: 11px; color: #991b1b;">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
                <span><strong>⚠️ Extension Rejected by Faculty:</strong> Must submit on previous allocated date: <strong>${formatDate(m.previousDeadline || m.allocatedDeadline || m.deadline)}</strong></span>
                <span style="font-weight: 700; color: #dc2626;">Original Date Enforced</span>
              </div>
              ${m.facultyDeadlineRemarks ? `<div style="font-size: 11px; margin-top: 3px; color: #7f1d1d; font-style: italic;">Remark: "${escapeHtml(m.facultyDeadlineRemarks)}"</div>` : ''}
            </div>
          `;
        } else if (m.deadlineStatus === 'Approved' && m.allocatedDeadline && m.allocatedDeadline !== m.deadline) {
          deadlineBadgeHtml = `
            <div style="margin-top: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 4px 8px; font-size: 11px; color: #166534;">
              <span>✓ Extension Approved by Faculty: New deadline active (<strong>${formatDate(m.deadline)}</strong>)</span>
            </div>
          `;
        }

        return `
        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              <h4 style="font-size: 16px; margin-bottom: 4px;">${escapeHtml(m.name)}</h4>
              <p style="font-size: 13px; color: var(--text-muted);">${escapeHtml(m.description || 'No description')}</p>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <span class="badge badge-${m.status === 'Completed' ? 'completed' : 'inprogress'}">${m.status}</span>
            </div>
          </div>

          ${deadlineBadgeHtml}

          <div style="margin: 14px 0;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
              <span>Milestone Progress</span>
              <strong>${m.progress || 0}%</strong>
            </div>
            <div class="progress-container">
              <div class="progress-bar-fill" style="width: ${m.progress || 0}%;"></div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #64748b;">
            <span>${formatDate(m.startDate)} &rarr; <strong>${formatDate(m.deadline)}</strong></span>
            <div style="display: flex; gap: 8px;">
              ${m.status !== 'Completed' ? `<button class="btn btn-sm btn-secondary" onclick="markMilestoneComplete('${m._id || m.id}')">Mark Complete</button>` : ''}
              <button class="btn btn-sm btn-outline-primary" onclick="openEditMilestoneModal('${m._id || m.id}')">✏️ Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteMilestone('${m._id || m.id}')">Delete</button>
            </div>
          </div>
        </div>
      `;
      }).join('');
    }
  } catch (err) {
    container.innerHTML = '<p style="color: red;">Error loading milestones.</p>';
  }
}

window.openEditMilestoneModal = function(id) {
  const m = currentProjectMilestones.find(item => String(item._id || item.id) === String(id));
  if (!m) {
    showToast('Milestone details not found', 'error');
    return;
  }
  document.getElementById('editMsIdHidden').value = m._id || m.id;
  document.getElementById('editMsName').value = m.name || '';
  document.getElementById('editMsDesc').value = m.description || '';
  document.getElementById('editMsStartDate').value = m.startDate ? new Date(m.startDate).toISOString().split('T')[0] : '';
  document.getElementById('editMsDeadline').value = m.deadline ? new Date(m.deadline).toISOString().split('T')[0] : '';
  document.getElementById('editMsStatus').value = m.status || 'Not Started';
  document.getElementById('editMsProgress').value = m.progress !== undefined ? m.progress : 0;

  const reasonEl = document.getElementById('editMsDeadlineReason');
  if (reasonEl) reasonEl.value = m.deadlineChangeReason || '';

  document.getElementById('editMilestoneModal').classList.add('active');
};

async function handleEditMilestoneSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editMsIdHidden').value;
  const name = document.getElementById('editMsName').value.trim();
  const description = document.getElementById('editMsDesc').value.trim();
  const startDate = document.getElementById('editMsStartDate').value;
  const deadline = document.getElementById('editMsDeadline').value;
  const status = document.getElementById('editMsStatus').value;
  const progress = Number(document.getElementById('editMsProgress').value || 0);
  const deadlineChangeReason = document.getElementById('editMsDeadlineReason')?.value.trim() || '';

  try {
    const res = await apiRequest(`/milestones/${id}`, 'PUT', {
      name,
      description,
      startDate,
      deadline,
      status,
      progress,
      deadlineChangeReason
    });
    if (res.success) {
      showToast('Milestone updated! Faculty mentor notified for deadline approval.', 'success');
      document.getElementById('editMilestoneModal').classList.remove('active');
      handleMilestoneProjectChange(selectedProjectForMilestone);
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message || 'Failed to update milestone', 'error');
  }
}

async function handleCreateMilestoneSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('msName').value.trim();
  const description = document.getElementById('msDesc').value.trim();
  const startDate = document.getElementById('msStartDate').value;
  const deadline = document.getElementById('msDeadline').value;
  const status = document.getElementById('msStatus').value;

  try {
    const res = await apiRequest('/milestones', 'POST', {
      projectId: selectedProjectForMilestone,
      name,
      description,
      startDate,
      deadline,
      status
    });
    if (res.success) {
      showToast('Milestone created successfully!', 'success');
      document.getElementById('addMilestoneModal').classList.remove('active');
      document.getElementById('addMilestoneForm').reset();
      handleMilestoneProjectChange(selectedProjectForMilestone);
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message || 'Failed to create milestone', 'error');
  }
}

window.markMilestoneComplete = async function(id) {
  try {
    await apiRequest(`/milestones/${id}`, 'PUT', { status: 'Completed', progress: 100 });
    showToast('Milestone marked as Completed!', 'success');
    handleMilestoneProjectChange(selectedProjectForMilestone);
    loadDashboardData();
  } catch (err) {
    showToast('Failed to update milestone', 'error');
  }
};

window.deleteMilestone = async function(id) {
  if (!confirm('Are you sure you want to delete this milestone and its tasks?')) return;
  try {
    await apiRequest(`/milestones/${id}`, 'DELETE');
    showToast('Milestone deleted. Faculty notified.', 'success');
    handleMilestoneProjectChange(selectedProjectForMilestone);
    loadDashboardData();
  } catch (err) {
    showToast('Failed to delete milestone', 'error');
  }
};

// --------------------------------------------------------------------------
// TASKS TAB
// --------------------------------------------------------------------------
let currentProjectTasks = [];

async function handleTaskProjectChange(projectId) {
  selectedProjectForTask = projectId;
  const tbody = document.getElementById('tasksTableBody');
  if (!tbody) return;

  try {
    const res = await apiRequest(`/tasks/${projectId}`);
    if (res.success) {
      currentProjectTasks = res.data || [];
      const tasks = currentProjectTasks;
      if (tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8;">No tasks created. Click "Create Task" to add.</td></tr>';
        return;
      }

      tbody.innerHTML = tasks.map(t => {
        const priorityColors = {
          Low: '#64748b',
          Medium: '#2563eb',
          High: '#d97706',
          Critical: '#dc2626'
        };
        const isCompleted = t.status === 'Completed';

        // Format Assignee: Single, Multiple, or Group
        let assigneeHtml = '';
        if (t.isGroupTask || t.assignedTo?.isGroup || t.assignedTo === 'ALL') {
          assigneeHtml = `<span class="badge badge-submitted" style="display: inline-flex; align-items: center; gap: 4px; font-weight: 600;">👥 Entire Team</span>`;
        } else if (Array.isArray(t.assignedMembers) && t.assignedMembers.length > 1) {
          const names = t.assignedMembers.map(m => m.name).join(', ');
          assigneeHtml = `
            <div>
              <span class="badge badge-inprogress" style="font-size: 11px; padding: 2px 6px;">👥 ${t.assignedMembers.length} Members</span>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px; max-width: 180px; white-space: normal;" title="${names}">${names}</div>
            </div>
          `;
        } else if (Array.isArray(t.assignedMembers) && t.assignedMembers.length === 1) {
          const m = t.assignedMembers[0];
          assigneeHtml = `<strong>${m.name}</strong> <span style="font-size: 11px; color: #64748b;">(${m.registerNumber || ''})</span>`;
        } else {
          assigneeHtml = `<strong>${t.assignedTo?.name || 'Unassigned'}</strong> ${t.assignedTo?.registerNumber ? `<span style="font-size: 11px; color: #64748b;">(${t.assignedTo.registerNumber})</span>` : ''}`;
        }

        let taskDeadlineHtml = `<strong>${formatDate(t.deadline)}</strong>`;
        if (t.deadlineStatus === 'Pending_Approval') {
          taskDeadlineHtml += `
            <div style="font-size: 10px; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 2px 4px; margin-top: 3px; font-weight: 600;">
              ⏳ Extension Req: ${formatDate(t.requestedDeadline)} (Pending)
            </div>
          `;
        } else if (t.deadlineStatus === 'Rejected') {
          taskDeadlineHtml += `
            <div style="font-size: 10px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 2px 4px; margin-top: 3px; font-weight: 600;">
              ⚠️ Ext. Rejected (Submit by: ${formatDate(t.previousDeadline || t.allocatedDeadline || t.deadline)})
            </div>
          `;
        } else if (t.deadlineStatus === 'Approved' && t.allocatedDeadline && t.allocatedDeadline !== t.deadline) {
          taskDeadlineHtml += `
            <div style="font-size: 10px; color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; padding: 2px 4px; margin-top: 3px;">
              ✓ Ext. Approved
            </div>
          `;
        }

        return `
          <tr>
            <td><strong>${escapeHtml(t.name)}</strong><div style="font-size: 11px; color: #64748b;">${escapeHtml(t.description || '')}</div></td>
            <td>${escapeHtml(t.milestoneId?.name || 'N/A')}</td>
            <td>${assigneeHtml}</td>
            <td><span style="font-weight: 600; color: ${priorityColors[t.priority] || '#333'};">${t.priority}</span></td>
            <td>${taskDeadlineHtml}</td>
            <td>
              <select class="form-select" style="font-size: 12px; padding: 4px 8px; width: 120px;" onchange="updateTaskStatus('${t._id || t.id}', this.value)">
                <option value="To Do" ${t.status === 'To Do' ? 'selected' : ''}>To Do</option>
                <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                <option value="Completed" ${isCompleted ? 'selected' : ''}>Completed</option>
                <option value="Overdue" ${t.status === 'Overdue' ? 'selected' : ''}>Overdue</option>
              </select>
            </td>
            <td>
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-sm btn-outline-primary" onclick="openEditTaskModal('${t._id || t.id}')" title="Edit Task">✏️ Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteTask('${t._id || t.id}')" title="Delete Task">&times;</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="color: red;">Failed to load tasks.</td></tr>';
  }
}

async function populateTaskModalDropdowns() {
  const milestoneSelect = document.getElementById('taskMilestoneSelect');
  const assignContainer = document.getElementById('taskAssignCheckboxContainer');

  const p = myProjects.find(item => item._id === selectedProjectForTask);
  if (p && assignContainer) {
    const members = p.teamMemberIds || [];
    assignContainer.innerHTML = members.map((m, idx) => `
      <label class="task-member-checkbox-label" style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
        <input type="checkbox" name="taskAssignMember" value="${m._id || m.id}" style="cursor: pointer;" onchange="updateTaskAssignSummary()">
        <span class="user-avatar" style="width: 22px; height: 22px; font-size: 10px; background: #6366f1; border-radius: 50%; color: #ffffff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700;">${(m.name || 'S').slice(0, 2).toUpperCase()}</span>
        <span style="font-size: 13px; font-weight: 500; color: #1e293b;">${m.name}</span>
        <span style="font-size: 11px; color: #64748b;">(${m.registerNumber || ''})</span>
        ${m.isLeader ? '<span class="badge badge-inprogress" style="font-size: 10px; margin-left: auto; padding: 1px 5px;">Leader</span>' : ''}
      </label>
    `).join('');
    updateTaskAssignSummary();
  }

  // Bind Assign All & Clear buttons
  const btnAll = document.getElementById('btnAssignAllMembers');
  const btnClear = document.getElementById('btnClearAssignMembers');
  if (btnAll) {
    btnAll.onclick = () => {
      document.querySelectorAll('input[name="taskAssignMember"]').forEach(cb => cb.checked = true);
      updateTaskAssignSummary();
    };
  }
  if (btnClear) {
    btnClear.onclick = () => {
      document.querySelectorAll('input[name="taskAssignMember"]').forEach(cb => cb.checked = false);
      updateTaskAssignSummary();
    };
  }

  if (milestoneSelect) {
    try {
      const res = await apiRequest(`/milestones/${selectedProjectForTask}`);
      if (res.success) {
        milestoneSelect.innerHTML = res.data.map(m => `<option value="${m._id}">${m.name}</option>`).join('');
      }
    } catch (e) {}
  }
}

window.updateTaskAssignSummary = function() {
  const checkboxes = document.querySelectorAll('input[name="taskAssignMember"]');
  const checked = document.querySelectorAll('input[name="taskAssignMember"]:checked');
  const summaryEl = document.getElementById('taskAssignSelectionSummary');
  if (!summaryEl) return;

  if (checkboxes.length === 0) {
    summaryEl.innerHTML = '<span style="color: #64748b;">No members found in project.</span>';
    return;
  }

  if (checked.length === 0) {
    summaryEl.innerHTML = '<span style="color: #ef4444; font-weight: 500;">⚠️ Please check at least one member or click "Entire Team" for a group task.</span>';
  } else if (checked.length === checkboxes.length) {
    summaryEl.innerHTML = '<span style="color: #4338ca; font-weight: 600;">👥 Group Task (All ' + checked.length + ' members assigned)</span>';
  } else if (checked.length === 1) {
    const parentLabel = checked[0].closest('label');
    const name = parentLabel ? parentLabel.querySelector('span[style*="font-weight: 500"]')?.textContent : '1 member';
    summaryEl.innerHTML = '<span style="color: #059669; font-weight: 600;">👤 Individual Task (' + name + ')</span>';
  } else {
    summaryEl.innerHTML = '<span style="color: #2563eb; font-weight: 600;">👥 Multiple Members (' + checked.length + ' members selected)</span>';
  }
};

window.openEditTaskModal = async function(taskId) {
  const t = currentProjectTasks.find(item => String(item._id || item.id) === String(taskId));
  if (!t) {
    showToast('Task details not found', 'error');
    return;
  }

  document.getElementById('editTaskIdHidden').value = t._id || t.id;
  document.getElementById('editTaskName').value = t.name || '';
  document.getElementById('editTaskDesc').value = t.description || '';
  document.getElementById('editTaskPriority').value = t.priority || 'Medium';
  document.getElementById('editTaskStatus').value = t.status || 'To Do';
  document.getElementById('editTaskDeadline').value = t.deadline ? new Date(t.deadline).toISOString().split('T')[0] : '';

  const reasonEl = document.getElementById('editTaskDeadlineReason');
  if (reasonEl) reasonEl.value = t.deadlineChangeReason || '';

  // Populate milestone select
  const msSelect = document.getElementById('editTaskMilestoneSelect');
  if (msSelect) {
    try {
      const res = await apiRequest(`/milestones/${selectedProjectForTask}`);
      if (res.success) {
        const currentMsId = t.milestoneId?._id || t.milestoneId?.id || t.milestoneId;
        msSelect.innerHTML = res.data.map(m => `
          <option value="${m._id}" ${String(m._id) === String(currentMsId) ? 'selected' : ''}>${m.name}</option>
        `).join('');
      }
    } catch (e) {}
  }

  // Populate assigned members
  const p = myProjects.find(item => item._id === selectedProjectForTask);
  const container = document.getElementById('editTaskAssignContainer');
  if (p && container) {
    const members = p.teamMemberIds || [];
    const currentlyAssignedIds = Array.isArray(t.assignedMembers)
      ? t.assignedMembers.map(m => String(m._id || m.id || m))
      : (Array.isArray(t.assignedTo) ? t.assignedTo.map(String) : (t.assignedTo === 'ALL' || t.isGroupTask ? members.map(m => String(m._id || m.id)) : [String(t.assignedTo?._id || t.assignedTo?.id || t.assignedTo)]));

    container.innerHTML = members.map(m => {
      const mId = String(m._id || m.id);
      const isChecked = t.isGroupTask || t.assignedTo === 'ALL' || currentlyAssignedIds.includes(mId);
      return `
        <label class="task-member-checkbox-label" style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
          <input type="checkbox" name="editTaskAssignMember" value="${mId}" ${isChecked ? 'checked' : ''} onchange="updateEditTaskAssignSummary()">
          <span class="user-avatar" style="width: 22px; height: 22px; font-size: 10px; background: #6366f1; border-radius: 50%; color: #ffffff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700;">${(m.name || 'S').slice(0, 2).toUpperCase()}</span>
          <span style="font-size: 13px; font-weight: 500; color: #1e293b;">${m.name}</span>
          <span style="font-size: 11px; color: #64748b;">(${m.registerNumber || ''})</span>
          ${m.isLeader ? '<span class="badge badge-inprogress" style="font-size: 10px; margin-left: auto; padding: 1px 5px;">Leader</span>' : ''}
        </label>
      `;
    }).join('');
    updateEditTaskAssignSummary();
  }

  // Bind Assign All & Clear for edit modal
  const btnAll = document.getElementById('btnEditTaskAssignAll');
  const btnClear = document.getElementById('btnEditTaskAssignClear');
  if (btnAll) {
    btnAll.onclick = () => {
      document.querySelectorAll('input[name="editTaskAssignMember"]').forEach(cb => cb.checked = true);
      updateEditTaskAssignSummary();
    };
  }
  if (btnClear) {
    btnClear.onclick = () => {
      document.querySelectorAll('input[name="editTaskAssignMember"]').forEach(cb => cb.checked = false);
      updateEditTaskAssignSummary();
    };
  }

  document.getElementById('editTaskModal').classList.add('active');
};

window.updateEditTaskAssignSummary = function() {
  const checkboxes = document.querySelectorAll('input[name="editTaskAssignMember"]');
  const checked = document.querySelectorAll('input[name="editTaskAssignMember"]:checked');
  const summaryEl = document.getElementById('editTaskAssignSummary');
  if (!summaryEl) return;

  if (checkboxes.length === 0) {
    summaryEl.innerHTML = '<span style="color: #64748b;">No members found in project.</span>';
    return;
  }

  if (checked.length === 0) {
    summaryEl.innerHTML = '<span style="color: #ef4444; font-weight: 500;">⚠️ Please check at least one member or click "Entire Team" for a group task.</span>';
  } else if (checked.length === checkboxes.length) {
    summaryEl.innerHTML = '<span style="color: #4338ca; font-weight: 600;">👥 Group Task (All ' + checked.length + ' members assigned)</span>';
  } else if (checked.length === 1) {
    const parentLabel = checked[0].closest('label');
    const name = parentLabel ? parentLabel.querySelector('span[style*="font-weight: 500"]')?.textContent : '1 member';
    summaryEl.innerHTML = '<span style="color: #059669; font-weight: 600;">👤 Individual Task (' + name + ')</span>';
  } else {
    summaryEl.innerHTML = '<span style="color: #2563eb; font-weight: 600;">👥 Multiple Members (' + checked.length + ' members selected)</span>';
  }
};

async function handleEditTaskSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editTaskIdHidden').value;
  const name = document.getElementById('editTaskName').value.trim();
  const description = document.getElementById('editTaskDesc').value.trim();
  const milestoneId = document.getElementById('editTaskMilestoneSelect').value;
  const priority = document.getElementById('editTaskPriority').value;
  const deadline = document.getElementById('editTaskDeadline').value;
  const status = document.getElementById('editTaskStatus').value;
  const deadlineChangeReason = document.getElementById('editTaskDeadlineReason')?.value.trim() || '';

  const checkedBoxes = document.querySelectorAll('input[name="editTaskAssignMember"]:checked');
  const allBoxes = document.querySelectorAll('input[name="editTaskAssignMember"]');
  const assignedTo = Array.from(checkedBoxes).map(cb => cb.value);
  const isGroupTask = (assignedTo.length === allBoxes.length && allBoxes.length > 0);

  if (assignedTo.length === 0) {
    showToast('Please assign at least one team member or click "Entire Team"', 'warning');
    return;
  }

  try {
    const res = await apiRequest(`/tasks/${id}`, 'PUT', {
      name,
      description,
      milestoneId,
      priority,
      deadline,
      status,
      assignedTo: isGroupTask ? 'ALL' : assignedTo,
      assignedMembers: assignedTo,
      isGroupTask,
      deadlineChangeReason
    });
    if (res.success) {
      showToast('Task updated! Faculty mentor notified for deadline approval.', 'success');
      document.getElementById('editTaskModal').classList.remove('active');
      handleTaskProjectChange(selectedProjectForTask);
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message || 'Failed to update task', 'error');
  }
}

async function handleCreateTaskSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('taskName').value.trim();
  const description = document.getElementById('taskDesc').value.trim();
  const milestoneId = document.getElementById('taskMilestoneSelect').value;
  const priority = document.getElementById('taskPriority').value;
  const deadline = document.getElementById('taskDeadline').value;

  const checkedBoxes = document.querySelectorAll('input[name="taskAssignMember"]:checked');
  const allBoxes = document.querySelectorAll('input[name="taskAssignMember"]');
  const assignedTo = Array.from(checkedBoxes).map(cb => cb.value);
  const isGroupTask = (assignedTo.length === allBoxes.length && allBoxes.length > 0);

  if (assignedTo.length === 0) {
    showToast('Please assign at least one team member or click "Entire Team"', 'warning');
    return;
  }

  try {
    const res = await apiRequest('/tasks', 'POST', {
      projectId: selectedProjectForTask,
      milestoneId,
      name,
      description,
      assignedTo: isGroupTask ? 'ALL' : assignedTo,
      assignedMembers: assignedTo,
      isGroupTask,
      priority,
      deadline
    });
    if (res.success) {
      showToast(isGroupTask ? 'Group task created successfully!' : 'Task created successfully!', 'success');
      document.getElementById('addTaskModal').classList.remove('active');
      document.getElementById('addTaskForm').reset();
      handleTaskProjectChange(selectedProjectForTask);
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message || 'Failed to create task', 'error');
  }
}

window.updateTaskStatus = async function(taskId, status) {
  try {
    await apiRequest(`/tasks/${taskId}`, 'PUT', { status });
    showToast(`Task status updated to ${status}`, 'success');
    handleTaskProjectChange(selectedProjectForTask);
    loadDashboardData();
  } catch (err) {
    showToast('Failed to update task', 'error');
  }
};

window.deleteTask = async function(taskId) {
  if (!confirm('Are you sure you want to delete this task?')) return;
  try {
    await apiRequest(`/tasks/${taskId}`, 'DELETE');
    showToast('Task deleted. Faculty notified.', 'success');
    handleTaskProjectChange(selectedProjectForTask);
    loadDashboardData();
  } catch (err) {
    showToast('Failed to delete task', 'error');
  }
};


// --------------------------------------------------------------------------
// NOTIFICATIONS TAB
// --------------------------------------------------------------------------
async function renderNotificationInbox() {
  const container = document.getElementById('pageNotifList');
  if (!container) return;

  try {
    const res = await apiRequest('/notifications');
    if (res.success) {
      if (!res.data || res.data.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; color: #94a3b8;">
            <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
            <h4 style="font-size: 16px; font-weight: 700; color: #334155; margin-bottom: 4px;">All Caught Up!</h4>
            <p style="font-size: 13px; color: #94a3b8;">You have no active notifications or pending alerts.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = res.data.map(n => {
        const notifId = n._id || n.id;
        return `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 18px; border: 1px solid ${n.read ? '#e2e8f0' : '#bfdbfe'}; background: ${n.read ? '#ffffff' : '#f0f7ff'}; border-radius: 10px; margin-bottom: 10px; transition: all 0.2s ease;">
            <div style="flex: 1; margin-right: 16px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 14px; color: #0f172a;">${escapeHtml(n.title)}</span>
                ${!n.read ? '<span style="font-size: 10px; background: #2563eb; color: #ffffff; padding: 1px 6px; border-radius: 9999px; font-weight: 700;">NEW</span>' : ''}
              </div>
              <div style="font-size: 13px; color: #334155; line-height: 1.5;">${escapeHtml(n.message)}</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 6px; display: flex; align-items: center; gap: 12px;">
                <span>🕒 ${formatDate(n.createdAt)}</span>
                <span style="color: #059669; font-weight: 500;">✓ Email Dispatched</span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
              ${!n.read ? `<button class="btn btn-sm btn-secondary" onclick="markNotifRead('${notifId}'); renderNotificationInbox();" style="font-size: 12px; padding: 4px 10px;">Mark Read</button>` : ''}
              <button class="btn btn-sm btn-danger" onclick="deleteSingleNotif('${notifId}', event)" title="Clear this alert" style="font-size: 12px; padding: 4px 10px; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;">Clear</button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    container.innerHTML = '<p style="color: red; padding: 20px;">Failed to load notifications.</p>';
  }
}

window.renderNotificationInbox = renderNotificationInbox;

const pageMarkAllRead = document.getElementById('btnPageMarkAllRead');
if (pageMarkAllRead) {
  pageMarkAllRead.addEventListener('click', async () => {
    await markAllNotificationsRead();
    renderNotificationInbox();
  });
}

const pageClearAll = document.getElementById('btnPageClearAll');
if (pageClearAll) {
  pageClearAll.addEventListener('click', async () => {
    await clearAllNotifications();
    renderNotificationInbox();
  });
}

// --------------------------------------------------------------------------
// PROFILE & SETTINGS
// --------------------------------------------------------------------------
function setupSettingsAndProfile() {
  // Populate Profile
  const pName = document.getElementById('profName');
  const pReg = document.getElementById('profRegNo');
  const pEmail = document.getElementById('profEmail');
  const pDept = document.getElementById('profDept');
  const pYear = document.getElementById('profYear');
  const pPhone = document.getElementById('profPhone');

  if (pName) pName.value = currentStudent.name;
  if (pReg) pReg.value = currentStudent.registerNumber;
  if (pEmail) pEmail.value = currentStudent.email;
  if (pDept) pDept.value = currentStudent.department || '';
  if (pYear) pYear.value = currentStudent.year || '';
  if (pPhone) pPhone.value = currentStudent.phone || '';

  const profForm = document.getElementById('profileForm');
  if (profForm) {
    profForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await apiRequest('/auth/profile', 'PUT', {
          department: pDept ? pDept.value : undefined,
          year: pYear ? pYear.value : undefined,
          phone: pPhone ? pPhone.value : undefined
        });
        if (res.success) {
          showToast('Profile updated successfully!', 'success');
          if (res.user) {
            currentStudent = { ...currentStudent, ...res.user };
            setSession(getToken(), currentStudent);
          }
          await loadFacultyDropdown();
        }
      } catch (err) {
        showToast('Failed to update profile', 'error');
      }
    });
  }

  // Load Notification Preferences
  loadPreferences();

  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        email: document.getElementById('prefEmail') ? document.getElementById('prefEmail').checked : true,
        inApp: document.getElementById('prefInApp') ? document.getElementById('prefInApp').checked : true,
        reminder3Day: document.getElementById('pref3Day') ? document.getElementById('pref3Day').checked : true,
        reminder1Day: document.getElementById('pref1Day') ? document.getElementById('pref1Day').checked : true,
        reminderDeadlineDay: document.getElementById('prefDeadline') ? document.getElementById('prefDeadline').checked : true,
        reminderOverdue: document.getElementById('prefOverdue') ? document.getElementById('prefOverdue').checked : true
      };

      try {
        await apiRequest('/notifications/preferences', 'PUT', payload);
        showToast('Notification settings saved!', 'success');
      } catch (err) {
        showToast('Failed to save settings', 'error');
      }
    });
  }
}

async function loadPreferences() {
  try {
    const res = await apiRequest('/notifications/preferences');
    if (res.success && res.data) {
      const p = res.data;
      if (document.getElementById('prefEmail')) document.getElementById('prefEmail').checked = p.email !== false;
      if (document.getElementById('prefInApp')) document.getElementById('prefInApp').checked = p.inApp !== false;
      if (document.getElementById('pref3Day')) document.getElementById('pref3Day').checked = p.reminder3Day !== false;
      if (document.getElementById('pref1Day')) document.getElementById('pref1Day').checked = p.reminder1Day !== false;
      if (document.getElementById('prefDeadline')) document.getElementById('prefDeadline').checked = p.reminderDeadlineDay !== false;
      if (document.getElementById('prefOverdue')) document.getElementById('prefOverdue').checked = p.reminderOverdue !== false;
    }
  } catch (e) {}
}

// --------------------------------------------------------------------------
// ACADEMIC PROJECT REPORT CONTROLLER
// --------------------------------------------------------------------------
async function renderProjectReport(specificProjectId = null) {
  const container = document.getElementById('printableReportContainer');
  const selectEl = document.getElementById('reportProjectSelect');
  if (!container) return;

  // 1. Ensure myProjects is loaded
  if (!Array.isArray(myProjects) || myProjects.length === 0) {
    try {
      const pRes = await apiRequest('/projects');
      if (pRes.success && Array.isArray(pRes.data)) {
        myProjects = pRes.data;
      }
    } catch (err) {
      console.warn('Could not load projects for report:', err);
    }
  }

  // 2. Populate project selector dropdown
  if (selectEl && myProjects.length > 0) {
    const desiredId = specificProjectId || currentSelectedProjectId || selectEl.value || (myProjects[0]?._id || myProjects[0]?.id);
    
    selectEl.innerHTML = myProjects.map(p => {
      const pId = p._id || p.id;
      const isSelected = String(pId) === String(desiredId);
      return `<option value="${pId}" ${isSelected ? 'selected' : ''} style="color: #0f172a; font-weight: 600;">${escapeHtml(p.projectName)} (${escapeHtml(p.department || 'CSE')})</option>`;
    }).join('');

    selectEl.value = desiredId;

    selectEl.onchange = (e) => {
      currentSelectedProjectId = e.target.value;
      renderProjectReport(e.target.value);
    };
  }

  const targetProjectId = specificProjectId || selectEl?.value || currentSelectedProjectId || (myProjects[0]?._id || myProjects[0]?.id);

  if (!targetProjectId) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #94a3b8;">
        <div style="font-size: 40px; margin-bottom: 12px;">📁</div>
        <h3 style="color: #334155; margin-bottom: 8px;">No Project Available</h3>
        <p>Please create or join an academic project first to generate a report.</p>
        <button class="btn btn-primary btn-sm" style="margin-top: 14px;" onclick="switchTab('tabDashboard')">Go to Dashboard</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="text-align: center; padding: 50px 20px; color: #64748b;">
      <div style="font-size: 28px; margin-bottom: 10px;">⏳</div>
      <p style="font-weight: 600;">Generating Academic Project Progress Report...</p>
    </div>
  `;

  try {
    let project = null;
    let milestones = [];
    let tasks = [];

    // Fetch project details
    const projRes = await apiRequest(`/projects/${targetProjectId}`);
    if (projRes && projRes.success && projRes.data) {
      project = projRes.data;
      milestones = Array.isArray(project.milestones) ? project.milestones : [];
      tasks = Array.isArray(project.tasks) ? project.tasks : [];
    }

    // Fallback if milestones or tasks were not embedded
    if (milestones.length === 0) {
      try {
        const msRes = await apiRequest(`/milestones/${targetProjectId}`);
        if (msRes && msRes.success && Array.isArray(msRes.data)) milestones = msRes.data;
      } catch (e) {}
    }

    if (tasks.length === 0) {
      try {
        const tsRes = await apiRequest(`/tasks/${targetProjectId}`);
        if (tsRes && tsRes.success && Array.isArray(tsRes.data)) tasks = tsRes.data;
      } catch (e) {}
    }

    if (!project) {
      container.innerHTML = '<p style="color: red; text-align: center; padding: 40px;">Failed to load project details.</p>';
      return;
    }

    // Calculations & Metrics
    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter(m => m.status === 'Completed').length;
    const milestoneProgress = totalMilestones === 0 ? 0 : Math.round((completedMilestones / totalMilestones) * 100);

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Completed').length;
    const taskProgress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    const now = new Date();
    const overdueTasks = tasks.filter(t => t.status !== 'Completed' && new Date(t.deadline) < now).length;

    // Team member tasks breakdown
    const rawMembers = Array.isArray(project.teamMemberIds) && project.teamMemberIds.length > 0
      ? project.teamMemberIds
      : (Array.isArray(project.teamMembers) ? project.teamMembers : []);

    const teamLeaderId = String(project.teamLeaderId?.id || project.teamLeaderId?._id || project.teamLeaderId || '');

    // Helper: Safely resolve task assignee details (Individual vs Complete Team)
    function getTaskAssigneeDisplayInfo(t, membersList = []) {
      if (t.isGroupTask || t.assignedTo === 'ALL') {
        return {
          text: 'Complete Team (All Members)',
          isTeam: true,
          badgeStyle: 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;',
          icon: '👥'
        };
      }

      // Check assignedMembers array
      if (Array.isArray(t.assignedMembers) && t.assignedMembers.length > 0) {
        const names = t.assignedMembers.map(am => {
          if (!am) return '';
          if (typeof am === 'string') {
            const found = membersList.find(m => String(m.id || m._id || m.registerNumber) === am || (m.registerNumber && String(m.registerNumber).toUpperCase() === am.toUpperCase()));
            if (found) {
              const reg = found.registerNumber ? ` (${found.registerNumber})` : '';
              return `${found.name || 'Member'}${reg}`;
            }
            return am;
          }
          if (typeof am === 'object') {
            const name = am.name || am.fullName || am.registerNumber || '';
            const reg = am.registerNumber ? ` (${am.registerNumber})` : '';
            return name ? `${name}${reg}` : (am.id ? String(am.id) : 'Team Member');
          }
          return String(am);
        }).filter(Boolean);

        if (names.length > 1) {
          return {
            text: names.join(', '),
            isTeam: true,
            badgeStyle: 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;',
            icon: '👥'
          };
        } else if (names.length === 1) {
          return {
            text: names[0],
            isTeam: false,
            badgeStyle: 'background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1;',
            icon: '👤'
          };
        }
      }

      // Check assignedTo
      if (t.assignedTo) {
        if (typeof t.assignedTo === 'object' && t.assignedTo !== null) {
          const name = t.assignedTo.name || t.assignedTo.fullName || t.assignedTo.registerNumber || '';
          const reg = t.assignedTo.registerNumber ? ` (${t.assignedTo.registerNumber})` : '';
          return {
            text: name ? `${name}${reg}` : 'Assigned Member',
            isTeam: false,
            badgeStyle: 'background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1;',
            icon: '👤'
          };
        }

        const val = String(t.assignedTo);
        if (val === 'ALL') {
          return {
            text: 'Complete Team (All Members)',
            isTeam: true,
            badgeStyle: 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;',
            icon: '👥'
          };
        }

        const found = membersList.find(m => String(m.id || m._id || m.registerNumber) === val || (m.registerNumber && String(m.registerNumber).toUpperCase() === val.toUpperCase()));
        if (found) {
          const reg = found.registerNumber ? ` (${found.registerNumber})` : '';
          return {
            text: `${found.name || 'Member'}${reg}`,
            isTeam: false,
            badgeStyle: 'background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1;',
            icon: '👤'
          };
        }

        return {
          text: val,
          isTeam: false,
          badgeStyle: 'background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1;',
          icon: '👤'
        };
      }

      return {
        text: 'Complete Team (All Members)',
        isTeam: true,
        badgeStyle: 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;',
        icon: '👥'
      };
    }

    const memberContributions = rawMembers.map(m => {
      const mId = String(m.id || m._id || m.registerNumber || '');
      const mReg = (m.registerNumber || '').toUpperCase();
      const mEmail = (m.email || '').toLowerCase();
      const isLeader = mId === teamLeaderId || (m.isLeader) || (currentStudent && currentStudent.id === mId && mId === teamLeaderId);

      // Count tasks assigned to this member
      const memberTasks = tasks.filter(t => {
        if (t.isGroupTask || t.assignedTo === 'ALL') return true;
        if (Array.isArray(t.assignedMembers)) {
          return t.assignedMembers.some(am => {
            if (!am) return false;
            if (typeof am === 'object') {
              return String(am.id || am._id || am.registerNumber) === mId || (mReg && String(am.registerNumber || '').toUpperCase() === mReg);
            }
            return String(am) === mId || (mReg && String(am).toUpperCase() === mReg);
          });
        }
        if (Array.isArray(t.assignedTo)) {
          return t.assignedTo.some(aid => String(aid) === mId);
        }
        if (typeof t.assignedTo === 'object' && t.assignedTo) {
          return String(t.assignedTo.id || t.assignedTo._id || t.assignedTo.registerNumber) === mId;
        }
        return String(t.assignedTo) === mId;
      });

      const memberCompleted = memberTasks.filter(t => t.status === 'Completed').length;
      const memberPct = memberTasks.length === 0 ? 0 : Math.round((memberCompleted / memberTasks.length) * 100);

      return {
        name: m.name || m.fullName || 'Student',
        registerNumber: m.registerNumber || 'N/A',
        email: m.email || 'N/A',
        department: m.department || project.department || 'CSE',
        isLeader,
        assignedCount: memberTasks.length,
        completedCount: memberCompleted,
        completionPct: memberPct
      };
    });

    const reportDateStr = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const startDateStr = project.startDate ? new Date(project.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
    const deadlineStr = project.deadline ? new Date(project.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

    const facultyName = project.facultyId?.name || (typeof project.facultyId === 'object' ? project.facultyId?.name : 'Faculty Mentor');
    const facultyEmail = project.facultyId?.email || '';
    const facultyDept = project.facultyId?.department || project.department || 'CSE';
    const facultyDesig = project.facultyId?.designation || 'Assistant Professor / Project Guide';

    // Map and group tasks under respective milestones
    const milestoneMap = new Map();
    milestones.forEach(m => {
      const mKey = String(m._id || m.id || m.name);
      milestoneMap.set(mKey, { milestone: m, tasks: [] });
    });

    const standaloneTasks = [];

    tasks.forEach(t => {
      const tMsId = String(t.milestoneId?._id || t.milestoneId?.id || t.milestoneId || '');
      let matched = false;
      if (tMsId && milestoneMap.has(tMsId)) {
        milestoneMap.get(tMsId).tasks.push(t);
        matched = true;
      } else {
        // Fallback search by milestone name or key
        for (const [key, entry] of milestoneMap.entries()) {
          const m = entry.milestone;
          if (m.name === t.milestoneName || m.name === t.milestoneId || key === tMsId) {
            entry.tasks.push(t);
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        standaloneTasks.push(t);
      }
    });

    // Load and sync Sources / References list
    const defaultSources = [
      `1. IEEE / ACM Research Publications & Literature Survey on ${project.domain || 'Domain Technologies'}`,
      `2. Official Framework Documentation, APIs & Architectural Standards`,
      `3. Open-Source Benchmark Datasets, GitHub Repositories & Academic Guidelines`
    ];

    const storageKey = `rgm_report_sources_${targetProjectId}`;
    let savedSourcesRaw = localStorage.getItem(storageKey);
    let sourcesList = [];

    if (savedSourcesRaw && savedSourcesRaw.trim()) {
      sourcesList = savedSourcesRaw.split('\n').map(s => s.trim()).filter(Boolean);
    } else {
      sourcesList = defaultSources;
      savedSourcesRaw = defaultSources.join('\n');
    }

    const sourcesInput = document.getElementById('reportSourcesInput');
    if (sourcesInput) {
      sourcesInput.value = savedSourcesRaw;
    }

    // Render HTML Sheet
    container.innerHTML = `
      <!-- Institutional Report Header -->
      <div class="report-header">
        <div>
          <div class="report-badge">Academic Project Progress Audit Report</div>
          <h1 class="report-inst-title" style="margin-top: 6px;">RGM COLLEGE OF ENGINEERING & TECHNOLOGY</h1>
          <div class="report-inst-subtitle">Autonomous Institution • Approved by AICTE • Accredited by NAAC with 'A+' Grade</div>
          <div class="report-inst-subtitle" style="font-weight: 600; color: #1e293b; margin-top: 4px;">
            Department of ${escapeHtml(project.department || 'Computer Science & Engineering')} • Academic Year ${escapeHtml(project.year || '2026')}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">Report Generated On:</div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${reportDateStr}</div>
          <div style="display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; background: ${project.status === 'Approved' ? '#ecfdf5' : '#fffbeb'}; color: ${project.status === 'Approved' ? '#059669' : '#d97706'}; border: 1px solid ${project.status === 'Approved' ? '#a7f3d0' : '#fde68a'};">
            Status: ${escapeHtml(project.status || 'In Progress')}
          </div>
        </div>
      </div>

      <!-- Executive Overview -->
      <div class="report-section">
        <h3 class="report-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          1. Project Executive Overview
        </h3>
        <div class="report-grid-2">
          <div class="report-info-box">
            <label>Project Title</label>
            <span style="font-size: 15px; color: #2563eb;">${escapeHtml(project.projectName)}</span>
          </div>
          <div class="report-info-box">
            <label>Domain / Specialization</label>
            <span>${escapeHtml(project.domain || 'Software Development')}</span>
          </div>
          <div class="report-info-box">
            <label>Assigned Faculty Guide</label>
            <span>${escapeHtml(facultyName)} <small style="color: #64748b; font-weight: normal;">(${escapeHtml(facultyDesig)})</small></span>
          </div>
          <div class="report-info-box">
            <label>Timeline & Deadlines</label>
            <span>${startDateStr} &nbsp;➔&nbsp; <strong style="color: #dc2626;">${deadlineStr}</strong></span>
          </div>
        </div>

        <div class="report-info-box" style="margin-top: 12px;">
          <label>Project Abstract & Objectives</label>
          <p style="font-size: 13px; color: #334155; margin-top: 4px; line-height: 1.5;">${escapeHtml(project.description || 'No description provided.')}</p>
        </div>
      </div>

      <!-- Key Performance Indicators -->
      <div class="report-section">
        <h3 class="report-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          2. Progress & Delivery Metrics
        </h3>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
          <div class="report-info-box" style="text-align: center;">
            <label>Overall Completion</label>
            <div style="font-size: 22px; font-weight: 800; color: #2563eb; margin-top: 4px;">${project.progress || milestoneProgress}%</div>
          </div>
          <div class="report-info-box" style="text-align: center;">
            <label>Milestones</label>
            <div style="font-size: 18px; font-weight: 700; color: #059669; margin-top: 4px;">${completedMilestones} / ${totalMilestones} Done</div>
          </div>
          <div class="report-info-box" style="text-align: center;">
            <label>Tasks Completed</label>
            <div style="font-size: 18px; font-weight: 700; color: #0284c7; margin-top: 4px;">${completedTasks} / ${totalTasks} Done</div>
          </div>
          <div class="report-info-box" style="text-align: center;">
            <label>Overdue Items</label>
            <div style="font-size: 18px; font-weight: 700; color: ${overdueTasks > 0 ? '#dc2626' : '#64748b'}; margin-top: 4px;">${overdueTasks} Overdue</div>
          </div>
        </div>
      </div>

      <!-- Team Composition & Work Breakdown -->
      <div class="report-section">
        <h3 class="report-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          3. Team Composition & Individual Contribution Matrix
        </h3>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 25%;">Student Name</th>
              <th style="width: 18%;">Register Number</th>
              <th style="width: 18%;">Role</th>
              <th style="width: 17%;">Tasks Allocated</th>
              <th style="width: 17%;">Contribution</th>
            </tr>
          </thead>
          <tbody>
            ${memberContributions.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: 14px;">No team members registered.</td></tr>' : memberContributions.map((m, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${escapeHtml(m.name)}</strong></td>
                <td><code style="font-weight: 600; color: #0f172a;">${escapeHtml(m.registerNumber)}</code></td>
                <td>${m.isLeader ? '<span style="color: #2563eb; font-weight: 700;">👑 Team Leader</span>' : '<span style="color: #64748b;">Team Member</span>'}</td>
                <td>${m.completedCount} of ${m.assignedCount} tasks completed</td>
                <td>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="flex: 1; height: 6px; background: #e2e8f0; border-radius: 9999px; overflow: hidden;">
                      <div style="width: ${m.completionPct}%; height: 100%; background: #2563eb;"></div>
                    </div>
                    <span style="font-size: 11px; font-weight: 700; color: #0f172a;">${m.completionPct}%</span>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- 4. Milestone Schedule & Associated Tasks Breakdown -->
      <div class="report-section">
        <h3 class="report-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
          4. Milestone Delivery Schedule &amp; Task Execution Breakdown
        </h3>

        ${milestones.length === 0 ? `
          <div style="text-align: center; padding: 20px; color: #94a3b8; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
            No milestones registered for this academic project.
          </div>
        ` : Array.from(milestoneMap.values()).map((entry, idx) => {
          const m = entry.milestone;
          const mTasks = entry.tasks;
          const msStart = m.startDate ? new Date(m.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
          const msDue = m.deadline ? new Date(m.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
          const isDone = m.status === 'Completed';
          const msProgress = m.progress || (isDone ? 100 : 0);
          
          return `
            <div class="milestone-audit-card" style="margin-bottom: 22px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
              <!-- Milestone Card Header -->
              <div style="background: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 14px; font-weight: 700; color: #0f172a;">🚩 Milestone ${idx + 1}: ${escapeHtml(m.name)}</span>
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: ${isDone ? '#ecfdf5' : '#eff6ff'}; color: ${isDone ? '#059669' : '#2563eb'}; border: 1px solid ${isDone ? '#a7f3d0' : '#bfdbfe'};">
                      ${escapeHtml(m.status || 'In Progress')}
                    </span>
                  </div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 3px;">
                    Timeline: <strong>${msStart}</strong> &nbsp;➔&nbsp; <strong style="color: #dc2626;">${msDue}</strong>
                    ${m.description ? ` • <span style="color: #334155;">${escapeHtml(m.description)}</span>` : ''}
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="text-align: right;">
                    <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Milestone Progress: </span>
                    <strong style="font-size: 13.5px; color: ${isDone ? '#059669' : '#2563eb'};">${msProgress}%</strong>
                  </div>
                </div>
              </div>

              <!-- Associated Tasks Table for this Milestone -->
              <table class="report-table" style="margin-top: 0; border: none; border-collapse: collapse; width: 100%;">
                <thead>
                  <tr>
                    <th style="width: 32%;">Task Name / Activity</th>
                    <th style="width: 28%;">Performed By / Assigned To</th>
                    <th style="width: 12%;">Priority</th>
                    <th style="width: 14%;">Target Due</th>
                    <th style="width: 14%;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${mTasks.length === 0 ? `
                    <tr>
                      <td colspan="5" style="text-align: center; padding: 14px; color: #94a3b8; font-style: italic; font-size: 12px;">
                        No individual tasks created under this milestone.
                      </td>
                    </tr>
                  ` : mTasks.map(t => {
                    const assignee = getTaskAssigneeDisplayInfo(t, rawMembers);
                    const tDue = t.deadline ? new Date(t.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
                    const isTaskDone = t.status === 'Completed';
                    const isOverdue = !isTaskDone && t.deadline && new Date(t.deadline) < now;
                    const statusColor = isTaskDone ? '#059669' : (isOverdue ? '#dc2626' : (t.status === 'In Progress' ? '#2563eb' : '#d97706'));
                    const statusBg = isTaskDone ? '#ecfdf5' : (isOverdue ? '#fef2f2' : (t.status === 'In Progress' ? '#eff6ff' : '#fffbeb'));
                    const statusBorder = isTaskDone ? '#a7f3d0' : (isOverdue ? '#fecaca' : (t.status === 'In Progress' ? '#bfdbfe' : '#fde68a'));

                    return `
                      <tr>
                        <td>
                          <strong style="color: #0f172a;">${escapeHtml(t.name)}</strong>
                          ${t.description ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${escapeHtml(t.description)}</div>` : ''}
                        </td>
                        <td>
                          <span style="display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 11.5px; ${assignee.badgeStyle} padding: 3px 8px; border-radius: 4px;">
                            ${assignee.icon} ${escapeHtml(assignee.text)}
                          </span>
                        </td>
                        <td>
                          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: ${t.priority === 'High' || t.priority === 'Critical' ? '#dc2626' : (t.priority === 'Medium' ? '#d97706' : '#2563eb')};">
                            ${escapeHtml(t.priority || 'Medium')}
                          </span>
                        </td>
                        <td style="font-size: 12px; font-weight: 500;">${tDue}</td>
                        <td>
                          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBorder};">
                            ${isOverdue ? '⚠️ Overdue' : escapeHtml(t.status || 'To Do')}
                          </span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;
        }).join('')}

        <!-- Standalone tasks if any -->
        ${standaloneTasks.length > 0 ? `
          <div class="milestone-audit-card" style="margin-bottom: 22px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
            <div style="background: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">
              <span style="font-size: 14px; font-weight: 700; color: #0f172a;">📌 Additional / Standalone Project Tasks</span>
            </div>
            <table class="report-table" style="margin-top: 0; border: none; border-collapse: collapse; width: 100%;">
              <thead>
                <tr>
                  <th style="width: 32%;">Task Name / Activity</th>
                  <th style="width: 28%;">Performed By / Assigned To</th>
                  <th style="width: 12%;">Priority</th>
                  <th style="width: 14%;">Target Due</th>
                  <th style="width: 14%;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${standaloneTasks.map(t => {
                  const assignee = getTaskAssigneeDisplayInfo(t, rawMembers);
                  const tDue = t.deadline ? new Date(t.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
                  const isTaskDone = t.status === 'Completed';
                  const isOverdue = !isTaskDone && t.deadline && new Date(t.deadline) < now;
                  const statusColor = isTaskDone ? '#059669' : (isOverdue ? '#dc2626' : (t.status === 'In Progress' ? '#2563eb' : '#d97706'));
                  const statusBg = isTaskDone ? '#ecfdf5' : (isOverdue ? '#fef2f2' : (t.status === 'In Progress' ? '#eff6ff' : '#fffbeb'));
                  const statusBorder = isTaskDone ? '#a7f3d0' : (isOverdue ? '#fecaca' : (t.status === 'In Progress' ? '#bfdbfe' : '#fde68a'));

                  return `
                    <tr>
                      <td>
                        <strong style="color: #0f172a;">${escapeHtml(t.name)}</strong>
                        ${t.description ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${escapeHtml(t.description)}</div>` : ''}
                      </td>
                      <td>
                        <span style="display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 11.5px; ${assignee.badgeStyle} padding: 3px 8px; border-radius: 4px;">
                          ${assignee.icon} ${escapeHtml(assignee.text)}
                        </span>
                      </td>
                      <td>
                        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: ${t.priority === 'High' || t.priority === 'Critical' ? '#dc2626' : (t.priority === 'Medium' ? '#d97706' : '#2563eb')};">
                          ${escapeHtml(t.priority || 'Medium')}
                        </span>
                      </td>
                      <td style="font-size: 12px; font-weight: 500;">${tDue}</td>
                      <td>
                        <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBorder};">
                          ${isOverdue ? '⚠️ Overdue' : escapeHtml(t.status || 'To Do')}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>

      <!-- 5. References, Literature & Technical Sources Consulted -->
      <div class="report-section">
        <h3 class="report-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          5. References, Literature &amp; Technical Sources Consulted
        </h3>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 20px;">
          <ol style="margin: 0; padding-left: 20px; font-size: 12.5px; color: #1e293b; line-height: 1.8;">
            ${sourcesList.map(src => `<li style="margin-bottom: 4px; padding-left: 4px;"><strong>${escapeHtml(src)}</strong></li>`).join('')}
          </ol>
        </div>
      </div>

      <!-- Formal Academic Signature Block (Faculty Project Guide & Head of Department Only) -->
      <div class="report-sign-grid">
        <div class="report-sign-box">
          <div class="report-sign-line"></div>
          <div class="report-sign-role">Faculty Project Guide</div>
          <div class="report-sign-sub">${escapeHtml(facultyName)} <span style="color: #64748b;">(${escapeHtml(facultyDesig)})</span></div>
        </div>
        <div class="report-sign-box">
          <div class="report-sign-line"></div>
          <div class="report-sign-role">Head of Department (HOD)</div>
          <div class="report-sign-sub">Department of ${escapeHtml(project.department || 'CSE')}</div>
        </div>
      </div>
    `;

  } catch (err) {
    console.error('Report Generation Error:', err);
    container.innerHTML = `<p style="color: red; padding: 30px; text-align: center;">Error generating project report: ${escapeHtml(err.message)}</p>`;
  }
}

window.renderProjectReport = renderProjectReport;

// Bind Print, Refresh & Sources buttons
document.addEventListener('DOMContentLoaded', () => {
  const printBtn = document.getElementById('btnPrintReport');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  const refreshBtn = document.getElementById('btnRefreshReport');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      renderProjectReport();
      showToast('Report data refreshed!', 'info');
    });
  }

  const applySourcesBtn = document.getElementById('btnApplySources');
  if (applySourcesBtn) {
    applySourcesBtn.addEventListener('click', () => {
      const srcInput = document.getElementById('reportSourcesInput');
      const selectEl = document.getElementById('reportProjectSelect');
      const pId = selectEl?.value || currentSelectedProjectId;
      if (srcInput && pId) {
        localStorage.setItem(`rgm_report_sources_${pId}`, srcInput.value.trim());
        renderProjectReport(pId);
        showToast('Sources updated in project report!', 'success');
      }
    });
  }
});

// --------------------------------------------------------------------------
// DOCUMENTS & FILES TAB LOGIC
// --------------------------------------------------------------------------
let currentProjectDocs = [];
let selectedProjectForDocs = null;

window.openProjectDocuments = function(projectId) {
  switchTab('tabDocuments');
  const sel = document.getElementById('documentProjectSelect');
  if (sel) {
    sel.value = projectId;
  }
  handleDocumentProjectChange(projectId);
};

async function handleDocumentProjectChange(projectId) {
  selectedProjectForDocs = myProjects.find(p => (p._id || p.id) === projectId) || null;
  const container = document.getElementById('documentsListContainer');
  if (!container) return;

  if (!projectId) {
    container.innerHTML = '<div style="text-align: center; padding: 30px; color: #94a3b8;">Select a project above to inspect uploaded documents.</div>';
    return;
  }

  try {
    container.innerHTML = '<div style="text-align: center; padding: 30px; color: #64748b;">⏳ Loading project documents...</div>';
    const res = await apiRequest(`/documents/project/${projectId}`);
    if (res.success && Array.isArray(res.data)) {
      currentProjectDocs = res.data;
      renderProjectDocuments();
    } else {
      currentProjectDocs = [];
      renderProjectDocuments();
    }
  } catch (err) {
    console.error('Failed to load project documents:', err);
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444;">Failed to load documents: ${escapeHtml(err.message)}</div>`;
  }
}

function renderProjectDocuments() {
  const container = document.getElementById('documentsListContainer');
  if (!container) return;

  const filterCategory = document.getElementById('docCategoryFilter')?.value || 'ALL';
  const docs = filterCategory === 'ALL'
    ? currentProjectDocs
    : currentProjectDocs.filter(d => d.category === filterCategory);

  if (!Array.isArray(docs) || docs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: #ffffff; border-radius: 12px; border: 1px dashed var(--border-color);">
        <div style="font-size: 36px; margin-bottom: 8px;">📂</div>
        <h4 style="font-size: 15px; color: #1e293b; margin-bottom: 4px;">No documents uploaded yet</h4>
        <p style="color: var(--text-muted); font-size: 13px; max-width: 460px; margin: 0 auto 16px auto;">
          Upload your research paper draft, presentation slides (PPT), literature survey, or final project report to share directly with your faculty mentor.
        </p>
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('btnOpenUploadDocModal').click()">
          + Upload First Document
        </button>
      </div>
    `;
    return;
  }

  const categoryBadges = {
    'Research Paper': { bg: '#f5f3ff', color: '#7c3aed', icon: '📄', border: '#ddd6fe' },
    'Presentation (PPT)': { bg: '#eff6ff', color: '#2563eb', icon: '📊', border: '#bfdbfe' },
    'Project Report': { bg: '#ecfdf5', color: '#059669', icon: '📘', border: '#a7f3d0' },
    'Synopsis / Survey': { bg: '#fffbeb', color: '#d97706', icon: '📑', border: '#fde68a' },
    'Code & Dataset (ZIP)': { bg: '#eef2ff', color: '#4f46e5', icon: '🗂️', border: '#c7d2fe' },
    'Other': { bg: '#f1f5f9', color: '#475569', icon: '📁', border: '#cbd5e1' }
  };

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
      ${docs.map(doc => {
        const cat = categoryBadges[doc.category] || categoryBadges['Other'];
        const docId = doc._id || doc.id;
        const uploadDate = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently';
        const fileSizeMB = doc.fileSize ? (doc.fileSize / (1024 * 1024)).toFixed(2) + ' MB' : (doc.fileSize ? (doc.fileSize / 1024).toFixed(1) + ' KB' : '');
        const isUploader = String(doc.uploadedBy?.id) === String(currentStudent?.id);
        const isLeader = selectedProjectForDocs && String(selectedProjectForDocs.teamLeaderId?._id || selectedProjectForDocs.teamLeaderId?.id || selectedProjectForDocs.teamLeaderId) === String(currentStudent?.id);
        const fileExt = (doc.fileName || '').split('.').pop()?.toUpperCase() || 'FILE';

        return `
          <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 12px; padding: 18px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s, box-shadow 0.2s;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 10px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; background: ${cat.bg}; color: ${cat.color}; border: 1px solid ${cat.border}; padding: 3px 8px; border-radius: 6px;">
                  <span>${cat.icon}</span> ${escapeHtml(doc.category)}
                </span>
                <span style="font-size: 11px; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${fileExt}</span>
              </div>

              <h4 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0; word-break: break-word;">
                ${escapeHtml(doc.title || doc.originalName)}
              </h4>

              ${doc.description ? `
                <p style="font-size: 12.5px; color: #64748b; margin: 0 0 10px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                  ${escapeHtml(doc.description)}
                </p>
              ` : ''}

              <div style="font-size: 11.5px; color: #64748b; background: #f8fafc; padding: 10px 12px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
                ${doc.submissionType === 'Individual' ? `
                  <div>👤 <strong>Uploaded for:</strong> <span style="font-weight: 700; color: #7c3aed;">Individual (${escapeHtml(doc.individualMember?.name || doc.submissionScope || doc.uploadedBy?.name || 'Student')}${doc.individualMember?.registerNumber ? ` - ${doc.individualMember.registerNumber}` : ''})</span></div>
                ` : `
                  <div>👥 <strong>Uploaded for:</strong> <span style="font-weight: 700; color: #059669;">Entire Team (Team Deliverable)</span></div>
                `}
                <div>📤 <strong>Submitted By:</strong> ${escapeHtml(doc.uploadedBy?.name || 'Student')} ${doc.uploadedBy?.registerNumber ? `(${doc.uploadedBy.registerNumber})` : ''}</div>
                <div>📅 <strong>Date:</strong> ${uploadDate} ${fileSizeMB ? `&bull; ${fileSizeMB}` : ''}</div>
                <div style="font-size: 10.5px; color: #94a3b8; word-break: break-all;">📎 ${escapeHtml(doc.originalName || doc.fileName)}</div>
              </div>
            </div>

            <div style="display: flex; gap: 8px; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 12px;">
              <a href="${doc.fileUrl}" target="_blank" class="btn btn-primary btn-sm" style="flex: 1; text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview
              </a>
              <a href="${doc.fileUrl}" download="${doc.originalName || doc.title}" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </a>
              ${(isUploader || isLeader) ? `
                <button type="button" class="btn btn-sm btn-danger" onclick="handleDeleteDocument('${docId}', '${escapeHtml(doc.title || doc.originalName)}')" title="Delete Document" style="padding: 5px 8px; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Upload Document Submit Handler
async function handleUploadDocumentSubmit(e) {
  e.preventDefault();
  const projectId = document.getElementById('uploadDocProjectSelect')?.value;
  const category = document.getElementById('uploadDocCategory')?.value;
  const title = document.getElementById('uploadDocTitle')?.value.trim();
  const description = document.getElementById('uploadDocDesc')?.value.trim();
  const submissionType = document.getElementById('uploadDocSubmissionType')?.value || 'Team';
  const fileInput = document.getElementById('uploadDocFileInput');
  const btnSubmit = document.getElementById('btnSubmitUploadDoc');
  const spinner = document.getElementById('uploadBtnSpinner');
  const btnText = document.getElementById('uploadBtnText');

  if (!projectId) {
    showToast('Please select a project.', 'warning');
    return;
  }
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a file to upload.', 'warning');
    return;
  }

  const file = fileInput.files[0];
  if (file.size > 50 * 1024 * 1024) {
    showToast('File is too large. Maximum supported file size is 50MB.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('projectId', projectId);
  formData.append('category', category);
  formData.append('title', title || file.name);
  formData.append('description', description);
  formData.append('submissionType', submissionType);

  if (submissionType === 'Individual') {
    const memberSelect = document.getElementById('uploadDocMemberSelect');
    if (memberSelect && memberSelect.selectedIndex >= 0) {
      const opt = memberSelect.options[memberSelect.selectedIndex];
      formData.append('memberId', opt.value || '');
      formData.append('memberName', opt.dataset.name || opt.text || '');
      formData.append('memberRegNo', opt.dataset.reg || '');
    }
  }

  formData.append('file', file);

  try {
    if (btnSubmit) btnSubmit.disabled = true;
    if (spinner) spinner.style.display = 'inline';
    if (btnText) btnText.style.display = 'none';

    const res = await apiUpload('/documents/upload', formData);

    if (res.success) {
      showToast(`${category} uploaded and shared with Faculty Guide!`, 'success');
      document.getElementById('uploadDocModal')?.classList.remove('active');
      document.getElementById('uploadDocForm')?.reset();

      // Refresh documents list
      const currentSelectedDocProj = document.getElementById('documentProjectSelect')?.value;
      if (currentSelectedDocProj === projectId) {
        handleDocumentProjectChange(projectId);
      } else {
        const docSelect = document.getElementById('documentProjectSelect');
        if (docSelect) docSelect.value = projectId;
        handleDocumentProjectChange(projectId);
      }
    } else {
      showToast(res.message || 'Upload failed', 'error');
    }
  } catch (err) {
    console.error('Upload error:', err);
    showToast(err.message || 'Failed to upload document', 'error');
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.style.display = 'inline';
  }
}

// Delete Document Handler
window.handleDeleteDocument = async function(docId, title) {
  if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await apiRequest(`/documents/${docId}`, 'DELETE');
    if (res.success) {
      showToast('Document deleted successfully', 'success');
      const activeProjId = document.getElementById('documentProjectSelect')?.value;
      if (activeProjId) handleDocumentProjectChange(activeProjId);
    } else {
      showToast(res.message || 'Failed to delete', 'error');
    }
  } catch (err) {
    console.error('Delete document error:', err);
    showToast(err.message || 'Failed to delete document', 'error');
  }
};


