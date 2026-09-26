/**
 * Admin Console Controller
 * System Metrics, Faculty CRUD, Student Management, and Reports
 */

let allFaculty = [];
let allStudents = [];
let allProjects = [];
let cachedFacultyList = [];
let cachedAllocations = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth('admin')) return;

  setupNotificationBell();

  // Mobile menu
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
  }

  // Sidebar navigation
  document.querySelectorAll('.sidebar-nav .nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
      if (sidebar) sidebar.classList.remove('mobile-open');
    });
  });

  const logoutBtn = document.getElementById('navLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  setupModals();
  await loadAdminStats();
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
    tabDashboard: 'System Administration',
    tabFaculty: 'Faculty Management',
    tabAllocation: 'Faculty Allocation (Department + Year)',
    tabReports: 'Academic Governance Reports',
    tabSettings: 'System Configuration'
  };
  const headingEl = document.getElementById('pageHeading');
  if (headingEl) headingEl.textContent = pageHeadings[tabId] || 'Admin Console';

  if (tabId === 'tabFaculty') loadFacultyDirectory();
  if (tabId === 'tabAllocation') loadFacultyAllocationSection();
  if (tabId === 'tabReports') loadReports();
}

// Setup Modals
function setupModals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  const addModal = document.getElementById('addFacultyModal');
  const btnOpen1 = document.getElementById('btnOpenAddFaculty');
  const btnOpen2 = document.getElementById('btnOpenAddFaculty2');

  if (btnOpen1) btnOpen1.addEventListener('click', () => addModal.classList.add('active'));
  if (btnOpen2) btnOpen2.addEventListener('click', () => addModal.classList.add('active'));

  // Add Faculty Submit
  const addForm = document.getElementById('addFacultyForm');
  if (addForm) addForm.addEventListener('submit', handleAddFacultySubmit);

  // Edit Faculty Submit
  const editForm = document.getElementById('editFacultyForm');
  if (editForm) editForm.addEventListener('submit', handleEditFacultySubmit);

  // Reset Password Submit
  const resetForm = document.getElementById('resetPasswordForm');
  if (resetForm) resetForm.addEventListener('submit', handleResetPasswordSubmit);
}

// Load System Statistics
async function loadAdminStats() {
  try {
    const res = await apiRequest('/admin/stats');
    if (res.success) {
      const s = res.data;
      document.getElementById('adminTotalStudents').textContent = s.totalStudents;
      document.getElementById('adminTotalFaculty').textContent = s.totalFaculty;
      document.getElementById('adminTotalProjects').textContent = s.totalProjects;
      document.getElementById('adminActiveProjects').textContent = s.activeProjects;
      document.getElementById('adminCompletedProjects').textContent = s.completedProjects;
      document.getElementById('adminPendingEval').textContent = s.pendingEvaluations;
    }
  } catch (err) {
    console.error('Failed to load admin stats:', err);
  }
}

// Load Recent Projects for Overview
async function loadRecentProjects() {
  const tbody = document.getElementById('adminRecentProjectsBody');
  if (!tbody) return;

  try {
    const res = await apiRequest('/projects');
    if (res.success) {
      allProjects = res.data;
      const recent = allProjects.slice(0, 5);

      if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">No projects registered.</td></tr>';
        return;
      }

      tbody.innerHTML = recent.map(p => `
        <tr>
          <td><strong>${p.projectName}</strong></td>
          <td>${p.teamLeaderId?.name || 'N/A'}</td>
          <td>${p.facultyId?.name || 'N/A'}</td>
          <td><span class="badge badge-${p.status.toLowerCase()}">${p.status}</span></td>
          <td>${p.progress || 0}%</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="color: red;">Error loading projects.</td></tr>';
  }
}

// --------------------------------------------------------------------------
// 1. FACULTY MANAGEMENT (CRUD)
// --------------------------------------------------------------------------
async function loadFacultyDirectory() {
  const tbody = document.getElementById('adminFacultyTableBody');
  if (!tbody) return;

  try {
    const res = await apiRequest('/faculty/admin/all');
    if (res.success) {
      allFaculty = res.data;

      if (allFaculty.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: #94a3b8;">No faculty registered. Click "Add Faculty" to create one.</td></tr>';
        return;
      }

      tbody.innerHTML = allFaculty.map(f => `
        <tr>
          <td><strong>${f.facultyId}</strong></td>
          <td>${f.name}</td>
          <td>${f.email}</td>
          <td>${f.department}</td>
          <td>${f.designation}</td>
          <td>${f.phone || 'N/A'}</td>
          <td>
            <span class="badge ${f.isActive ? 'badge-approved' : 'badge-rejected'}">
              ${f.isActive ? 'Active' : 'Disabled'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-secondary" onclick="openEditFacultyModal('${f._id}')">Edit</button>
              <button class="btn btn-sm ${f.isActive ? 'btn-danger' : 'btn-primary'}" onclick="toggleFacultyStatus('${f._id}', ${!f.isActive})">
                ${f.isActive ? 'Disable' : 'Enable'}
              </button>
              <button class="btn btn-sm btn-outline-primary" onclick="openResetPasswordModal('${f._id}', '${f.name}')">Reset Pwd</button>
              <button class="btn btn-sm btn-danger" onclick="deleteFaculty('${f._id}', '${f.name}')">&times;</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="color: red;">Failed to load faculty directory.</td></tr>';
  }
}

// Add Faculty
async function handleAddFacultySubmit(e) {
  e.preventDefault();
  const facultyId = document.getElementById('addFacId').value.trim();
  const name = document.getElementById('addFacName').value.trim();
  const email = document.getElementById('addFacEmail').value.trim();
  const phone = document.getElementById('addFacPhone').value.trim();
  const department = document.getElementById('addFacDept').value;
  const designation = document.getElementById('addFacDesig').value;
  const password = document.getElementById('addFacPassword').value;
  const submitBtn = document.getElementById('btnSubmitAddFaculty');

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const res = await apiRequest('/faculty', 'POST', {
      facultyId,
      name,
      email,
      phone,
      department,
      designation,
      password
    });

    if (res.success) {
      showToast('Faculty member registered successfully in MongoDB!', 'success');
      document.getElementById('addFacultyModal').classList.remove('active');
      document.getElementById('addFacultyForm').reset();
      loadFacultyDirectory();
      loadAdminStats();
    }
  } catch (err) {
    showToast(err.message || 'Failed to add faculty', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Faculty';
  }
}

// Open Edit Faculty
window.openEditFacultyModal = function(id) {
  const f = allFaculty.find(item => item._id === id);
  if (!f) return;

  document.getElementById('editFacIdHidden').value = f._id;
  document.getElementById('editFacName').value = f.name;
  document.getElementById('editFacDept').value = f.department;
  document.getElementById('editFacDesig').value = f.designation;
  document.getElementById('editFacPhone').value = f.phone || '';

  document.getElementById('editFacultyModal').classList.add('active');
};

async function handleEditFacultySubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editFacIdHidden').value;
  const name = document.getElementById('editFacName').value.trim();
  const department = document.getElementById('editFacDept').value.trim();
  const designation = document.getElementById('editFacDesig').value.trim();
  const phone = document.getElementById('editFacPhone').value.trim();

  try {
    await apiRequest(`/faculty/${id}`, 'PUT', { name, department, designation, phone });
    showToast('Faculty updated successfully', 'success');
    document.getElementById('editFacultyModal').classList.remove('active');
    loadFacultyDirectory();
  } catch (err) {
    showToast(err.message || 'Failed to update faculty', 'error');
  }
}

// Toggle Faculty Active / Inactive
window.toggleFacultyStatus = async function(id, newStatus) {
  try {
    await apiRequest(`/faculty/${id}`, 'PUT', { isActive: newStatus });
    showToast(`Faculty account ${newStatus ? 'enabled' : 'disabled'}!`, 'success');
    loadFacultyDirectory();
  } catch (err) {
    showToast('Failed to change faculty status', 'error');
  }
};

// Open Reset Password
window.openResetPasswordModal = function(id, name) {
  document.getElementById('resetFacIdHidden').value = id;
  document.getElementById('resetFacInfo').textContent = `Resetting password for: ${name}`;
  document.getElementById('resetNewPassword').value = '';
  document.getElementById('resetPasswordModal').classList.add('active');
};

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('resetFacIdHidden').value;
  const newPassword = document.getElementById('resetNewPassword').value;

  try {
    const res = await apiRequest(`/faculty/${id}/reset-password`, 'PUT', { newPassword });
    showToast(res.message || 'Password reset successfully', 'success');
    document.getElementById('resetPasswordModal').classList.remove('active');
  } catch (err) {
    showToast(err.message || 'Failed to reset password', 'error');
  }
}

// Delete Faculty
window.deleteFaculty = async function(id, name) {
  if (!confirm(`Are you sure you want to permanently delete faculty member "${name}"?`)) return;

  try {
    const res = await apiRequest(`/faculty/${id}`, 'DELETE');
    showToast(res.message || 'Faculty deleted', 'success');
    loadFacultyDirectory();
    loadAdminStats();
  } catch (err) {
    showToast(err.message || 'Cannot delete faculty', 'error');
  }
};

// --------------------------------------------------------------------------
// 2. STUDENTS MANAGEMENT
// --------------------------------------------------------------------------
async function loadStudentsDirectory() {
  const tbody = document.getElementById('adminStudentsTableBody');
  if (!tbody) return;

  try {
    const res = await apiRequest('/admin/students');
    if (res.success) {
      allStudents = res.data;

      if (allStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: #94a3b8;">No registered students found.</td></tr>';
        return;
      }

      tbody.innerHTML = allStudents.map(s => `
        <tr>
          <td><strong>${s.registerNumber}</strong></td>
          <td>${s.name}</td>
          <td>${s.email}</td>
          <td>${s.department}</td>
          <td>${s.year || 'III Year'}</td>
          <td>${s.phone || 'N/A'}</td>
          <td>
            <span class="badge ${s.isActive ? 'badge-approved' : 'badge-rejected'}">
              ${s.isActive ? 'Active' : 'Deactivated'}
            </span>
          </td>
          <td>
            <button class="btn btn-sm ${s.isActive ? 'btn-danger' : 'btn-primary'}" onclick="toggleStudentStatus('${s._id}')">
              ${s.isActive ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="color: red;">Failed to load students.</td></tr>';
  }
}

window.toggleStudentStatus = async function(id) {
  try {
    const res = await apiRequest(`/admin/students/${id}/status`, 'PUT');
    showToast(res.message, 'success');
    loadStudentsDirectory();
  } catch (err) {
    showToast('Failed to toggle student status', 'error');
  }
};

// --------------------------------------------------------------------------
// 3. ALL PROJECTS OVERSIGHT
// --------------------------------------------------------------------------
async function loadAllProjects() {
  const tbody = document.getElementById('adminAllProjectsTableBody');
  if (!tbody) return;

  try {
    const res = await apiRequest('/projects');
    if (res.success) {
      allProjects = res.data;

      if (allProjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 24px; color: #94a3b8;">No projects registered.</td></tr>';
        return;
      }

      tbody.innerHTML = allProjects.map(p => `
        <tr>
          <td><strong>${p.projectName}</strong></td>
          <td>${p.domain}</td>
          <td>${p.teamLeaderId?.name} (${p.teamLeaderId?.registerNumber})</td>
          <td>${p.facultyId?.name}</td>
          <td>${p.teamMemberIds?.length} Members</td>
          <td>${formatDate(p.deadline)}</td>
          <td>${p.progress || 0}%</td>
          <td><span class="badge badge-${p.status.toLowerCase()}">${p.status}</span></td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="adminDeleteProject('${p._id}', '${p.projectName}')">&times; Delete</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" style="color: red;">Failed to load projects.</td></tr>';
  }
}

window.adminDeleteProject = async function(id, name) {
  if (!confirm(`Warning: Deleting "${name}" will cascade delete all milestones, tasks, and evaluations. Proceed?`)) return;

  try {
    await apiRequest(`/projects/${id}`, 'DELETE');
    showToast('Project deleted', 'success');
    loadAllProjects();
    loadAdminStats();
  } catch (err) {
    showToast('Failed to delete project', 'error');
  }
};

// --------------------------------------------------------------------------
// 4. EVALUATIONS OVERSIGHT & REPORTS
// --------------------------------------------------------------------------
async function loadEvaluationsOversight() {
  const container = document.getElementById('adminEvaluationsContainer');
  if (!container) return;

  try {
    const res = await apiRequest('/admin/reports');
    if (res.success) {
      const { evaluations } = res.data;

      if (!evaluations || evaluations.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 30px;">No projects evaluated yet.</p>';
        return;
      }

      container.innerHTML = `
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Faculty Evaluator</th>
                <th>Work (/30)</th>
                <th>Impl (/25)</th>
                <th>Doc (/15)</th>
                <th>Pres (/20)</th>
                <th>Part (/10)</th>
                <th>Total (/100)</th>
                <th>Evaluated Date</th>
              </tr>
            </thead>
            <tbody>
              ${evaluations.map(e => `
                <tr>
                  <td><strong>${e.projectId?.projectName || 'N/A'}</strong></td>
                  <td>${e.facultyId?.name || 'N/A'}</td>
                  <td>${e.projectWork}</td>
                  <td>${e.implementation}</td>
                  <td>${e.documentation}</td>
                  <td>${e.presentation}</td>
                  <td>${e.teamParticipation}</td>
                  <td><span class="rubric-total-badge" style="font-size: 14px; padding: 4px 10px;">${e.totalMarks}</span></td>
                  <td>${formatDate(e.evaluatedAt)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = '<p style="color: red;">Failed to load evaluations oversight.</p>';
  }
}

async function loadReports() {
  const container = document.getElementById('adminReportsContainer');
  if (!container) return;

  try {
    const res = await apiRequest('/admin/reports');
    if (res.success) {
      const { deptDistribution, domainDistribution } = res.data;

      container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <!-- Department breakdown -->
          <div class="card" style="border: 1px solid var(--border-color);">
            <div class="card-header"><h4 style="font-size: 15px;">Student Department Distribution</h4></div>
            <div class="card-body">
              ${deptDistribution.map(d => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                  <span>${d._id || 'Unassigned'}</span>
                  <strong>${d.count} Students</strong>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Domain breakdown -->
          <div class="card" style="border: 1px solid var(--border-color);">
            <div class="card-header"><h4 style="font-size: 15px;">Project Domain Distribution</h4></div>
            <div class="card-body">
              ${domainDistribution.map(dm => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                  <span>${dm._id || 'General'}</span>
                  <strong>${dm.count} Projects</strong>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = '<p style="color: red;">Failed to load reports.</p>';
  }
}

// --------------------------------------------------------------------------
// 5. NOTIFICATIONS AUDIT LOG
// --------------------------------------------------------------------------
async function loadNotificationLogs() {
  const tbody = document.getElementById('adminNotificationLogsBody');
  if (!tbody) return;

  try {
    const res = await apiRequest('/admin/notifications/logs');
    if (res.success) {
      const logs = res.data;
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 24px;">No notifications dispatched yet.</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(l => `
        <tr>
          <td><span class="badge ${l.userRole === 'faculty' ? 'badge-approved' : 'badge-inprogress'}">${l.userRole?.toUpperCase()}</span></td>
          <td><strong>${l.channel.toUpperCase()}</strong></td>
          <td><code style="font-size: 11px;">${l.type}</code></td>
          <td><strong>${l.title}</strong><div style="font-size: 11px; color: #64748b;">${l.message}</div></td>
          <td>${formatDate(l.sentAt || l.createdAt)}</td>
          <td><span class="badge badge-completed">${l.status}</span></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" style="color: red;">Failed to load notification logs.</td></tr>';
  }
}

// --------------------------------------------------------------------------
// 6. FACULTY ALLOCATION MODULE (DEPARTMENT + YEAR)
// --------------------------------------------------------------------------
async function loadFacultyAllocationSection() {
  await Promise.all([
    loadAllocatableFaculty(),
    loadAllocations()
  ]);

  // Setup listeners once
  const allocForm = document.getElementById('facultyAllocationForm');
  if (allocForm && !allocForm.dataset.bound) {
    allocForm.dataset.bound = 'true';
    allocForm.addEventListener('submit', handleCreateAllocationSubmit);
  }

  const editAllocForm = document.getElementById('editAllocationForm');
  if (editAllocForm && !editAllocForm.dataset.bound) {
    editAllocForm.dataset.bound = 'true';
    editAllocForm.addEventListener('submit', handleEditAllocationSubmit);
  }

  const searchInput = document.getElementById('allocFacultySearchInput');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', (e) => renderFacultyCheckboxes(e.target.value));
  }

  const selectAllBtn = document.getElementById('btnSelectAllFaculty');
  if (selectAllBtn && !selectAllBtn.dataset.bound) {
    selectAllBtn.dataset.bound = 'true';
    selectAllBtn.addEventListener('click', () => {
      document.querySelectorAll('input[name="allocFacultyCheckbox"]').forEach(cb => cb.checked = true);
    });
  }

  const clearAllBtn = document.getElementById('btnClearAllFaculty');
  if (clearAllBtn && !clearAllBtn.dataset.bound) {
    clearAllBtn.dataset.bound = 'true';
    clearAllBtn.addEventListener('click', () => {
      document.querySelectorAll('input[name="allocFacultyCheckbox"]').forEach(cb => cb.checked = false);
    });
  }

  const refreshBtn = document.getElementById('btnRefreshAllocations');
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = 'true';
    refreshBtn.addEventListener('click', loadAllocations);
  }

  ['filterAllocDept', 'filterAllocYear', 'filterAllocStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bound) {
      el.dataset.bound = 'true';
      el.addEventListener('change', renderAllocationsTable);
    }
  });
}

// Fetch faculty list dynamically from MongoDB
async function loadAllocatableFaculty() {
  const container = document.getElementById('allocFacultyCheckboxesList');
  if (!container) return;

  try {
    const res = await apiRequest('/faculty/admin/all');
    if (res.success && Array.isArray(res.data)) {
      cachedFacultyList = res.data.filter(f => f.isActive !== false);
      renderFacultyCheckboxes();
    }
  } catch (err) {
    container.innerHTML = '<div style="color: red; padding: 14px;">Failed to load faculty directory.</div>';
  }
}

// Render dynamic faculty checkboxes
function renderFacultyCheckboxes(searchTerm = '') {
  const container = document.getElementById('allocFacultyCheckboxesList');
  if (!container) return;

  const query = searchTerm.trim().toLowerCase();
  const filtered = cachedFacultyList.filter(f =>
    !query ||
    (f.name && f.name.toLowerCase().includes(query)) ||
    (f.facultyId && f.facultyId.toLowerCase().includes(query)) ||
    (f.department && f.department.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color: #94a3b8; padding: 14px; text-align: center;">No faculty members matched search.</div>';
    return;
  }

  container.innerHTML = filtered.map(f => `
    <label style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; transition: background 0.15s ease;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <input type="checkbox" name="allocFacultyCheckbox" value="${f._id || f.id}" style="transform: scale(1.2); cursor: pointer;">
        <div>
          <span style="font-weight: 600; color: #1e293b;">${f.name}</span>
          <span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 1px 6px; border-radius: 4px; margin-left: 6px; font-weight: 700;">${f.facultyId}</span>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
            ${f.designation || 'Faculty'} &bull; ${f.department || 'General'}
          </div>
        </div>
      </div>
      <div style="font-size: 11px; color: #94a3b8;">${f.email}</div>
    </label>
  `).join('');
}

// Submit Allocation (Multiple faculty members to Dept + Year)
async function handleCreateAllocationSubmit(e) {
  e.preventDefault();
  const department = document.getElementById('allocDept').value;
  const year = document.getElementById('allocYear').value;
  const submitBtn = document.getElementById('btnSubmitAllocation');

  const selectedBoxes = Array.from(document.querySelectorAll('input[name="allocFacultyCheckbox"]:checked'));
  const facultyIds = selectedBoxes.map(cb => cb.value);

  if (facultyIds.length === 0) {
    showToast('Please select at least one faculty member to allocate.', 'error');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Allocating Faculty...';

    const res = await apiRequest('/admin/faculty-allocations', 'POST', {
      department,
      year,
      facultyIds
    });

    if (res.success) {
      showToast(res.message || 'Faculty successfully allocated!', 'success');
      // Uncheck boxes
      selectedBoxes.forEach(cb => cb.checked = false);
      // Reload allocations table
      await loadAllocations();
    }
  } catch (err) {
    showToast(err.message || 'Failed to allocate faculty.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Allocate Selected Faculty';
  }
}

// Fetch all allocations
async function loadAllocations() {
  const tbody = document.getElementById('allocationsTableBody');
  if (!tbody) return;

  try {
    const res = await apiRequest('/admin/faculty-allocations');
    if (res.success && Array.isArray(res.data)) {
      cachedAllocations = res.data;
      renderAllocationsTable();
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="color: red; text-align: center; padding: 20px;">Failed to load faculty allocations.</td></tr>';
  }
}

// Render current allocations table with filters
function renderAllocationsTable() {
  const tbody = document.getElementById('allocationsTableBody');
  if (!tbody) return;

  const deptFilter = document.getElementById('filterAllocDept')?.value || '';
  const yearFilter = document.getElementById('filterAllocYear')?.value || '';
  const statusFilter = document.getElementById('filterAllocStatus')?.value || '';

  const filtered = cachedAllocations.filter(a => {
    if (deptFilter && (a.department || '').toLowerCase() !== deptFilter.toLowerCase()) return false;
    if (yearFilter && (a.year || '').toLowerCase() !== yearFilter.toLowerCase()) return false;
    if (statusFilter !== '') {
      const boolVal = statusFilter === 'true';
      if (a.active !== boolVal) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 30px;">No faculty allocations found matching the selected filters.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const f = a.faculty || {};
    const isActive = a.active !== false;
    return `
      <tr>
        <td><strong style="color: #2563eb;">${a.department}</strong></td>
        <td><span class="badge badge-submitted">${a.year}</span></td>
        <td><code>${f.facultyId || a.facultyId}</code></td>
        <td><strong>${f.name || 'Faculty Member'}</strong></td>
        <td>
          <div style="font-size: 13px;">${f.designation || 'Faculty'}</div>
          <div style="font-size: 11px; color: #64748b;">${f.department || ''}</div>
        </td>
        <td>
          <span class="badge ${isActive ? 'badge-completed' : 'badge-rejected'}">
            ${isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" onclick="openEditAllocationModal('${a.id || a._id}')">Edit</button>
            ${isActive ? `
              <button class="btn btn-sm btn-danger" onclick="handleRemoveAllocation('${a.id || a._id}', '${escapeHtml(f.name || 'this faculty')}')">Remove</button>
            ` : `
              <button class="btn btn-sm btn-primary" onclick="handleReactivateAllocation('${a.id || a._id}')">Reactivate</button>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Remove / Deactivate Allocation
window.handleRemoveAllocation = async function(id, facultyName) {
  // Requirement 9: Ask confirmation
  if (!confirm(`Are you sure you want to remove this faculty allocation for ${facultyName}?`)) {
    return;
  }

  try {
    const res = await apiRequest(`/admin/faculty-allocations/${id}`, 'DELETE');
    if (res.success) {
      showToast('Faculty allocation removed successfully (deactivated).', 'success');
      await loadAllocations();
    }
  } catch (err) {
    showToast(err.message || 'Failed to remove faculty allocation', 'error');
  }
};

// Reactivate Allocation
window.handleReactivateAllocation = async function(id) {
  try {
    const res = await apiRequest(`/admin/faculty-allocations/${id}`, 'PUT', { active: true });
    if (res.success) {
      showToast('Faculty allocation reactivated!', 'success');
      await loadAllocations();
    }
  } catch (err) {
    showToast(err.message || 'Failed to reactivate allocation', 'error');
  }
};

// Open Edit Allocation Modal
window.openEditAllocationModal = function(id) {
  const allocation = cachedAllocations.find(a => (a.id || a._id) === id);
  if (!allocation) return;

  document.getElementById('editAllocIdHidden').value = id;
  document.getElementById('editAllocFacultyName').textContent = allocation.faculty?.name || 'Faculty Member';
  document.getElementById('editAllocFacultyMeta').textContent = `${allocation.faculty?.facultyId || ''} • ${allocation.faculty?.department || ''} • ${allocation.faculty?.email || ''}`;
  document.getElementById('editAllocDept').value = allocation.department;
  document.getElementById('editAllocYear').value = allocation.year;
  document.getElementById('editAllocActive').value = allocation.active !== false ? 'true' : 'false';

  document.getElementById('editAllocationModal').classList.add('active');
};

// Handle Edit Allocation Submit
async function handleEditAllocationSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editAllocIdHidden').value;
  const department = document.getElementById('editAllocDept').value;
  const year = document.getElementById('editAllocYear').value;
  const active = document.getElementById('editAllocActive').value === 'true';

  try {
    const res = await apiRequest(`/admin/faculty-allocations/${id}`, 'PUT', {
      department,
      year,
      active
    });

    if (res.success) {
      showToast('Faculty allocation updated successfully!', 'success');
      document.getElementById('editAllocationModal').classList.remove('active');
      await loadAllocations();
    }
  } catch (err) {
    showToast(err.message || 'Failed to update allocation', 'error');
  }
}

// Utility for safe HTML escaping in onclick attributes
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
