/**
 * Faculty Dashboard Logic
 * Mentorship, Review, and Rubric Evaluation
 */

let currentFaculty = null;
let assignedProjects = [];
let activeViewingProjectId = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth('faculty')) return;
  currentFaculty = getUser();

  const facIdEl = document.getElementById('userFacultyId');
  if (facIdEl) facIdEl.textContent = currentFaculty.facultyId || '';

  setupNotificationBell();

  // Mobile menu toggle
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
  setupRubricLiveCalculation();

  // Document & Submissions Filters
  document.getElementById('facultyDocProjectFilter')?.addEventListener('change', renderFacultyDocuments);
  document.getElementById('facultyDocCategoryFilter')?.addEventListener('change', renderFacultyDocuments);
  document.getElementById('btnRefreshFacultyDocs')?.addEventListener('click', () => {
    loadFacultyDocuments();
    showToast('Submissions refreshed!', 'info');
  });

  // Overview Tab Year Filter
  document.getElementById('overviewYearFilter')?.addEventListener('change', renderFacultyProjectCards);

  // All Projects Filters
  document.getElementById('filterFacProjYear')?.addEventListener('change', renderFacultyProjectsTable);
  document.getElementById('filterFacProjDept')?.addEventListener('change', renderFacultyProjectsTable);
  document.getElementById('filterFacProjStatus')?.addEventListener('change', renderFacultyProjectsTable);

  // Evaluations Filters
  document.getElementById('filterPendingEvalYear')?.addEventListener('change', renderPendingEvaluations);
  document.getElementById('filterCompletedEvalYear')?.addEventListener('change', renderCompletedEvaluations);

  // Mentored Students Directory Filters
  document.getElementById('filterStudentYear')?.addEventListener('change', renderStudentsDirectory);
  document.getElementById('filterStudentDept')?.addEventListener('change', renderStudentsDirectory);
  document.getElementById('searchStudentInput')?.addEventListener('input', renderStudentsDirectory);

  await loadAssignedProjects();
  setupProfileAndSettings();

  // Check URL parameters for direct link navigation
  const urlParams = new URLSearchParams(window.location.search);
  const targetTab = urlParams.get('tab');
  const targetProjId = urlParams.get('projectId');
  const action = urlParams.get('action');

  if (targetTab) {
    switchTab(targetTab);
    if (targetTab === 'tabDocuments' && targetProjId) {
      setTimeout(() => {
        const docProjFilter = document.getElementById('facultyDocProjectFilter');
        if (docProjFilter) {
          docProjFilter.value = targetProjId;
          renderFacultyDocuments();
        }
      }, 300);
    }
  }

  if (targetProjId) {
    const proj = assignedProjects.find(p => String(p._id || p.id) === String(targetProjId));
    if (proj) {
      if (action === 'review' || proj.status === 'Submitted' || proj.status === 'Pending') {
        openReviewModal(targetProjId, proj.projectName, proj.teamLeaderId?.name || 'Team Leader');
      } else {
        openViewProjectModal(targetProjId);
      }
    } else {
      (async () => {
        try {
          const pRes = await apiRequest(`/faculty/projects/assigned/${targetProjId}`);
          if (pRes.success && pRes.data) {
            const pData = pRes.data;
            if (action === 'review' || pData.status === 'Submitted' || pData.status === 'Pending') {
              openReviewModal(targetProjId, pData.projectName, pData.teamLeaderId?.name || 'Team Leader');
            } else {
              openViewProjectModal(targetProjId);
            }
          }
        } catch (e) {
          console.warn('Could not auto-open project from URL:', e.message);
        }
      })();
    }
  }
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
    tabDashboard: 'Faculty Dashboard',
    tabProjects: 'All Mentored Projects',
    tabPendingEval: 'Projects Pending Evaluation',
    tabCompletedEval: 'Completed Evaluations',
    tabDocuments: 'Student Submissions & Files',
    tabAttendance: 'Mentorship Meetings & Guide Attendance',
    tabStudents: 'Mentored Students Directory',
    tabNotifications: 'Faculty Notifications',
    tabProfile: 'Faculty Profile',
    tabSettings: 'Notification Settings'
  };
  const headingEl = document.getElementById('pageHeading');
  if (headingEl) headingEl.textContent = pageHeadings[tabId] || 'Faculty Portal';

  if (tabId === 'tabProjects') renderFacultyProjectsTable();
  if (tabId === 'tabPendingEval') renderPendingEvaluations();
  if (tabId === 'tabCompletedEval') renderCompletedEvaluations();
  if (tabId === 'tabDocuments') loadFacultyDocuments();
  if (tabId === 'tabAttendance') loadFacultyAttendance();
  if (tabId === 'tabStudents') renderStudentsDirectory();
  if (tabId === 'tabNotifications') renderFacultyNotificationInbox();
}

// Setup Modals
function setupModals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  // Rejection reason toggle for project review
  const decisionSelect = document.getElementById('reviewDecision');
  const reasonBox = document.getElementById('rejectionReasonBox');
  if (decisionSelect && reasonBox) {
    decisionSelect.addEventListener('change', () => {
      reasonBox.style.display = decisionSelect.value === 'Rejected' ? 'block' : 'none';
    });
  }

  // Review Form Submit
  const reviewForm = document.getElementById('reviewProjectForm');
  if (reviewForm) reviewForm.addEventListener('submit', handleReviewSubmit);

  // Deadline extension decision toggle
  const deadlineDecSelect = document.getElementById('facultyDeadlineDecision');
  const deadlineRemarkBox = document.getElementById('deadlineRejectionRemarkGroup');
  if (deadlineDecSelect && deadlineRemarkBox) {
    deadlineDecSelect.addEventListener('change', () => {
      deadlineRemarkBox.style.display = deadlineDecSelect.value === 'Rejected' ? 'block' : 'none';
    });
  }

  // Deadline decision form submit
  const deadlineForm = document.getElementById('deadlineDecisionForm');
  if (deadlineForm) deadlineForm.addEventListener('submit', handleDeadlineDecisionSubmit);

  // Evaluate Form Submit
  const evalForm = document.getElementById('evaluateProjectForm');
  if (evalForm) evalForm.addEventListener('submit', handleEvaluationSubmit);

  // Modal Go Evaluate button inside View Project modal
  const btnModalGoEvaluate = document.getElementById('btnModalGoEvaluate');
  if (btnModalGoEvaluate) {
    btnModalGoEvaluate.addEventListener('click', () => {
      document.getElementById('viewProjectModal').classList.remove('active');
      if (activeViewingProjectId) openEvaluationModal(activeViewingProjectId);
    });
  }
}

// Load Faculty's Assigned Projects & Pending Extension Requests
async function loadAssignedProjects() {
  try {
    const res = await apiRequest('/faculty/projects/assigned');
    if (res.success) {
      assignedProjects = res.data;

      // Calculate statistics
      const total = assignedProjects.length;
      const active = assignedProjects.filter(p => p.status === 'Approved' || p.status === 'In Progress').length;
      const completed = assignedProjects.filter(p => p.status === 'Completed').length;
      const pendingEval = assignedProjects.filter(p => !p.isEvaluated && p.status !== 'Rejected').length;

      const evaluatedProjects = assignedProjects.filter(p => p.isEvaluated && p.evaluation);
      const avgMarks = evaluatedProjects.length === 0 ? 0 : Math.round(
        evaluatedProjects.reduce((acc, p) => acc + (p.evaluation.totalMarks || 0), 0) / evaluatedProjects.length
      );

      document.getElementById('cardAssignedProjects').textContent = total;
      document.getElementById('cardActiveProjects').textContent = active;
      document.getElementById('cardCompletedProjects').textContent = completed;
      document.getElementById('cardPendingEvaluations').textContent = pendingEval;
      document.getElementById('cardAvgMarks').textContent = `${avgMarks} / 100`;

      // Populate Document Project Filter Dropdown
      const docProjFilter = document.getElementById('facultyDocProjectFilter');
      if (docProjFilter) {
        docProjFilter.innerHTML = '<option value="ALL">All Assigned Projects</option>' +
          assignedProjects.map(p => `<option value="${p._id || p.id}">${escapeHtml(p.projectName)}</option>`).join('');
      }

      // Populate Attendance Project Filter & Modal Dropdowns
      const attProjFilter = document.getElementById('filterAttendanceProject');
      if (attProjFilter) {
        attProjFilter.innerHTML = '<option value="ALL">All Mentored Projects</option>' +
          assignedProjects.map(p => `<option value="${p._id || p.id}">${escapeHtml(p.projectName)}</option>`).join('');
      }
      const meetProjSelect = document.getElementById('meetingProjectSelect');
      if (meetProjSelect) {
        meetProjSelect.innerHTML = '<option value="">-- Choose Project --</option>' +
          assignedProjects.map(p => `<option value="${p._id || p.id}">${escapeHtml(p.projectName)}</option>`).join('');
      }

      // Check for submitted projects requiring approval
      const submittedQueue = assignedProjects.filter(p => p.status === 'Submitted' || p.status === 'Pending');
      const queueCard = document.getElementById('approvalQueueCard');
      const queueList = document.getElementById('approvalQueueList');

      if (queueCard && queueList) {
        if (submittedQueue.length > 0) {
          queueCard.style.display = 'block';
          queueList.innerHTML = submittedQueue.map(p => {
            const pid = p._id || p.id;
            return `
            <div style="background: #ffffff; border: 1.5px solid #fde68a; border-radius: 8px; padding: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
              <h4 style="font-size: 15px; margin-bottom: 2px;">${escapeHtml(p.projectName)}</h4>
              <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Leader: ${escapeHtml(p.teamLeaderId?.name || 'N/A')} &bull; ${p.teamMemberIds?.length || 0} Members</p>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-primary" onclick="openReviewModal('${pid}', '${escapeHtml(p.projectName).replace(/'/g, "\\'")}', '${escapeHtml(p.teamLeaderId?.name || '').replace(/'/g, "\\'")}')">Review &amp; Approve</button>
                <button class="btn btn-sm btn-secondary" onclick="openViewProjectModal('${pid}')">Details</button>
              </div>
            </div>
          `;
          }).join('');
        } else {
          queueCard.style.display = 'none';
        }
      }

      // Check for pending deadline extension requests (from offline student-faculty consultation)
      try {
        const dlRes = await apiRequest('/faculty/deadline-requests/pending');
        const dlQueueCard = document.getElementById('deadlineRequestsQueueCard');
        const dlQueueList = document.getElementById('deadlineRequestsList');
        const dlCountBadge = document.getElementById('pendingDeadlineCount');

        if (dlQueueCard && dlQueueList && dlRes && dlRes.success) {
          const dlRequests = dlRes.data || [];
          if (dlCountBadge) dlCountBadge.textContent = `${dlRequests.length} Request${dlRequests.length === 1 ? '' : 's'}`;

          if (dlRequests.length > 0) {
            dlQueueCard.style.display = 'block';
            dlQueueList.innerHTML = dlRequests.map(r => `
              <div style="background: #ffffff; border: 1px solid #bae6fd; border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                    <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: ${r.type === 'milestone' ? '#7c3aed' : '#0284c7'}; background: ${r.type === 'milestone' ? '#f5f3ff' : '#f0f9ff'}; padding: 2px 6px; border-radius: 4px;">
                      ${r.type === 'milestone' ? 'Milestone' : 'Task'}
                    </span>
                    <span style="font-size: 11px; color: #64748b;">${formatDate(r.requestedAt)}</span>
                  </div>
                  <h4 style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">${escapeHtml(r.name)}</h4>
                  <p style="font-size: 12px; color: #475569; margin-bottom: 4px;"><strong>Project:</strong> ${escapeHtml(r.projectName)}</p>
                  <p style="font-size: 12px; color: #64748b; margin-bottom: 8px;"><strong>Requested By:</strong> ${escapeHtml(r.studentName)}</p>
                  
                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                      <span style="color: #64748b;">Previous Date:</span>
                      <strong style="color: #dc2626;">${formatDate(r.previousDeadline)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                      <span style="color: #64748b;">Requested Date:</span>
                      <strong style="color: #2563eb;">${formatDate(r.requestedDeadline)}</strong>
                    </div>
                    <div style="color: #334155; font-style: italic; margin-top: 4px; border-top: 1px dashed #cbd5e1; padding-top: 4px;">
                      "${escapeHtml(r.reason || 'Offline discussion with faculty')}"
                    </div>
                  </div>
                </div>

                <div style="display: flex; gap: 8px; margin-top: 8px;">
                  <button class="btn btn-sm btn-primary" style="flex: 1;" onclick="openDeadlineDecisionModal('${r.id}', '${r.type}', '${escapeHtml(r.name).replace(/'/g, "\\'")}', '${escapeHtml(r.projectName).replace(/'/g, "\\'")}', '${escapeHtml(r.studentName).replace(/'/g, "\\'")}', '${r.previousDeadline}', '${r.requestedDeadline}', '${escapeHtml(r.reason || '').replace(/'/g, "\\'")}')">
                    Review Extension
                  </button>
                </div>
              </div>
            `).join('');
          } else {
            dlQueueCard.style.display = 'none';
          }
        }
      } catch (dlErr) {
        console.warn('Failed to load pending deadline requests:', dlErr);
      }

      renderFacultyProjectCards();
    }
  } catch (err) {
    console.error('Failed to load faculty projects:', err);
  }
}

// Academic Normalization Dictionaries & Helpers for UI Filtering
const FAC_DEPT_MAP = {
  'cse': 'CSE',
  'computer science & engineering': 'CSE',
  'computer science and engineering': 'CSE',
  'computer science': 'CSE',

  'cse (ai & ml)': 'CSE (AI & ML)',
  'cse(ai&ml)': 'CSE (AI & ML)',
  'cse (aiml)': 'CSE (AI & ML)',
  'cse(aiml)': 'CSE (AI & ML)',
  'cse ai & ml': 'CSE (AI & ML)',
  'cse ai and ml': 'CSE (AI & ML)',
  'computer science & engineering (ai & ml)': 'CSE (AI & ML)',
  'computer science and engineering (ai & ml)': 'CSE (AI & ML)',
  'computer science and engineering (artificial intelligence and machine learning)': 'CSE (AI & ML)',
  'ai & ml': 'CSE (AI & ML)',
  'ai and ml': 'CSE (AI & ML)',
  'aiml': 'CSE (AI & ML)',

  'cse (ai)': 'CSE (AI)',
  'cse(ai)': 'CSE (AI)',
  'cse ai': 'CSE (AI)',
  'computer science & engineering (ai)': 'CSE (AI)',
  'computer science and engineering (ai)': 'CSE (AI)',
  'computer science and engineering (artificial intelligence)': 'CSE (AI)',
  'ai': 'CSE (AI)',

  'cse (data science)': 'CSE (Data Science)',
  'cse(data science)': 'CSE (Data Science)',
  'cse (ds)': 'CSE (Data Science)',
  'cse(ds)': 'CSE (Data Science)',
  'cse data science': 'CSE (Data Science)',
  'computer science & engineering (data science)': 'CSE (Data Science)',
  'computer science and engineering (data science)': 'CSE (Data Science)',
  'data science': 'CSE (Data Science)',

  'cse (cyber security)': 'CSE (Cyber Security)',
  'cse(cyber security)': 'CSE (Cyber Security)',
  'cse (cybersecurity)': 'CSE (Cyber Security)',
  'cse(cybersecurity)': 'CSE (Cyber Security)',
  'cse (cs)': 'CSE (Cyber Security)',
  'cse(cs)': 'CSE (Cyber Security)',
  'cse cyber security': 'CSE (Cyber Security)',
  'computer science & engineering (cyber security)': 'CSE (Cyber Security)',
  'computer science and engineering (cyber security)': 'CSE (Cyber Security)',
  'cyber security': 'CSE (Cyber Security)',
  'cybersecurity': 'CSE (Cyber Security)',

  'it': 'IT',
  'information technology': 'IT',

  'ece': 'ECE',
  'electronics & communication': 'ECE',
  'electronics and communication': 'ECE',
  'electronics & communication engineering': 'ECE',
  'electronics and communication engineering': 'ECE',

  'eee': 'EEE',
  'electrical & electronics': 'EEE',
  'electrical and electronics': 'EEE',
  'electrical & electronics engineering': 'EEE',
  'electrical and electronics engineering': 'EEE',

  'mech': 'MECH',
  'mechanical': 'MECH',
  'mechanical engineering': 'MECH',

  'civil': 'CIVIL',
  'civil engineering': 'CIVIL'
};

const FAC_YEAR_MAP = {
  '1': '1st Year',
  '1st': '1st Year',
  '1st year': '1st Year',
  'i': '1st Year',
  'i year': '1st Year',
  'first year': '1st Year',

  '2': '2nd Year',
  '2nd': '2nd Year',
  '2nd year': '2nd Year',
  'ii': '2nd Year',
  'ii year': '2nd Year',
  'second year': '2nd Year',

  '3': '3rd Year',
  '3rd': '3rd Year',
  '3rd year': '3rd Year',
  'iii': '3rd Year',
  'iii year': '3rd Year',
  'third year': '3rd Year',

  '4': '4th Year',
  '4th': '4th Year',
  '4th year': '4th Year',
  'iv': '4th Year',
  'iv year': '4th Year',
  'fourth year': '4th Year'
};

function normalizeFacultyDept(dept) {
  if (!dept) return '';
  const key = String(dept).trim().toLowerCase();
  return FAC_DEPT_MAP[key] || dept.trim();
}

function normalizeFacultyYear(yr) {
  if (!yr) return '3rd Year';
  const key = String(yr).trim().toLowerCase();
  return FAC_YEAR_MAP[key] || yr.trim();
}

function matchYear(actualYear, filterYear) {
  if (!filterYear || filterYear === 'ALL' || filterYear === '') return true;
  const nActual = normalizeFacultyYear(actualYear || '3rd Year').toLowerCase();
  const nFilter = normalizeFacultyYear(filterYear).toLowerCase();
  if (nActual === nFilter) return true;

  const a = String(actualYear || '3rd Year').toLowerCase().replace(/[^a-z0-9]/g, '');
  const f = String(filterYear).toLowerCase().replace(/[^a-z0-9]/g, '');
  return a.includes(f) || f.includes(a);
}

function getMeetingYear(m) {
  if (m && m.projectYear && String(m.projectYear).trim()) {
    return normalizeFacultyYear(m.projectYear);
  }
  const proj = assignedProjects.find(p => String(p._id || p.id) === String(m?.projectId));
  if (proj && proj.year) {
    return normalizeFacultyYear(proj.year);
  }
  if (m && Array.isArray(m.attendanceRecords) && m.attendanceRecords.length > 0) {
    const rWithYear = m.attendanceRecords.find(r => r.year);
    if (rWithYear && rWithYear.year) return normalizeFacultyYear(rWithYear.year);
  }
  return '3rd Year';
}

function getMeetingDept(m) {
  if (m && m.projectDept && String(m.projectDept).trim()) {
    return normalizeFacultyDept(m.projectDept);
  }
  const proj = assignedProjects.find(p => String(p._id || p.id) === String(m?.projectId));
  if (proj && proj.department) {
    return normalizeFacultyDept(proj.department);
  }
  return 'CSE';
}

function matchDept(actualDept, filterDept) {
  if (!filterDept) return true;
  if (!actualDept) return false;
  const nActual = normalizeFacultyDept(actualDept).toLowerCase();
  const nFilter = normalizeFacultyDept(filterDept).toLowerCase();
  if (nActual === nFilter) return true;

  const a = String(actualDept).toLowerCase().replace(/[^a-z0-9]/g, '');
  const f = String(filterDept).toLowerCase().replace(/[^a-z0-9]/g, '');
  return a.includes(f) || f.includes(a);
}

// Render Assigned Project Cards (Overview Tab)
function renderFacultyProjectCards() {
  const container = document.getElementById('facultyProjectsGrid');
  if (!container) return;

  const yearFilter = document.getElementById('overviewYearFilter')?.value || '';
  const filtered = assignedProjects.filter(p => matchYear(p.year, yearFilter));

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #94a3b8; background: #ffffff; border-radius: 12px; border: 1px dashed var(--border-color);">
        <p>${yearFilter ? `No projects found for ${yearFilter}.` : 'No projects currently assigned to you for mentorship.'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(p => {
    const statusClass = (p.status || 'submitted').toLowerCase().replace(' ', '');
    const marksDisplay = p.evaluation ? `${p.evaluation.totalMarks} / 100` : 'Not Evaluated';
    const yearLabel = p.year || '3rd Year';
    const deptLabel = p.department || 'CSE';

    return `
      <div class="card" style="margin-bottom: 0; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color);">
        <div class="card-header" style="padding: 14px 18px; flex-wrap: wrap; gap: 8px;">
          <div>
            <h4 style="font-size: 16px; margin-bottom: 2px;">${p.projectName}</h4>
            <span style="font-size: 12px; color: var(--text-muted);">${p.domain}</span>
          </div>
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <span class="badge badge-submitted" style="font-weight: 700;">${yearLabel}</span>
            <span class="badge badge-draft" style="font-size: 11px;">${deptLabel}</span>
            <span class="badge badge-${statusClass}">${p.status}</span>
          </div>
        </div>
        <div class="card-body" style="padding: 18px;">
          <div style="margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
              <span>Student Progress</span>
              <strong>${p.progress || 0}%</strong>
            </div>
            <div class="progress-container">
              <div class="progress-bar-fill" style="width: ${p.progress || 0}%;"></div>
            </div>
          </div>
          <div style="font-size: 12px; color: #475569; display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; background: #f8fafc; padding: 10px 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div><strong>Academic Batch:</strong> <span style="color: #2563eb; font-weight: 600;">${yearLabel}</span> &bull; <span>${deptLabel}</span></div>
            <div><strong>Team Leader:</strong> ${p.teamLeaderId?.name || 'N/A'} (${p.teamLeaderId?.registerNumber || ''})</div>
            <div><strong>Team Size:</strong> ${p.teamMemberIds?.length || 0} Students</div>
            <div><strong>Deadline:</strong> ${formatDate(p.deadline)}</div>
            <div><strong>Marks:</strong> <span style="font-weight: 700; color: ${p.evaluation ? '#059669' : '#d97706'};">${marksDisplay}</span></div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${(p.status === 'Submitted' || p.status === 'Pending') ? `
              <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="openReviewModal('${p._id || p.id}', '${escapeHtml(p.projectName).replace(/'/g, "\\'")}', '${escapeHtml(p.teamLeaderId?.name || '').replace(/'/g, "\\'")}')">Review &amp; Approve</button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="openViewProjectModal('${p._id || p.id}')">Details</button>
            <button class="btn btn-outline-primary btn-sm" onclick="openFacultyProjectDocuments('${p._id || p.id}')" title="Student Deliverables & Submissions">📁 Files</button>
            <button class="btn btn-faculty btn-sm" style="flex: 1;" onclick="openEvaluationModal('${p._id || p.id}')">${p.evaluation ? 'Re-Grade' : 'Evaluate'}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Projects Table Tab
function renderFacultyProjectsTable() {
  const tbody = document.getElementById('facultyProjectsTableBody');
  if (!tbody) return;

  const yearFilter = document.getElementById('filterFacProjYear')?.value || '';
  const deptFilter = document.getElementById('filterFacProjDept')?.value || '';
  const statusFilter = document.getElementById('filterFacProjStatus')?.value || '';

  const filtered = assignedProjects.filter(p => {
    if (!matchYear(p.year, yearFilter)) return false;
    if (!matchDept(p.department, deptFilter)) return false;
    if (statusFilter && (p.status || '').toLowerCase() !== statusFilter.toLowerCase()) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 24px; color: #94a3b8;">No projects found matching selected filters.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const statusClass = (p.status || 'submitted').toLowerCase().replace(' ', '');
    const marksDisplay = p.evaluation ? `<span class="badge badge-completed">${p.evaluation.totalMarks}/100</span>` : '<span class="badge badge-inprogress">Pending</span>';
    const yearLabel = p.year || '3rd Year';
    const deptLabel = p.department || 'CSE';

    return `
      <tr>
        <td><strong>${p.projectName}</strong><div style="font-size: 11px; color: #64748b;">${p.domain}</div></td>
        <td><span class="badge badge-submitted" style="font-weight: 700;">${yearLabel}</span></td>
        <td><span style="font-size: 12px; color: #475569; font-weight: 500;">${deptLabel}</span></td>
        <td>${p.teamLeaderId?.name || 'N/A'} <div style="font-size: 11px; color: #64748b;">(${p.teamLeaderId?.registerNumber || ''})</div></td>
        <td>${p.teamMemberIds?.length || 0} Members</td>
        <td>${formatDate(p.deadline)}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="progress-container" style="width: 70px;">
              <div class="progress-bar-fill" style="width: ${p.progress || 0}%;"></div>
            </div>
            <span style="font-size: 12px; font-weight: 600;">${p.progress || 0}%</span>
          </div>
        </td>
        <td><span class="badge badge-${statusClass}">${p.status}</span></td>
        <td>${marksDisplay}</td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${(p.status === 'Submitted' || p.status === 'Pending') ? `
              <button class="btn btn-sm btn-primary" onclick="openReviewModal('${p._id || p.id}', '${escapeHtml(p.projectName).replace(/'/g, "\\'")}', '${escapeHtml(p.teamLeaderId?.name || '').replace(/'/g, "\\'")}')">Review &amp; Approve</button>
            ` : ''}
            <button class="btn btn-sm btn-secondary" onclick="openViewProjectModal('${p._id || p.id}')">View</button>
            <button class="btn btn-sm btn-outline-primary" onclick="openFacultyProjectDocuments('${p._id || p.id}')" title="Student Deliverables">📁 Files</button>
            <button class="btn btn-sm btn-faculty" onclick="openEvaluationModal('${p._id || p.id}')">${p.evaluation ? 'Re-Grade' : 'Grade'}</button>
            ${p.evaluation ? `<button class="btn btn-sm btn-outline-success" onclick="exportProjectMarksPDF('${p._id || p.id}')" title="Print / Download Official Marks Sheet (PDF)" style="border-color: #059669; color: #059669; font-weight: 600; display: inline-flex; align-items: center; gap: 2px;">📄 PDF</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="handleDeleteFacultyProject('${p._id || p.id}', '${escapeHtml(p.projectName)}')" title="Delete Project">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.handleDeleteFacultyProject = async function(projectId, projectName) {
  if (!confirm(`Are you sure you want to delete the project "${projectName}"?\n\nThis will permanently delete the project and all associated milestones and tasks.`)) {
    return;
  }

  try {
    const res = await apiRequest(`/projects/${projectId}`, 'DELETE');
    if (res.success) {
      showToast('Project deleted successfully.', 'success');
      await loadAssignedProjects();
    }
  } catch (err) {
    showToast(err.message || 'Failed to delete project.', 'error');
  }
};

// --------------------------------------------------------------------------
// VIEW PROJECT DETAILS MODAL
// --------------------------------------------------------------------------
window.openViewProjectModal = async function(projectId) {
  activeViewingProjectId = projectId;
  const modal = document.getElementById('viewProjectModal');
  const body = document.getElementById('viewProjModalBody');
  const title = document.getElementById('viewProjModalTitle');

  body.innerHTML = '<p style="text-align: center; padding: 30px; color: #64748b;">Loading project details...</p>';
  modal.classList.add('active');

  try {
    const res = await apiRequest(`/projects/${projectId}`);
    if (res.success) {
      const p = res.data;
      title.textContent = p.projectName;

      // Group tasks by assigned student to show individual progress
      const tasks = p.tasks || [];
      const milestones = p.milestones || [];

      const membersHtml = (p.teamMemberIds || []).map(m => {
        const studentTasks = tasks.filter(t =>
          t.isGroupTask ||
          t.assignedTo === 'ALL' ||
          (Array.isArray(t.assignedMembers) && t.assignedMembers.some(am => String(am._id || am.id) === String(m._id || m.id))) ||
          (t.assignedTo?._id === m._id || t.assignedTo?.id === m.id)
        );
        const completedStudentTasks = studentTasks.filter(t => t.status === 'Completed').length;
        const studentProgress = studentTasks.length === 0 ? 0 : Math.round((completedStudentTasks / studentTasks.length) * 100);

        return `
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <strong>${m.name}</strong>
              <span style="font-size: 12px; color: #64748b;">${m.registerNumber}</span>
            </div>
            <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">
              Tasks: ${completedStudentTasks} / ${studentTasks.length} Completed (${studentProgress}%)
            </div>
            <div class="progress-container" style="height: 6px;">
              <div class="progress-bar-fill" style="width: ${studentProgress}%;"></div>
            </div>
          </div>
        `;
      }).join('');

      const milestonesHtml = milestones.length === 0
        ? '<p style="font-size: 13px; color: #94a3b8;">No milestones defined yet.</p>'
        : milestones.map(m => {
          let statusBadge = '';
          if (m.deadlineStatus === 'Pending_Approval') {
            statusBadge = `<span style="font-size: 11px; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 4px; font-weight: 600;">⏳ Ext. Pending: ${formatDate(m.requestedDeadline)}</span>`;
          } else if (m.deadlineStatus === 'Rejected') {
            statusBadge = `<span style="font-size: 11px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 2px 6px; border-radius: 4px; font-weight: 600;">⚠️ Enforced Date: ${formatDate(m.deadline)}</span>`;
          } else if (m.deadlineStatus === 'Approved' && m.allocatedDeadline && m.allocatedDeadline !== m.previousDeadline) {
            statusBadge = `<span style="font-size: 11px; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 2px 6px; border-radius: 4px; font-weight: 600;">✓ Ext. Approved</span>`;
          }

          return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 6px; font-size: 13px;">
            <div>
              <strong>${escapeHtml(m.name)}</strong>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px; display: flex; align-items: center; gap: 8px;">
                <span>Active Deadline: <strong>${formatDate(m.deadline)}</strong></span>
                ${statusBadge}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-weight: 600;">${m.progress || 0}%</span>
              <span class="badge badge-${m.status === 'Completed' ? 'completed' : 'inprogress'}">${m.status}</span>
            </div>
          </div>
        `;
        }).join('');

      const tasksHtml = tasks.length === 0
        ? '<p style="font-size: 13px; color: #94a3b8;">No tasks created.</p>'
        : tasks.map(t => {
          let assigneeLabel = t.assignedTo?.name || 'Unassigned';
          if (t.isGroupTask || t.assignedTo === 'ALL') {
            assigneeLabel = '👥 Entire Team (Group Task)';
          } else if (Array.isArray(t.assignedMembers) && t.assignedMembers.length > 1) {
            assigneeLabel = `👥 ${t.assignedMembers.map(x => x.name).join(', ')}`;
          }

          let taskBadge = '';
          if (t.deadlineStatus === 'Pending_Approval') {
            taskBadge = `<span style="font-size: 10px; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 1px 5px; border-radius: 3px; font-weight: 600;">⏳ Req: ${formatDate(t.requestedDeadline)}</span>`;
          } else if (t.deadlineStatus === 'Rejected') {
            taskBadge = `<span style="font-size: 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 1px 5px; border-radius: 3px; font-weight: 600;">⚠️ Enforced: ${formatDate(t.deadline)}</span>`;
          } else if (t.deadlineStatus === 'Approved' && t.allocatedDeadline && t.allocatedDeadline !== t.previousDeadline) {
            taskBadge = `<span style="font-size: 10px; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 1px 5px; border-radius: 3px; font-weight: 600;">✓ Approved</span>`;
          }

          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 6px; font-size: 13px;">
              <div>
                <strong>${escapeHtml(t.name)}</strong> &bull; <span style="color: #64748b;">${assigneeLabel}</span>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px; display: flex; align-items: center; gap: 8px;">
                  <span>Priority: ${t.priority}</span> &bull; 
                  <span>Active Due: <strong>${formatDate(t.deadline)}</strong></span>
                  ${taskBadge}
                </div>
              </div>
              <span class="badge badge-${t.status === 'Completed' ? 'completed' : 'inprogress'}">${t.status}</span>
            </div>
          `;
        }).join('');

      body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- 1. Project Information -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
            <h4 style="font-size: 14px; margin-bottom: 8px; color: #1e3a8a;">PROJECT INFORMATION</h4>
            <p style="font-size: 14px; margin-bottom: 12px; line-height: 1.5;">${p.description}</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
              <div><strong>Academic Year:</strong> <span class="badge badge-submitted" style="font-size: 12px; font-weight: 700;">${p.year || '3rd Year'}</span></div>
              <div><strong>Department:</strong> <span style="color: #1e40af; font-weight: 600;">${p.department || 'Computer Science & Engineering'}</span></div>
              <div><strong>Domain:</strong> ${p.domain}</div>
              <div><strong>Team Leader:</strong> ${p.teamLeaderId?.name} (${p.teamLeaderId?.registerNumber || ''})</div>
              <div><strong>Start Date:</strong> ${formatDate(p.startDate)}</div>
              <div><strong>Deadline:</strong> ${formatDate(p.deadline)}</div>
              <div><strong>Status:</strong> <span class="badge badge-${p.status.toLowerCase()}">${p.status}</span></div>
              <div><strong>Progress:</strong> ${p.progress || 0}%</div>
            </div>
          </div>

          <!-- 2. Team Members & Task Progress -->
          <div>
            <h4 style="font-size: 14px; margin-bottom: 10px; color: #1e3a8a;">TEAM MEMBERS (${p.teamMemberIds?.length || 0})</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
              ${membersHtml}
            </div>
          </div>

          <!-- 3. Milestones -->
          <div>
            <h4 style="font-size: 14px; margin-bottom: 10px; color: #1e3a8a;">MILESTONES</h4>
            <div>${milestonesHtml}</div>
          </div>

          <!-- 4. Granular Tasks -->
          <div>
            <h4 style="font-size: 14px; margin-bottom: 10px; color: #1e3a8a;">TASKS</h4>
            <div style="max-height: 200px; overflow-y: auto;">${tasksHtml}</div>
          </div>

          <!-- 5. Evaluation & Marks Sheet (if Evaluated) -->
          ${p.evaluation ? `
            <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <h4 style="font-size: 14px; margin: 0; color: #166534; font-weight: 800;">OFFICIAL PROJECT & INDIVIDUAL MARKS</h4>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="badge badge-completed" style="font-size: 13px; font-weight: 700; padding: 4px 10px;">Score: ${p.evaluation.totalMarks} / 100</span>
                  <button type="button" class="btn btn-outline-primary btn-sm" onclick="exportProjectMarksPDF('${p._id}')" style="display: inline-flex; align-items: center; gap: 6px; border-color: #15803d; color: #15803d; font-weight: 700;">
                    📄 Export Marks Sheet (PDF)
                  </button>
                </div>
              </div>
              <div class="rubric-box" style="margin-bottom: 8px;">
                <div class="rubric-row"><span>1. Project Work & Scope Formulation</span><strong>${p.evaluation.projectWork}/30</strong></div>
                <div class="rubric-row"><span>2. Technical Implementation & Prototype</span><strong>${p.evaluation.implementation}/25</strong></div>
                <div class="rubric-row"><span>3. Documentation, Report & Synopsis</span><strong>${p.evaluation.documentation}/15</strong></div>
                <div class="rubric-row"><span>4. Presentation & Viva Voce</span><strong>${p.evaluation.presentation}/20</strong></div>
                <div class="rubric-row"><span>5. Team Coordination & Participation</span><strong>${p.evaluation.teamParticipation}/10</strong></div>
              </div>
              ${p.evaluation.feedback ? `<div style="font-size: 12.5px; color: #166534; margin-top: 8px; background: #dcfce7; padding: 8px 12px; border-radius: 6px;"><strong>Faculty Guide Feedback:</strong> ${escapeHtml(p.evaluation.feedback)}</div>` : ''}
            </div>
          ` : ''}

          <!-- 6. Review & Approval Action Banner if Submitted -->
          ${(p.status === 'Submitted' || p.status === 'Pending') ? `
            <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div>
                <strong style="color: #b45309; font-size: 14px;">📌 Project Proposal Awaiting Your Approval</strong>
                <p style="margin: 4px 0 0; font-size: 12.5px; color: #78350f;">Review the team submission details above and approve or provide revision remarks.</p>
              </div>
              <button class="btn btn-primary btn-sm" onclick="document.getElementById('viewProjectModal').classList.remove('active'); openReviewModal('${p._id || p.id}', '${escapeHtml(p.projectName).replace(/'/g, "\\'")}', '${escapeHtml(p.teamLeaderId?.name || 'Team Leader').replace(/'/g, "\\'")}')">
                Review &amp; Approve Now
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }
  } catch (err) {
    body.innerHTML = '<p style="color: red;">Failed to load project details.</p>';
  }
};

// --------------------------------------------------------------------------
// REVIEW PROJECT MODAL (APPROVE / REJECT)
// --------------------------------------------------------------------------
window.openReviewModal = function(projectId, projectName, leaderName) {
  document.getElementById('reviewProjectId').value = projectId;
  document.getElementById('reviewProjName').textContent = projectName;
  document.getElementById('reviewProjLeader').textContent = `Team Leader: ${leaderName}`;
  document.getElementById('reviewDecision').value = 'Approved';
  document.getElementById('rejectionReasonBox').style.display = 'none';
  document.getElementById('reviewProjectModal').classList.add('active');
};

async function handleReviewSubmit(e) {
  e.preventDefault();
  const projectId = document.getElementById('reviewProjectId').value;
  const status = document.getElementById('reviewDecision').value;
  const rejectionReason = document.getElementById('rejectionReasonText').value.trim();
  const submitBtn = document.getElementById('btnSubmitReview');

  if (status === 'Rejected' && !rejectionReason) {
    showToast('Please provide a reason for rejecting the project.', 'warning');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const res = await apiRequest(`/projects/${projectId}/status`, 'PUT', { status, rejectionReason });
    if (res.success) {
      showToast(`Project status updated to ${status}! Team notified.`, 'success');
      document.getElementById('reviewProjectModal').classList.remove('active');
      await loadAssignedProjects();
    }
  } catch (err) {
    showToast(err.message || 'Failed to update review status', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Decision';
  }
}

// --------------------------------------------------------------------------
// DEADLINE EXTENSION DECISION MODAL (APPROVE / REJECT)
// --------------------------------------------------------------------------
window.openDeadlineDecisionModal = function(id, type, name, projectName, studentName, prevDate, reqDate, reason) {
  document.getElementById('decisionItemId').value = id;
  document.getElementById('decisionItemType').value = type;
  document.getElementById('decisionItemTypeLabel').textContent = type === 'milestone' ? 'Milestone Deadline Extension' : 'Task Deadline Extension';
  document.getElementById('decisionItemName').textContent = name;
  document.getElementById('decisionProjectName').textContent = `Project: ${projectName}`;
  document.getElementById('decisionRequestedBy').textContent = `Requested by: ${studentName}`;
  document.getElementById('decisionPrevDeadline').textContent = formatDate(prevDate);
  document.getElementById('decisionReqDeadline').textContent = formatDate(reqDate);
  document.getElementById('decisionStudentReason').textContent = reason ? `"${reason}"` : 'No reason provided by student.';
  document.getElementById('facultyDeadlineDecision').value = 'Approved';
  document.getElementById('deadlineRejectionRemarkGroup').style.display = 'none';
  document.getElementById('facultyDeadlineRemarks').value = '';
  document.getElementById('deadlineDecisionModal').classList.add('active');
};

async function handleDeadlineDecisionSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('decisionItemId').value;
  const type = document.getElementById('decisionItemType').value;
  const decision = document.getElementById('facultyDeadlineDecision').value;
  const remarks = document.getElementById('facultyDeadlineRemarks').value.trim();
  const submitBtn = document.getElementById('btnSubmitDeadlineDecision');

  if (decision === 'Rejected' && !remarks) {
    showToast('Please provide remarks/reason for rejecting this deadline extension.', 'warning');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Decision...';

    const endpoint = type === 'milestone' ? `/milestones/${id}/deadline-decision` : `/tasks/${id}/deadline-decision`;
    const res = await apiRequest(endpoint, 'PUT', { decision, remarks });

    if (res.success) {
      const msg = decision === 'Approved'
        ? 'Deadline extension approved! All project team members have been notified via email.'
        : 'Deadline extension rejected. Deadline reverted strictly to original date & team notified via email.';
      showToast(msg, 'success');
      document.getElementById('deadlineDecisionModal').classList.remove('active');
      await loadAssignedProjects();
    }
  } catch (err) {
    showToast(err.message || 'Failed to submit deadline decision', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirm Decision';
  }
}

// --------------------------------------------------------------------------
// EVALUATION & INDIVIDUAL STUDENT GRADING MODAL
// --------------------------------------------------------------------------
function setupRubricLiveCalculation() {
  const inputs = [
    'rubricProjectWork',
    'rubricImplementation',
    'rubricDocumentation',
    'rubricPresentation',
    'rubricParticipation'
  ];

  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', calculateRubricTotal);
    }
  });
}

function calculateRubricTotal() {
  const pw = Math.min(30, Math.max(0, parseInt(document.getElementById('rubricProjectWork').value, 10) || 0));
  const imp = Math.min(25, Math.max(0, parseInt(document.getElementById('rubricImplementation').value, 10) || 0));
  const doc = Math.min(15, Math.max(0, parseInt(document.getElementById('rubricDocumentation').value, 10) || 0));
  const pres = Math.min(20, Math.max(0, parseInt(document.getElementById('rubricPresentation').value, 10) || 0));
  const tp = Math.min(10, Math.max(0, parseInt(document.getElementById('rubricParticipation').value, 10) || 0));

  const total = pw + imp + doc + pres + tp;
  const badge = document.getElementById('evalTotalBadge');
  if (badge) badge.textContent = `${total} / 100`;

  return { pw, imp, doc, pres, tp, total };
}

window.openEvaluationModal = async function(projectId) {
  const p = assignedProjects.find(item => item._id === projectId || item.id === projectId);
  if (!p) return;

  document.getElementById('evalProjectId').value = p._id || p.id;
  document.getElementById('evalProjName').textContent = p.projectName;
  document.getElementById('evalTeamInfo').textContent = `Team Leader: ${p.teamLeaderId?.name || 'N/A'} • ${p.teamMemberIds?.length || 0} Members`;

  // Pre-fill existing evaluation if present
  if (p.evaluation) {
    document.getElementById('rubricProjectWork').value = p.evaluation.projectWork || 0;
    document.getElementById('rubricImplementation').value = p.evaluation.implementation || 0;
    document.getElementById('rubricDocumentation').value = p.evaluation.documentation || 0;
    document.getElementById('rubricPresentation').value = p.evaluation.presentation || 0;
    document.getElementById('rubricParticipation').value = p.evaluation.teamParticipation || 0;
    document.getElementById('evalOverallFeedback').value = p.evaluation.feedback || '';
  } else {
    document.getElementById('rubricProjectWork').value = 25;
    document.getElementById('rubricImplementation').value = 20;
    document.getElementById('rubricDocumentation').value = 12;
    document.getElementById('rubricPresentation').value = 16;
    document.getElementById('rubricParticipation').value = 8;
    document.getElementById('evalOverallFeedback').value = '';
  }
  calculateRubricTotal();

  // Load existing individual evaluations & attendance statistics
  let existingIndividual = [];
  let projectAttendanceStats = {};

  try {
    const [indRes, attRes] = await Promise.all([
      apiRequest(`/evaluations/individual/${projectId}`),
      apiRequest(`/attendance/project/${projectId}`)
    ]);
    if (indRes.success) existingIndividual = indRes.data || [];
    if (attRes.success && attRes.studentStats) projectAttendanceStats = attRes.studentStats;
  } catch (e) {}

  // Populate individual grading list for each student with confidential attendance metric
  const list = document.getElementById('individualGradingList');
  if (list) {
    list.innerHTML = (p.teamMemberIds || []).map((m, idx) => {
      const sId = String(m._id || m.id);
      const prev = existingIndividual.find(item => String(item.studentId?._id || item.studentId?.id || item.studentId) === sId);
      const prevMark = prev ? prev.marks : 85;
      const prevFeedback = prev ? prev.feedback : '';

      const stat = projectAttendanceStats[sId] || { totalMeetings: 0, presentCount: 0, percentage: 0 };
      const hasMeetings = stat.totalMeetings > 0;
      const attColor = stat.percentage >= 75 ? '#059669' : (hasMeetings ? '#d97706' : '#64748b');
      const attBg = stat.percentage >= 75 ? '#ecfdf5' : (hasMeetings ? '#fffbeb' : '#f8fafc');
      const attBorder = stat.percentage >= 75 ? '#a7f3d0' : (hasMeetings ? '#fde68a' : '#e2e8f0');

      return `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div>
              <span style="font-weight: 700; color: #10b981; margin-right: 6px;">#${idx + 1}</span>
              <strong>${escapeHtml(m.name)}</strong> (${escapeHtml(m.registerNumber || 'N/A')})
              <span style="font-size: 11px; color: #64748b; margin-left: 6px;">${escapeHtml(m.department || '')}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px; font-weight: 600;">Marks:</span>
              <input type="number" class="form-input ind-student-mark" data-student="${sId}" min="0" max="100" value="${prevMark}" style="width: 80px; text-align: center; font-weight: 700;" required>
              <span style="font-size: 13px; color: #64748b;">/ 100</span>
            </div>
          </div>

          <!-- Guide Confidential Meeting Attendance Indicator -->
          <div style="font-size: 12px; background: ${attBg}; border: 1px solid ${attBorder}; padding: 6px 10px; border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              📋 <strong>Meeting Attendance:</strong> 
              ${hasMeetings 
                ? `<span style="font-weight: 700; color: ${attColor};">${stat.presentCount} / ${stat.totalMeetings} (${stat.percentage}%)</span>`
                : `<span style="color: #94a3b8; font-style: italic;">No review meetings logged yet</span>`
              }
            </div>
            <div style="font-size: 10.5px; color: #64748b; font-weight: 500;">(Guide Reference)</div>
          </div>

          <input type="text" class="form-input ind-student-feedback" data-student="${sId}" placeholder="Specific individual feedback for ${escapeHtml(m.name)}..." value="${escapeHtml(prevFeedback)}">
        </div>
      `;
    }).join('');
  }

  document.getElementById('evaluateProjectModal').classList.add('active');
};

async function handleEvaluationSubmit(e) {
  e.preventDefault();
  const projectId = document.getElementById('evalProjectId').value;
  const { pw, imp, doc, pres, tp, total } = calculateRubricTotal();
  const overallFeedback = document.getElementById('evalOverallFeedback').value.trim();
  const submitBtn = document.getElementById('btnSaveEvaluation');

  // Collect individual student evaluations
  const markInputs = document.querySelectorAll('.ind-student-mark');
  const feedbackInputs = document.querySelectorAll('.ind-student-feedback');

  const individualEvaluations = [];
  markInputs.forEach(input => {
    const studentId = input.getAttribute('data-student');
    const marks = parseInt(input.value, 10);
    const fbInput = Array.from(feedbackInputs).find(f => f.getAttribute('data-student') === studentId);
    const feedback = fbInput ? fbInput.value.trim() : '';

    individualEvaluations.push({ studentId, marks, feedback });
  });

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving Evaluation...';

    // 1. Save project rubric evaluation
    await apiRequest('/evaluations', 'POST', {
      projectId,
      projectWork: pw,
      implementation: imp,
      documentation: doc,
      presentation: pres,
      teamParticipation: tp,
      feedback: overallFeedback
    });

    // 2. Save individual member evaluations
    await apiRequest('/evaluations/individual', 'POST', {
      projectId,
      evaluations: individualEvaluations
    });

    showToast('Project evaluation & individual marks saved successfully (kept confidential).', 'success');
    document.getElementById('evaluateProjectModal').classList.remove('active');
    await loadAssignedProjects();
  } catch (err) {
    showToast(err.message || 'Failed to save evaluation', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Evaluation';
  }
}

// --------------------------------------------------------------------------
// PENDING & COMPLETED EVALUATIONS TABS
// --------------------------------------------------------------------------
function renderPendingEvaluations() {
  const container = document.getElementById('pendingEvalContainer');
  if (!container) return;

  const yearFilter = document.getElementById('filterPendingEvalYear')?.value || '';
  const pending = assignedProjects.filter(p => !p.isEvaluated && p.status !== 'Rejected' && matchYear(p.year, yearFilter));

  if (pending.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #10b981; padding: 30px; font-size: 15px; font-weight: 500;">No pending evaluations found for this selection.</p>';
    return;
  }

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
      ${pending.map(p => `
        <div class="card" style="margin-bottom: 0; border: 1px solid var(--border-color);">
          <div class="card-header" style="flex-wrap: wrap; gap: 8px;">
            <div>
              <h4 style="font-size: 15px; margin-bottom: 2px;">${p.projectName}</h4>
              <span style="font-size: 11px; color: var(--text-muted);">${p.domain}</span>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <span class="badge badge-submitted" style="font-weight: 700;">${p.year || '3rd Year'}</span>
              <span class="badge badge-inprogress">Evaluation Due</span>
            </div>
          </div>
          <div class="card-body">
            <div style="font-size: 12px; color: #475569; margin-bottom: 10px; background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div><strong>Department:</strong> ${p.department || 'CSE'}</div>
              <div><strong>Leader:</strong> ${p.teamLeaderId?.name} &bull; ${p.teamMemberIds?.length || 0} Members</div>
            </div>
            <div style="font-size: 13px; margin-bottom: 16px;">Overall Task Progress: <strong>${p.progress || 0}%</strong></div>
            <button class="btn btn-faculty btn-sm" style="width: 100%;" onclick="openEvaluationModal('${p._id || p.id}')">Start Evaluation Rubric</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderCompletedEvaluations() {
  const container = document.getElementById('completedEvalContainer');
  if (!container) return;

  const yearFilter = document.getElementById('filterCompletedEvalYear')?.value || '';
  const completed = assignedProjects.filter(p => p.isEvaluated && p.evaluation && matchYear(p.year, yearFilter));

  if (completed.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 30px;">No completed evaluations found for this selection.</p>';
    return;
  }

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
      ${completed.map(p => `
        <div class="card" style="margin-bottom: 0; border: 1px solid var(--border-color);">
          <div class="card-header" style="flex-wrap: wrap; gap: 8px;">
            <div>
              <h4 style="font-size: 15px; margin-bottom: 2px;">${p.projectName}</h4>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <span class="badge badge-submitted" style="font-weight: 700;">${p.year || '3rd Year'}</span>
                <span class="badge badge-draft" style="font-size: 11px;">${p.department || 'CSE'}</span>
              </div>
            </div>
            <span class="rubric-total-badge">${p.evaluation.totalMarks} / 100</span>
          </div>
          <div class="card-body">
            <div class="rubric-box" style="margin-bottom: 12px;">
              <div class="rubric-row"><span>Project Work</span><strong>${p.evaluation.projectWork}/30</strong></div>
              <div class="rubric-row"><span>Implementation</span><strong>${p.evaluation.implementation}/25</strong></div>
              <div class="rubric-row"><span>Documentation</span><strong>${p.evaluation.documentation}/15</strong></div>
              <div class="rubric-row"><span>Presentation</span><strong>${p.evaluation.presentation}/20</strong></div>
              <div class="rubric-row"><span>Participation</span><strong>${p.evaluation.teamParticipation}/10</strong></div>
            </div>
            <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">Evaluated On: ${formatDate(p.evaluation.evaluatedAt)}</div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-outline-primary btn-sm" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-weight: 600;" onclick="exportProjectMarksPDF('${p._id || p.id}')" title="Print or Download PDF Marks Sheet">
                📄 Marks Sheet (PDF)
              </button>
              <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="openEvaluationModal('${p._id || p.id}')">Update Marks</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// --------------------------------------------------------------------------
// MENTORED STUDENTS DIRECTORY TAB
// --------------------------------------------------------------------------
function renderStudentsDirectory() {
  const tbody = document.getElementById('mentoredStudentsTableBody');
  if (!tbody) return;

  const yearFilter = document.getElementById('filterStudentYear')?.value || '';
  const deptFilter = document.getElementById('filterStudentDept')?.value || '';
  const searchQuery = (document.getElementById('searchStudentInput')?.value || '').trim().toLowerCase();

  const studentMap = new Map();
  assignedProjects.forEach(p => {
    (p.teamMemberIds || []).forEach(m => {
      const key = String(m.registerNumber || m._id || m.id).toUpperCase();
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          ...m,
          year: m.year || p.year || '3rd Year',
          department: m.department || p.department || 'CSE',
          projects: [p.projectName],
          isLeader: String(p.teamLeaderId?._id || p.teamLeaderId?.id || p.teamLeaderId) === String(m._id || m.id) || m.isLeader
        });
      } else {
        const item = studentMap.get(key);
        if (!item.projects.includes(p.projectName)) {
          item.projects.push(p.projectName);
        }
      }
    });
  });

  const students = Array.from(studentMap.values()).filter(s => {
    if (!matchYear(s.year, yearFilter)) return false;
    if (!matchDept(s.department, deptFilter)) return false;
    if (searchQuery) {
      const nameMatch = (s.name || '').toLowerCase().includes(searchQuery);
      const regMatch = (s.registerNumber || '').toLowerCase().includes(searchQuery);
      const emailMatch = (s.email || '').toLowerCase().includes(searchQuery);
      const phoneMatch = (s.phone || '').toLowerCase().includes(searchQuery);
      if (!nameMatch && !regMatch && !emailMatch && !phoneMatch) return false;
    }
    return true;
  });

  if (students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8;">No students found matching selected filters.</td></tr>';
    return;
  }

  tbody.innerHTML = students.map(s => {
    const dispYear = normalizeFacultyYear(s.year) || s.year || '3rd Year';
    const dispDept = normalizeFacultyDept(s.department) || s.department || 'CSE';
    return `
      <tr>
        <td><strong>${escapeHtml(s.name || 'Student')}</strong></td>
        <td><code>${escapeHtml(s.registerNumber || 'N/A')}</code></td>
        <td><span class="badge badge-submitted" style="font-weight: 700;">${escapeHtml(dispYear)}</span></td>
        <td><span style="font-size: 13px; color: #334155;">${escapeHtml(dispDept)}</span></td>
        <td><strong>${escapeHtml(s.projects.join(', '))}</strong></td>
        <td>${s.isLeader ? '<span class="badge badge-inprogress">Leader</span>' : '<span class="badge badge-draft">Member</span>'}</td>
        <td>
          <div style="font-size: 12px;">${escapeHtml(s.email || 'No email')}</div>
          <div style="font-size: 11px; color: #64748b;">${s.phone ? `📱 ${escapeHtml(s.phone)}` : ''}</div>
        </td>
      </tr>
    `;
  }).join('');
}

// --------------------------------------------------------------------------
// NOTIFICATIONS INBOX TAB
// --------------------------------------------------------------------------
async function renderFacultyNotificationInbox() {
  const container = document.getElementById('facultyNotifList');
  if (!container) return;

  try {
    const res = await apiRequest('/notifications');
    if (res.success) {
      if (!res.data || res.data.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; color: #94a3b8;">
            <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
            <h4 style="font-size: 16px; font-weight: 700; color: #334155; margin-bottom: 4px;">All Caught Up!</h4>
            <p style="font-size: 13px; color: #94a3b8;">You have no active notifications or pending student alerts.</p>
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
                ${!n.read ? '<span style="font-size: 10px; background: #059669; color: #ffffff; padding: 1px 6px; border-radius: 9999px; font-weight: 700;">NEW</span>' : ''}
              </div>
              <div style="font-size: 13px; color: #334155; line-height: 1.5;">${escapeHtml(n.message)}</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 6px; display: flex; align-items: center; gap: 12px;">
                <span>🕒 ${formatDate(n.createdAt)}</span>
                <span style="color: #059669; font-weight: 500;">✓ Email Dispatched</span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
              ${!n.read ? `<button class="btn btn-sm btn-secondary" onclick="markNotifRead('${notifId}'); renderFacultyNotificationInbox();" style="font-size: 12px; padding: 4px 10px;">Mark Read</button>` : ''}
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

window.renderFacultyNotificationInbox = renderFacultyNotificationInbox;

const facMarkAllRead = document.getElementById('btnFacultyMarkAllRead');
if (facMarkAllRead) {
  facMarkAllRead.addEventListener('click', async () => {
    await markAllNotificationsRead();
    renderFacultyNotificationInbox();
  });
}

const facClearAll = document.getElementById('btnFacultyClearAll');
if (facClearAll) {
  facClearAll.addEventListener('click', async () => {
    await clearAllNotifications();
    renderFacultyNotificationInbox();
  });
}

// --------------------------------------------------------------------------
// PROFILE & SETTINGS
// --------------------------------------------------------------------------
function setupProfileAndSettings() {
  const fName = document.getElementById('facProfName');
  const fId = document.getElementById('facProfId');
  const fEmail = document.getElementById('facProfEmail');
  const fDept = document.getElementById('facProfDept');
  const fDesig = document.getElementById('facProfDesignation');
  const fPhone = document.getElementById('facProfPhone');

  if (fName) fName.value = currentFaculty.name;
  if (fId) fId.value = currentFaculty.facultyId;
  if (fEmail) fEmail.value = currentFaculty.email;
  if (fDept) fDept.value = currentFaculty.department || '';
  if (fDesig) fDesig.value = currentFaculty.designation || '';
  if (fPhone) fPhone.value = currentFaculty.phone || '';

  const profForm = document.getElementById('facultyProfileForm');
  if (profForm) {
    profForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiRequest('/auth/profile', 'PUT', {
          department: fDept.value,
          phone: fPhone.value
        });
        showToast('Profile updated successfully!', 'success');
      } catch (err) {
        showToast('Failed to update profile', 'error');
      }
    });
  }

  // Load preferences
  loadFacultyPreferences();

  const settingsForm = document.getElementById('facultySettingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        email: document.getElementById('facPrefEmail') ? document.getElementById('facPrefEmail').checked : true,
        inApp: document.getElementById('facPrefInApp') ? document.getElementById('facPrefInApp').checked : true
      };

      try {
        await apiRequest('/notifications/preferences', 'PUT', payload);
        showToast('Faculty notification preferences saved!', 'success');
      } catch (err) {
        showToast('Failed to save preferences', 'error');
      }
    });
  }
}

async function loadFacultyPreferences() {
  try {
    const res = await apiRequest('/notifications/preferences');
    if (res.success && res.data) {
      const p = res.data;
      if (document.getElementById('facPrefEmail')) document.getElementById('facPrefEmail').checked = p.email !== false;
      if (document.getElementById('facPrefInApp')) document.getElementById('facPrefInApp').checked = p.inApp !== false;
    }
  } catch (e) {}
}

// --------------------------------------------------------------------------
// FACULTY STUDENT SUBMISSIONS & DOCUMENTS
// --------------------------------------------------------------------------
let facultyDocumentsList = [];

async function loadFacultyDocuments() {
  const container = document.getElementById('facultyDocumentsListContainer');
  if (!container) return;

  try {
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #64748b;">⏳ Loading student submissions...</div>';
    const res = await apiRequest('/documents/faculty');
    if (res.success && Array.isArray(res.data)) {
      facultyDocumentsList = res.data;
      renderFacultyDocuments();
    } else {
      facultyDocumentsList = [];
      renderFacultyDocuments();
    }
  } catch (err) {
    console.error('Failed to load faculty documents:', err);
    container.innerHTML = `<div style="text-align: center; padding: 30px; color: #ef4444;">Failed to load student submissions: ${escapeHtml(err.message)}</div>`;
  }
}

function renderFacultyDocuments() {
  const container = document.getElementById('facultyDocumentsListContainer');
  if (!container) return;

  const projFilter = document.getElementById('facultyDocProjectFilter')?.value || 'ALL';
  const catFilter = document.getElementById('facultyDocCategoryFilter')?.value || 'ALL';

  let filtered = facultyDocumentsList;
  if (projFilter !== 'ALL') {
    filtered = filtered.filter(d => String(d.projectId) === String(projFilter));
  }
  if (catFilter !== 'ALL') {
    filtered = filtered.filter(d => d.category === catFilter);
  }

  const badgeEl = document.getElementById('facultyDocsCountBadge');
  if (badgeEl) {
    badgeEl.textContent = `${filtered.length} file${filtered.length === 1 ? '' : 's'} available`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: #ffffff; border-radius: 12px; border: 1px dashed var(--border-color);">
        <div style="font-size: 36px; margin-bottom: 8px;">📂</div>
        <h4 style="font-size: 15px; color: #1e293b; margin-bottom: 4px;">No student submissions found</h4>
        <p style="color: var(--text-muted); font-size: 13px; max-width: 480px; margin: 0 auto;">
          When student teams under your mentorship upload research papers, PPT decks, synopsis, or project reports, they will appear here automatically for review and download.
        </p>
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
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px;">
      ${filtered.map(doc => {
        const cat = categoryBadges[doc.category] || categoryBadges['Other'];
        const uploadDate = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently';
        const fileSizeMB = doc.fileSize ? (doc.fileSize / (1024 * 1024)).toFixed(2) + ' MB' : (doc.fileSize ? (doc.fileSize / 1024).toFixed(1) + ' KB' : '');
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

              <h4 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0; word-break: break-word;">
                ${escapeHtml(doc.title || doc.originalName)}
              </h4>

              <div style="font-size: 12.5px; color: #0284c7; font-weight: 600; margin-bottom: 8px;">
                📌 <strong>Project:</strong> ${escapeHtml(doc.projectName || 'Project')} ${doc.projectDomain ? `&bull; ${escapeHtml(doc.projectDomain)}` : ''}
              </div>

              ${doc.description ? `
                <p style="font-size: 12.5px; color: #64748b; margin: 0 0 10px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                  ${escapeHtml(doc.description)}
                </p>
              ` : ''}

              <div style="font-size: 11.5px; color: #475569; background: #f8fafc; padding: 10px 12px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 14px; display: flex; flex-direction: column; gap: 4px;">
                ${doc.submissionType === 'Individual' ? `
                  <div>👤 <strong>Uploaded for:</strong> <span style="font-weight: 700; color: #7c3aed;">Individual (${escapeHtml(doc.individualMember?.name || doc.submissionScope || doc.uploadedBy?.name || 'Student')}${doc.individualMember?.registerNumber ? ` - ${doc.individualMember.registerNumber}` : ''})</span></div>
                ` : `
                  <div>👥 <strong>Uploaded for:</strong> <span style="font-weight: 700; color: #059669;">Entire Team (Team Deliverable)</span></div>
                `}
                <div>📤 <strong>Submitted By:</strong> ${escapeHtml(doc.uploadedBy?.name || 'Student')} ${doc.uploadedBy?.registerNumber ? `(${doc.uploadedBy.registerNumber})` : ''}</div>
                <div>📅 <strong>Submitted On:</strong> ${uploadDate} ${fileSizeMB ? `&bull; ${fileSizeMB}` : ''}</div>
                <div style="font-size: 11px; color: #94a3b8; word-break: break-all;">📎 ${escapeHtml(doc.originalName || doc.fileName)}</div>
              </div>
            </div>

            <div style="display: flex; gap: 8px; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 14px;">
              <a href="${doc.fileUrl}" target="_blank" class="btn btn-primary btn-sm" style="flex: 1; text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview
              </a>
              <a href="${doc.fileUrl}" download="${doc.originalName || doc.title}" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </a>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

window.openFacultyProjectDocuments = function(projectId) {
  switchTab('tabDocuments');
  const projSelect = document.getElementById('facultyDocProjectFilter');
  if (projSelect) {
    projSelect.value = projectId;
  }
  renderFacultyDocuments();
};

window.renderFacultyProjectCards = renderFacultyProjectCards;
window.renderFacultyProjectsTable = renderFacultyProjectsTable;
window.renderPendingEvaluations = renderPendingEvaluations;
window.renderCompletedEvaluations = renderCompletedEvaluations;
window.renderStudentsDirectory = renderStudentsDirectory;
window.renderFacultyDocuments = renderFacultyDocuments;
window.loadFacultyDocuments = loadFacultyDocuments;

// --------------------------------------------------------------------------
// MENTORSHIP MEETINGS & ATTENDANCE MANAGEMENT
// --------------------------------------------------------------------------
let facultyMeetingsList = [];

async function loadFacultyAttendance() {
  const tbody = document.getElementById('facultyAttendanceTableBody');
  if (!tbody) return;

  // Populate project filters and modal selects if needed
  const filterProj = document.getElementById('filterAttendanceProject');
  if (filterProj && filterProj.options.length <= 1 && assignedProjects.length > 0) {
    const currentVal = filterProj.value;
    filterProj.innerHTML = '<option value="ALL">All Mentored Projects</option>' +
      assignedProjects.map(p => `<option value="${p._id || p.id}">${escapeHtml(p.projectName)} (${p.year || '3rd Year'})</option>`).join('');
    if (currentVal) filterProj.value = currentVal;
  }

  const meetingProjSel = document.getElementById('meetingProjectSelect');
  if (meetingProjSel && meetingProjSel.options.length <= 1 && assignedProjects.length > 0) {
    meetingProjSel.innerHTML = '<option value="">-- Select Project --</option>' +
      assignedProjects.map(p => `<option value="${p._id || p.id}">${escapeHtml(p.projectName)} (${p.year || '3rd Year'} &bull; ${p.department || 'CSE'})</option>`).join('');
  }

  try {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #64748b;">⏳ Loading review meetings...</td></tr>';
    const res = await apiRequest('/attendance/faculty');
    if (res.success && Array.isArray(res.data)) {
      facultyMeetingsList = res.data;

      // Update Stat Cards
      const totalMeetings = facultyMeetingsList.length;
      let totalLogs = 0;
      let totalPresent = 0;
      facultyMeetingsList.forEach(m => {
        totalLogs += (m.totalStudents || (m.attendanceRecords || []).length);
        totalPresent += (m.presentCount || (m.attendanceRecords || []).filter(r => r.status === 'Present').length);
      });
      const avgPresence = totalLogs === 0 ? 0 : Math.round((totalPresent / totalLogs) * 100);

      const cardMeetings = document.getElementById('cardTotalMeetings');
      const cardLogs = document.getElementById('cardTotalAttendanceLogs');
      const cardAvg = document.getElementById('cardAvgAttendanceRate');
      if (cardMeetings) cardMeetings.textContent = totalMeetings;
      if (cardLogs) cardLogs.textContent = totalLogs;
      if (cardAvg) cardAvg.textContent = `${avgPresence}%`;

      renderFacultyAttendanceTable();
    } else {
      facultyMeetingsList = [];
      renderFacultyAttendanceTable();
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #ef4444;">Failed to load meetings: ${escapeHtml(err.message)}</td></tr>`;
  }
}

window.switchAttendanceSubView = function(view) {
  const btnLogs = document.getElementById('btnAttendanceViewLogs');
  const btnSummary = document.getElementById('btnAttendanceViewSummary');
  const viewLogs = document.getElementById('attendanceSubViewLogs');
  const viewSummary = document.getElementById('attendanceSubViewSummary');

  if (view === 'summary') {
    if (viewLogs) viewLogs.style.display = 'none';
    if (viewSummary) viewSummary.style.display = 'block';
    if (btnLogs) {
      btnLogs.className = 'btn btn-sm btn-outline-secondary';
    }
    if (btnSummary) {
      btnSummary.className = 'btn btn-sm btn-primary';
    }
  } else {
    if (viewLogs) viewLogs.style.display = 'block';
    if (viewSummary) viewSummary.style.display = 'none';
    if (btnLogs) {
      btnLogs.className = 'btn btn-sm btn-primary';
    }
    if (btnSummary) {
      btnSummary.className = 'btn btn-sm btn-outline-secondary';
    }
  }
};

function renderFacultyAttendanceTable() {
  const tbodyLogs = document.getElementById('facultyAttendanceTableBody');
  if (!tbodyLogs) return;

  const yearFilter = document.getElementById('filterAttendanceYear')?.value || 'ALL';
  const projFilter = document.getElementById('filterAttendanceProject')?.value || 'ALL';

  let filtered = facultyMeetingsList;

  if (yearFilter !== 'ALL' && yearFilter !== '') {
    filtered = filtered.filter(m => matchYear(getMeetingYear(m), yearFilter));
  }

  if (projFilter !== 'ALL' && projFilter !== '') {
    filtered = filtered.filter(m => String(m.projectId) === String(projFilter));
  }

  // Render Sub-view 1: Meeting Logs
  if (filtered.length === 0) {
    tbodyLogs.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #94a3b8;">No mentorship review meetings match the selected filter. Click <strong>"+ Log Review Meeting"</strong> to record one.</td></tr>';
  } else {
    tbodyLogs.innerHTML = filtered.map(m => {
      const meetId = m._id || m.id;
      const dateStr = formatDate(m.meetingDate);
      const records = m.attendanceRecords || [];
      const mYear = getMeetingYear(m);
      const mDept = getMeetingDept(m);
      const batchLabel = `<span class="badge badge-submitted" style="font-size: 10px; margin-left: 4px;">${escapeHtml(mYear)}</span>`;

      const attendancePills = records.map(r => {
        const isPresent = r.status === 'Present';
        return `
          <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 8px; border-radius: 9999px; font-weight: 600; background: ${isPresent ? '#ecfdf5' : '#fef2f2'}; color: ${isPresent ? '#065f46' : '#991b1b'}; border: 1px solid ${isPresent ? '#a7f3d0' : '#fecaca'}; margin: 2px;">
            <span>${isPresent ? '✓' : '✗'}</span> ${escapeHtml(r.studentName || 'Student')}
          </span>
        `;
      }).join(' ');

      return `
        <tr>
          <td><strong>${dateStr}</strong></td>
          <td>
            <strong>${escapeHtml(m.projectName || 'Project')}</strong>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${batchLabel} &bull; ${escapeHtml(mDept)}</div>
          </td>
          <td><span style="font-weight: 600; color: #0f172a;">${escapeHtml(m.topic)}</span></td>
          <td>
            <div style="display: flex; flex-wrap: wrap; gap: 2px;">
              ${attendancePills}
            </div>
          </td>
          <td><div style="font-size: 12px; color: #475569; max-width: 200px;">${escapeHtml(m.notes || '—')}</div></td>
          <td>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button class="btn btn-sm btn-outline-primary" onclick="openEditMeetingModal('${meetId}')" style="font-size: 11px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 3px;" title="Edit attendance & notes">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Edit
              </button>
              <button class="btn btn-sm btn-danger" onclick="deleteMeetingRecord('${meetId}', '${escapeHtml(m.topic)}')" style="font-size: 11px; padding: 3px 8px; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; display: inline-flex; align-items: center; gap: 3px;" title="Delete this meeting record">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Render Sub-view 2: Student Cumulative Summary
  renderFacultyAttendanceSummary(filtered);
}

function renderFacultyAttendanceSummary(filteredMeetings) {
  const tbodySummary = document.getElementById('facultyAttendanceSummaryTableBody');
  if (!tbodySummary) return;

  const studentStatsMap = {};

  // Aggregate across filtered meetings
  filteredMeetings.forEach(m => {
    const mYear = getMeetingYear(m);
    const mDept = getMeetingDept(m);

    (m.attendanceRecords || []).forEach(r => {
      const sId = String(r.studentId || r.registerNumber || r.studentName);
      const studentYr = r.year ? normalizeFacultyYear(r.year) : mYear;
      const studentDept = r.department ? normalizeFacultyDept(r.department) : mDept;

      if (!studentStatsMap[sId]) {
        studentStatsMap[sId] = {
          studentId: sId,
          studentName: r.studentName || 'Student',
          registerNumber: r.registerNumber || 'N/A',
          year: studentYr,
          department: studentDept,
          projectName: m.projectName || 'Project',
          projectDomain: m.projectDomain || '',
          totalMeetings: 0,
          presentCount: 0,
          absentCount: 0,
          percentage: 0
        };
      }
      studentStatsMap[sId].totalMeetings += 1;
      if (r.status === 'Present') {
        studentStatsMap[sId].presentCount += 1;
      } else {
        studentStatsMap[sId].absentCount += 1;
      }
    });
  });

  const studentsList = Object.values(studentStatsMap);

  if (studentsList.length === 0) {
    tbodySummary.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: #94a3b8;">No student attendance aggregated yet for this selection.</td></tr>';
    return;
  }

  // Sort by Year, then Project, then Name
  studentsList.sort((a, b) => (a.year || '').localeCompare(b.year || '') || a.projectName.localeCompare(b.projectName) || a.studentName.localeCompare(b.studentName));

  tbodySummary.innerHTML = studentsList.map(s => {
    const rate = s.totalMeetings === 0 ? 0 : Math.round((s.presentCount / s.totalMeetings) * 100);
    let statusBadge = '';
    if (rate >= 80) {
      statusBadge = '<span class="badge badge-approved" style="font-size: 11px;">✅ Excellent (>80%)</span>';
    } else if (rate >= 60) {
      statusBadge = '<span class="badge badge-submitted" style="font-size: 11px;">⚡ Moderate (60-79%)</span>';
    } else {
      statusBadge = '<span class="badge badge-draft" style="font-size: 11px; background: #fee2e2; color: #dc2626;">⚠️ Low (&lt;60%)</span>';
    }

    return `
      <tr>
        <td>
          <strong style="font-size: 13.5px; color: #0f172a;">${escapeHtml(s.studentName)}</strong>
          <div style="font-size: 11.5px; color: #64748b; font-family: monospace;">${escapeHtml(s.registerNumber)}</div>
        </td>
        <td>
          <span class="badge badge-submitted" style="font-weight: 700;">${escapeHtml(s.year)}</span>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${escapeHtml(s.department)}</div>
        </td>
        <td>
          <strong>${escapeHtml(s.projectName)}</strong>
          ${s.projectDomain ? `<div style="font-size: 11px; color: #64748b;">${escapeHtml(s.projectDomain)}</div>` : ''}
        </td>
        <td><strong style="font-size: 14px; color: #1e293b;">${s.totalMeetings}</strong></td>
        <td>
          <span style="display: inline-block; padding: 3px 10px; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 6px; font-weight: 700;">
            ${s.presentCount} Days
          </span>
        </td>
        <td>
          <span style="display: inline-block; padding: 3px 10px; background: ${s.absentCount > 0 ? '#fef2f2' : '#f8fafc'}; color: ${s.absentCount > 0 ? '#991b1b' : '#64748b'}; border: 1px solid ${s.absentCount > 0 ? '#fecaca' : '#e2e8f0'}; border-radius: 6px; font-weight: 700;">
            ${s.absentCount} Days
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="color: ${rate >= 75 ? '#059669' : (rate >= 60 ? '#d97706' : '#dc2626')}; font-size: 13.5px;">${rate}%</strong>
          </div>
          <div class="progress-container" style="height: 6px; margin-top: 4px; max-width: 80px; background: #e2e8f0;">
            <div class="progress-bar-fill" style="width: ${rate}%; background: ${rate >= 75 ? '#10b981' : (rate >= 60 ? '#f59e0b' : '#ef4444')};"></div>
          </div>
        </td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

window.exportAttendancePDF = function() {
  const yearFilter = document.getElementById('filterAttendanceYear')?.value || 'ALL';
  const projFilter = document.getElementById('filterAttendanceProject')?.value || 'ALL';

  let filtered = facultyMeetingsList;
  if (yearFilter !== 'ALL' && yearFilter !== '') {
    filtered = filtered.filter(m => matchYear(getMeetingYear(m), yearFilter));
  }
  if (projFilter !== 'ALL' && projFilter !== '') {
    filtered = filtered.filter(m => String(m.projectId) === String(projFilter));
  }

  if (filtered.length === 0) {
    showToast('No attendance records to export for the selected filter.', 'warning');
    return;
  }

  // Aggregate student stats
  const studentStatsMap = {};
  let totalStudentLogs = 0;
  let totalPresentLogs = 0;

  filtered.forEach(m => {
    const mYear = getMeetingYear(m);
    const mDept = getMeetingDept(m);

    (m.attendanceRecords || []).forEach(r => {
      totalStudentLogs++;
      if (r.status === 'Present') totalPresentLogs++;

      const sId = String(r.studentId || r.registerNumber || r.studentName);
      const studentYr = r.year ? normalizeFacultyYear(r.year) : mYear;
      const studentDept = r.department ? normalizeFacultyDept(r.department) : mDept;

      if (!studentStatsMap[sId]) {
        studentStatsMap[sId] = {
          studentName: r.studentName || 'Student',
          registerNumber: r.registerNumber || 'N/A',
          year: studentYr,
          department: studentDept,
          projectName: m.projectName || 'Project',
          totalMeetings: 0,
          presentCount: 0,
          absentCount: 0
        };
      }
      studentStatsMap[sId].totalMeetings++;
      if (r.status === 'Present') {
        studentStatsMap[sId].presentCount++;
      } else {
        studentStatsMap[sId].absentCount++;
      }
    });
  });

  const studentsList = Object.values(studentStatsMap);
  studentsList.sort((a, b) => (a.year || '').localeCompare(b.year || '') || a.projectName.localeCompare(b.projectName) || a.studentName.localeCompare(b.studentName));

  const facultyName = currentFaculty?.name || 'Faculty Guide';
  const facultyIdStr = currentFaculty?.facultyId || '';
  const facultyDept = currentFaculty?.department || 'Computer Science & Engineering';
  const nowStr = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
  const overallRate = totalStudentLogs === 0 ? 0 : Math.round((totalPresentLogs / totalStudentLogs) * 100);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to download or print the PDF Report.');
    return;
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Mentorship_Attendance_Report_${facultyName.replace(/\\s+/g, '_')}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 12mm; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { color: #0f172a; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; }
    .inst-title { font-size: 18px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin: 0; }
    .inst-sub { font-size: 12px; color: #475569; margin: 2px 0 0 0; font-weight: 600; }
    .report-badge { display: inline-block; background: #eff6ff; color: #1d4ed8; padding: 4px 14px; border-radius: 9999px; font-weight: 700; font-size: 13px; margin-top: 8px; border: 1px solid #bfdbfe; }
    
    .meta-box { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; }
    .meta-item { font-size: 11.5px; }
    .meta-item strong { color: #334155; }

    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .stat-card { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center; }
    .stat-num { font-size: 18px; font-weight: 800; color: #0f172a; }
    .stat-lbl { font-size: 10.5px; color: #64748b; font-weight: 600; text-transform: uppercase; }

    h3.section-title { font-size: 13px; font-weight: 700; color: #1e293b; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px; margin: 20px 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
    th { background: #f8fafc; color: #334155; font-weight: 700; border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    
    .pill-present { color: #065f46; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px; }
    .pill-absent { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px; }

    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; padding-top: 10px; page-break-inside: avoid; }
    .sig-line { border-top: 1px dashed #64748b; padding-top: 6px; font-size: 11.5px; font-weight: 600; text-align: center; }

    @media print {
      body { padding: 0; }
      .no-print { display: none; }
      th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; background: #e0f2fe; padding: 10px 16px; border-radius: 6px; border: 1px solid #bae6fd;">
    <span style="font-weight: 600; color: #0369a1;">📄 PDF Print Preview Ready — Use browser destination "Save as PDF" to download.</span>
    <button onclick="window.print()" style="background: #0284c7; color: #fff; font-weight: 700; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer;">🖨️ Print / Save as PDF</button>
  </div>

  <div class="header">
    <div class="inst-title">RGM College of Engineering and Technology (Autonomous)</div>
    <div class="inst-sub">Department of Computer Science & Engineering &bull; Project Mentorship Cell</div>
    <div class="report-badge">Official Guide Attendance &amp; Mentorship Log Report</div>
  </div>

  <div class="meta-box">
    <div class="meta-item"><strong>Faculty Guide:</strong> ${escapeHtml(facultyName)} ${facultyIdStr ? `(${escapeHtml(facultyIdStr)})` : ''}</div>
    <div class="meta-item"><strong>Department:</strong> ${escapeHtml(facultyDept)}</div>
    <div class="meta-item"><strong>Academic Batch Filter:</strong> ${escapeHtml(yearFilter === 'ALL' ? 'All Batches (1st to 4th Year)' : yearFilter)}</div>
    <div class="meta-item"><strong>Generated On:</strong> ${nowStr}</div>
  </div>

  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-num">${filtered.length}</div>
      <div class="stat-lbl">Review Meetings</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${studentsList.length}</div>
      <div class="stat-lbl">Mentored Students</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${totalStudentLogs}</div>
      <div class="stat-lbl">Total Attendances</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color: ${overallRate >= 75 ? '#059669' : '#dc2626'};">${overallRate}%</div>
      <div class="stat-lbl">Overall Presence Rate</div>
    </div>
  </div>

  <h3 class="section-title">Section 1: Student Cumulative Attendance &amp; Presence Summary</h3>
  <table>
    <thead>
      <tr>
        <th style="width: 25px;">#</th>
        <th>Student Name</th>
        <th>Reg Number</th>
        <th>Academic Batch</th>
        <th>Project Title</th>
        <th style="text-align: center;">Total Reviews</th>
        <th style="text-align: center;">Present</th>
        <th style="text-align: center;">Absent</th>
        <th style="text-align: center;">Attendance %</th>
      </tr>
    </thead>
    <tbody>
      ${studentsList.map((s, idx) => {
        const rate = s.totalMeetings === 0 ? 0 : Math.round((s.presentCount / s.totalMeetings) * 100);
        return `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${escapeHtml(s.studentName)}</strong></td>
            <td><code>${escapeHtml(s.registerNumber)}</code></td>
            <td>${escapeHtml(s.year)} &bull; ${escapeHtml(s.department)}</td>
            <td>${escapeHtml(s.projectName)}</td>
            <td style="text-align: center; font-weight: 700;">${s.totalMeetings}</td>
            <td style="text-align: center; color: #065f46; font-weight: 700;">${s.presentCount}</td>
            <td style="text-align: center; color: ${s.absentCount > 0 ? '#991b1b' : '#64748b'}; font-weight: 700;">${s.absentCount}</td>
            <td style="text-align: center; font-weight: 800; color: ${rate >= 75 ? '#059669' : '#dc2626'};">${rate}%</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <h3 class="section-title">Section 2: Date-wise Mentorship Review Meetings &amp; Discussion Logs</h3>
  <table>
    <thead>
      <tr>
        <th style="width: 80px;">Meeting Date</th>
        <th style="width: 140px;">Project &amp; Batch</th>
        <th>Discussion / Review Topic</th>
        <th>Present Students</th>
        <th>Absent Students</th>
        <th style="width: 130px;">Guide Notes</th>
      </tr>
    </thead>
    <tbody>
      ${filtered.map(m => {
        const dStr = formatDate(m.meetingDate);
        const records = m.attendanceRecords || [];
        const presentNames = records.filter(r => r.status === 'Present').map(r => r.studentName).join(', ') || 'None';
        const absentNames = records.filter(r => r.status === 'Absent').map(r => r.studentName).join(', ') || 'None';
        const mYear = getMeetingYear(m);
        const mDept = getMeetingDept(m);
        return `
          <tr>
            <td><strong>${dStr}</strong></td>
            <td><strong>${escapeHtml(m.projectName)}</strong><br><small style="color: #64748b;">${escapeHtml(mYear)} &bull; ${escapeHtml(mDept)}</small></td>
            <td><strong>${escapeHtml(m.topic)}</strong></td>
            <td><span class="pill-present">${escapeHtml(presentNames)}</span></td>
            <td><span class="${absentNames === 'None' ? '' : 'pill-absent'}">${escapeHtml(absentNames)}</span></td>
            <td><small>${escapeHtml(m.notes || '—')}</small></td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="signature-grid">
    <div>
      <div class="sig-line">Faculty Guide Signature<br><small>(${escapeHtml(facultyName)})</small></div>
    </div>
    <div>
      <div class="sig-line">Head of Department / Project Coordinator Signature<br><small>(Department of CSE)</small></div>
    </div>
  </div>

  <script>
    window.onload = function() {
      // Small timeout to allow styles to render
      setTimeout(() => {
        window.print();
      }, 400);
    };
  <\/script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
};

window.exportAttendanceExcel = function() {
  const yearFilter = document.getElementById('filterAttendanceYear')?.value || 'ALL';
  const projFilter = document.getElementById('filterAttendanceProject')?.value || 'ALL';

  let filtered = facultyMeetingsList;
  if (yearFilter !== 'ALL' && yearFilter !== '') {
    filtered = filtered.filter(m => matchYear(getMeetingYear(m), yearFilter));
  }
  if (projFilter !== 'ALL' && projFilter !== '') {
    filtered = filtered.filter(m => String(m.projectId) === String(projFilter));
  }

  if (filtered.length === 0) {
    showToast('No attendance records to export for the selected filter.', 'warning');
    return;
  }

  // Aggregate student stats
  const studentStatsMap = {};
  filtered.forEach(m => {
    const mYear = getMeetingYear(m);
    const mDept = getMeetingDept(m);

    (m.attendanceRecords || []).forEach(r => {
      const sId = String(r.studentId || r.registerNumber || r.studentName);
      const studentYr = r.year ? normalizeFacultyYear(r.year) : mYear;
      const studentDept = r.department ? normalizeFacultyDept(r.department) : mDept;

      if (!studentStatsMap[sId]) {
        studentStatsMap[sId] = {
          studentName: r.studentName || 'Student',
          registerNumber: r.registerNumber || 'N/A',
          year: studentYr,
          department: studentDept,
          projectName: m.projectName || 'Project',
          projectDomain: m.projectDomain || '',
          totalMeetings: 0,
          presentCount: 0,
          absentCount: 0
        };
      }
      studentStatsMap[sId].totalMeetings++;
      if (r.status === 'Present') {
        studentStatsMap[sId].presentCount++;
      } else {
        studentStatsMap[sId].absentCount++;
      }
    });
  });

  const studentsList = Object.values(studentStatsMap);
  studentsList.sort((a, b) => (a.year || '').localeCompare(b.year || '') || a.projectName.localeCompare(b.projectName) || a.studentName.localeCompare(b.studentName));

  const facultyName = currentFaculty?.name || 'Faculty Guide';
  const exportDate = new Date().toISOString().split('T')[0];

  function csvEscape(val) {
    const s = String(val == null ? '' : val).replace(/"/g, '""');
    return `"${s}"`;
  }

  let csvRows = [];

  // Header metadata
  csvRows.push([csvEscape('RGMCET - MENTORSHIP REVIEW & GUIDE ATTENDANCE REPORT')]);
  csvRows.push([csvEscape('Faculty Guide:'), csvEscape(facultyName), csvEscape('Export Date:'), csvEscape(exportDate)]);
  csvRows.push([csvEscape('Academic Batch Filter:'), csvEscape(yearFilter), csvEscape('Project Filter:'), csvEscape(projFilter === 'ALL' ? 'All Mentored Projects' : projFilter)]);
  csvRows.push([]);

  // Section 1: Student Cumulative Summary
  csvRows.push([csvEscape('SECTION 1: STUDENT CUMULATIVE ATTENDANCE SUMMARY (TOTAL PRESENT & ABSENT)')]);
  csvRows.push([
    csvEscape('S.No'),
    csvEscape('Student Name'),
    csvEscape('Register Number'),
    csvEscape('Academic Batch / Year'),
    csvEscape('Department'),
    csvEscape('Project Title'),
    csvEscape('Project Domain'),
    csvEscape('Total Review Sessions'),
    csvEscape('Days Present'),
    csvEscape('Days Absent'),
    csvEscape('Attendance Percentage (%)'),
    csvEscape('Mentorship Status')
  ]);

  studentsList.forEach((s, idx) => {
    const rate = s.totalMeetings === 0 ? 0 : Math.round((s.presentCount / s.totalMeetings) * 100);
    const status = rate >= 80 ? 'Excellent' : (rate >= 60 ? 'Moderate' : 'Low / Follow-up Required');
    csvRows.push([
      csvEscape(idx + 1),
      csvEscape(s.studentName),
      csvEscape(s.registerNumber),
      csvEscape(s.year),
      csvEscape(s.department),
      csvEscape(s.projectName),
      csvEscape(s.projectDomain),
      csvEscape(s.totalMeetings),
      csvEscape(s.presentCount),
      csvEscape(s.absentCount),
      csvEscape(`${rate}%`),
      csvEscape(status)
    ]);
  });

  csvRows.push([]);
  csvRows.push([]);

  // Section 2: Date-wise meeting logs
  csvRows.push([csvEscape('SECTION 2: DATE-WISE MENTORSHIP MEETING LOGS')]);
  csvRows.push([
    csvEscape('S.No'),
    csvEscape('Meeting Date'),
    csvEscape('Academic Batch'),
    csvEscape('Department'),
    csvEscape('Project Title'),
    csvEscape('Discussion / Review Topic'),
    csvEscape('Total Students'),
    csvEscape('Present Count'),
    csvEscape('Absent Count'),
    csvEscape('Present Students List'),
    csvEscape('Absent Students List'),
    csvEscape('Guide Notes')
  ]);

  filtered.forEach((m, idx) => {
    const records = m.attendanceRecords || [];
    const presentList = records.filter(r => r.status === 'Present').map(r => `${r.studentName} (${r.registerNumber || 'N/A'})`).join('; ');
    const absentList = records.filter(r => r.status === 'Absent').map(r => `${r.studentName} (${r.registerNumber || 'N/A'})`).join('; ');
    const mYear = getMeetingYear(m);
    const mDept = getMeetingDept(m);

    csvRows.push([
      csvEscape(idx + 1),
      csvEscape(formatDate(m.meetingDate)),
      csvEscape(mYear),
      csvEscape(mDept),
      csvEscape(m.projectName || 'Project'),
      csvEscape(m.topic || ''),
      csvEscape(records.length),
      csvEscape(records.filter(r => r.status === 'Present').length),
      csvEscape(records.filter(r => r.status === 'Absent').length),
      csvEscape(presentList || 'None'),
      csvEscape(absentList || 'None'),
      csvEscape(m.notes || '')
    ]);
  });

  const csvString = '\uFEFF' + csvRows.map(row => row.join(',')).join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const filename = `Mentorship_Attendance_Report_${exportDate}.csv`;

  if (navigator.msSaveBlob) {
    navigator.msSaveBlob(blob, filename);
  } else {
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  showToast('Attendance report exported to Excel (CSV) successfully!', 'success');
};

window.openLogMeetingModal = function(projectId) {
  const modal = document.getElementById('logMeetingModal');
  if (!modal) return;

  const editingInput = document.getElementById('editingMeetingId');
  if (editingInput) editingInput.value = '';

  const titleEl = document.getElementById('logMeetingModalTitle');
  if (titleEl) titleEl.textContent = 'Log Mentorship Review Meeting';

  const submitBtn = document.getElementById('btnSubmitMeetingLog');
  if (submitBtn) submitBtn.textContent = 'Save Meeting Attendance';

  const projSelect = document.getElementById('meetingProjectSelect');
  if (projSelect) {
    projSelect.disabled = false;
    projSelect.value = projectId || '';
  }
  const dateInput = document.getElementById('meetingDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  document.getElementById('meetingTopic').value = '';
  document.getElementById('meetingNotes').value = '';

  populateMeetingStudentCheckboxes(projSelect ? projSelect.value : '', []);
  modal.classList.add('active');
};

window.openEditMeetingModal = function(meetingId) {
  const modal = document.getElementById('logMeetingModal');
  if (!modal) return;

  const m = facultyMeetingsList.find(x => String(x._id || x.id) === String(meetingId));
  if (!m) {
    showToast('Meeting record not found.', 'error');
    return;
  }

  const editingInput = document.getElementById('editingMeetingId');
  if (editingInput) editingInput.value = String(meetingId);

  const titleEl = document.getElementById('logMeetingModalTitle');
  if (titleEl) titleEl.textContent = 'Edit Mentorship Review Meeting & Attendance';

  const submitBtn = document.getElementById('btnSubmitMeetingLog');
  if (submitBtn) submitBtn.textContent = 'Update Meeting Attendance';

  const projSelect = document.getElementById('meetingProjectSelect');
  if (projSelect) {
    projSelect.value = m.projectId || '';
    projSelect.disabled = false;
  }

  const dateInput = document.getElementById('meetingDate');
  if (dateInput) {
    dateInput.value = m.meetingDate ? m.meetingDate.split('T')[0] : new Date().toISOString().split('T')[0];
  }

  document.getElementById('meetingTopic').value = m.topic || '';
  document.getElementById('meetingNotes').value = m.notes || '';

  populateMeetingStudentCheckboxes(m.projectId || (projSelect ? projSelect.value : ''), m.attendanceRecords || []);
  modal.classList.add('active');
};

window.populateMeetingStudentCheckboxes = function(projectId, existingAttendanceRecords = []) {
  const container = document.getElementById('meetingStudentCheckboxesContainer');
  if (!container) return;

  if (!projectId) {
    container.innerHTML = '<p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Select a project above to load team members.</p>';
    return;
  }

  const p = assignedProjects.find(item => String(item._id || item.id) === String(projectId));
  if (!p || !Array.isArray(p.teamMemberIds) || p.teamMemberIds.length === 0) {
    container.innerHTML = '<p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">No team members found for this project.</p>';
    return;
  }

  // Create a fast lookup map from existing attendance records
  const statusMap = {};
  (existingAttendanceRecords || []).forEach(r => {
    if (r.studentId) statusMap[String(r.studentId)] = r.status;
    if (r.registerNumber) statusMap[String(r.registerNumber).toUpperCase()] = r.status;
    if (r.studentName) statusMap[String(r.studentName).trim().toLowerCase()] = r.status;
  });

  container.innerHTML = p.teamMemberIds.map((m, idx) => {
    const sId = String(m._id || m.id);
    const sReg = String(m.registerNumber || '').toUpperCase();
    const sName = String(m.name || '').trim().toLowerCase();

    const previousStatus = statusMap[sId] || (sReg ? statusMap[sReg] : null) || (sName ? statusMap[sName] : null) || 'Present';
    const isPresent = previousStatus === 'Present';

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; background: #ffffff; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11px; font-weight: 700; color: #2563eb; background: #eff6ff; padding: 2px 6px; border-radius: 4px;">#${idx + 1}</span>
          <div>
            <strong style="font-size: 13.5px; color: #0f172a;">${escapeHtml(m.name)}</strong>
            <span style="font-size: 12px; color: #64748b; margin-left: 4px;">(${escapeHtml(m.registerNumber || 'N/A')})</span>
          </div>
        </div>
        <div style="display: flex; gap: 14px; align-items: center;">
          <label style="display: flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: #059669; cursor: pointer; padding: 4px 8px; border-radius: 6px; background: ${isPresent ? '#ecfdf5' : 'transparent'};">
            <input type="radio" name="att_status_${sId}" value="Present" ${isPresent ? 'checked' : ''} data-student-id="${sId}" data-name="${escapeHtml(m.name)}" data-reg="${escapeHtml(m.registerNumber || '')}"> ✓ Present
          </label>
          <label style="display: flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: #dc2626; cursor: pointer; padding: 4px 8px; border-radius: 6px; background: ${!isPresent ? '#fef2f2' : 'transparent'};">
            <input type="radio" name="att_status_${sId}" value="Absent" ${!isPresent ? 'checked' : ''} data-student-id="${sId}" data-name="${escapeHtml(m.name)}" data-reg="${escapeHtml(m.registerNumber || '')}"> ✗ Absent
          </label>
        </div>
      </div>
    `;
  }).join('');
};

window.handleLogMeetingSubmit = async function(e) {
  e.preventDefault();
  const editingId = (document.getElementById('editingMeetingId')?.value || '').trim();
  const projectId = document.getElementById('meetingProjectSelect').value;
  const meetingDate = document.getElementById('meetingDate').value;
  const topic = document.getElementById('meetingTopic').value.trim();
  const notes = document.getElementById('meetingNotes').value.trim();
  const submitBtn = document.getElementById('btnSubmitMeetingLog');

  if (!projectId) {
    showToast('Please select a project.', 'warning');
    return;
  }

  const p = assignedProjects.find(item => String(item._id || item.id) === String(projectId));
  if (!p) {
    showToast('Project details not found.', 'error');
    return;
  }

  const attendanceRecords = (p.teamMemberIds || []).map(m => {
    const sId = String(m._id || m.id);
    const selectedRadio = document.querySelector(`input[name="att_status_${sId}"]:checked`);
    const status = selectedRadio ? selectedRadio.value : 'Present';
    return {
      studentId: sId,
      studentName: m.name,
      registerNumber: m.registerNumber || '',
      status
    };
  });

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = editingId ? 'Updating...' : 'Saving...';

    const method = editingId ? 'PUT' : 'POST';
    const endpoint = editingId ? `/attendance/${editingId}` : '/attendance';

    const res = await apiRequest(endpoint, method, {
      projectId,
      meetingDate,
      topic,
      notes,
      attendanceRecords
    });

    if (res.success) {
      showToast(editingId ? 'Mentorship meeting and attendance updated successfully!' : 'Mentorship meeting attendance recorded successfully!', 'success');
      document.getElementById('logMeetingModal').classList.remove('active');
      document.getElementById('logMeetingForm').reset();
      if (document.getElementById('editingMeetingId')) document.getElementById('editingMeetingId').value = '';
      await loadFacultyAttendance();
    }
  } catch (err) {
    showToast(err.message || 'Failed to save meeting record.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Update Meeting Attendance' : 'Save Meeting Attendance';
  }
};

window.deleteMeetingRecord = async function(id, topic) {
  if (!confirm(`Are you sure you want to delete the meeting record "${topic}"?`)) return;

  try {
    const res = await apiRequest(`/attendance/${id}`, 'DELETE');
    if (res.success) {
      showToast('Meeting record deleted successfully.', 'success');
      await loadFacultyAttendance();
    }
  } catch (err) {
    showToast(err.message || 'Failed to delete meeting record.', 'error');
  }
};

window.loadFacultyAttendance = loadFacultyAttendance;
window.renderFacultyAttendanceTable = renderFacultyAttendanceTable;
window.openEditMeetingModal = openEditMeetingModal;

// ==========================================================================
// OFFICIAL PROJECT & INDIVIDUAL MARKS SHEET PDF GENERATION
// ==========================================================================
function getGradeDetails(marks) {
  const m = Number(marks) || 0;
  if (m >= 90) return { grade: 'O', label: 'Outstanding (Grade O)', badge: 'O (>=90)', color: '#059669', bg: '#ecfdf5' };
  if (m >= 80) return { grade: 'A+', label: 'Excellent (Grade A+)', badge: 'A+ (80-89)', color: '#0284c7', bg: '#f0f9ff' };
  if (m >= 70) return { grade: 'A', label: 'Very Good (Grade A)', badge: 'A (70-79)', color: '#4f46e5', bg: '#eef2ff' };
  if (m >= 60) return { grade: 'B+', label: 'Good (Grade B+)', badge: 'B+ (60-69)', color: '#0891b2', bg: '#ecfeff' };
  if (m >= 50) return { grade: 'B', label: 'Above Average (Grade B)', badge: 'B (50-59)', color: '#d97706', bg: '#fffbeb' };
  if (m >= 40) return { grade: 'C', label: 'Pass (Grade C)', badge: 'C (40-49)', color: '#ea580c', bg: '#fff7ed' };
  return { grade: 'F', label: 'Re-evaluation Required (Grade F)', badge: 'F (<40)', color: '#dc2626', bg: '#fef2f2' };
}

window.exportProjectMarksPDF = async function(projectId) {
  let project = assignedProjects.find(item => item._id === projectId || item.id === projectId);
  if (!project) {
    try {
      const res = await apiRequest(`/projects/${projectId}`);
      if (res.success && res.data) project = res.data;
    } catch (e) {}
  }

  if (!project) {
    showToast('Project details not found.', 'error');
    return;
  }

  // Load project evaluation, individual student evaluations, and attendance statistics
  let evalDoc = project.evaluation || null;
  let individualList = [];
  let attendanceStats = {};

  try {
    const [evalRes, indRes, attRes] = await Promise.all([
      apiRequest(`/evaluations/${projectId}`).catch(() => ({ success: false })),
      apiRequest(`/evaluations/individual/${projectId}`).catch(() => ({ success: false })),
      apiRequest(`/attendance/project/${projectId}`).catch(() => ({ success: false }))
    ]);

    if (evalRes.success && evalRes.data) evalDoc = evalRes.data;
    if (indRes.success && Array.isArray(indRes.data)) individualList = indRes.data;
    if (attRes.success && attRes.studentStats) attendanceStats = attRes.studentStats;
  } catch (e) {
    console.warn('Error loading marks details for PDF:', e.message);
  }

  // Fallback to currently filled inputs in evaluation modal if not saved yet
  if (!evalDoc) {
    const activeModalId = document.getElementById('evalProjectId')?.value;
    if (activeModalId === projectId) {
      const { pw, imp, doc, pres, tp, total } = calculateRubricTotal();
      const feedback = document.getElementById('evalOverallFeedback')?.value.trim() || '';
      evalDoc = {
        projectWork: pw,
        implementation: imp,
        documentation: doc,
        presentation: pres,
        teamParticipation: tp,
        totalMarks: total,
        feedback,
        evaluatedAt: new Date().toISOString()
      };
    }
  }

  const pw = evalDoc ? Number(evalDoc.projectWork || 0) : 0;
  const imp = evalDoc ? Number(evalDoc.implementation || 0) : 0;
  const doc = evalDoc ? Number(evalDoc.documentation || 0) : 0;
  const pres = evalDoc ? Number(evalDoc.presentation || 0) : 0;
  const tp = evalDoc ? Number(evalDoc.teamParticipation || 0) : 0;
  const totalScore = evalDoc ? Number(evalDoc.totalMarks || (pw + imp + doc + pres + tp)) : 0;
  const overallFeedback = evalDoc?.feedback || 'Satisfactory project execution and technical deliverable submission.';
  const evalDateStr = evalDoc?.evaluatedAt ? new Date(evalDoc.evaluatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN');
  const projectGrade = getGradeDetails(totalScore);

  const facultyName = currentFaculty?.name || 'Faculty Guide';
  const facultyIdStr = currentFaculty?.facultyId || 'FAC-GUIDE';
  const facultyDept = project.department || currentFaculty?.department || 'Computer Science & Engineering';
  const facultyDesig = currentFaculty?.designation || 'Assistant Professor / Project Guide';
  const academicYear = project.year || '3rd Year';
  const leaderName = project.teamLeaderId?.name || (project.teamMemberIds?.[0]?.name) || 'Team Leader';
  const leaderReg = project.teamLeaderId?.registerNumber || (project.teamMemberIds?.[0]?.registerNumber) || 'N/A';

  // Map individual student members
  const rawMembers = Array.isArray(project.teamMemberIds) ? project.teamMemberIds : (Array.isArray(project.teamMembers) ? project.teamMembers : []);
  const studentRows = rawMembers.map((m, idx) => {
    const sId = String(m._id || m.id);
    const indItem = individualList.find(x => String(x.studentId?._id || x.studentId?.id || x.studentId) === sId);
    
    // Check if modal has active input
    let marks = indItem ? indItem.marks : totalScore;
    let personalFeedback = indItem?.feedback || '';

    const modalInput = document.querySelector(`.ind-student-mark[data-student="${sId}"]`);
    if (modalInput) marks = parseInt(modalInput.value, 10) || marks;
    const modalFb = document.querySelector(`.ind-student-feedback[data-student="${sId}"]`);
    if (modalFb && modalFb.value.trim()) personalFeedback = modalFb.value.trim();

    const isLeader = Boolean(m.isLeader || idx === 0 || String(m._id || m.id) === String(project.teamLeaderId?._id || project.teamLeaderId?.id || project.teamLeaderId));
    const gradeInfo = getGradeDetails(marks);
    const attInfo = attendanceStats[sId] || { totalMeetings: 0, presentCount: 0, percentage: 0 };
    const attDisplay = attInfo.totalMeetings > 0 ? `${attInfo.presentCount}/${attInfo.totalMeetings} (${attInfo.percentage}%)` : '100% (Regular)';

    return {
      sNo: idx + 1,
      name: m.name || 'Student Member',
      registerNumber: m.registerNumber || 'N/A',
      department: m.department || facultyDept,
      year: m.year || academicYear,
      isLeader,
      role: isLeader ? 'Team Leader' : 'Team Member',
      projectMarks: totalScore,
      individualMarks: marks,
      grade: gradeInfo.grade,
      gradeLabel: gradeInfo.label,
      attendance: attDisplay,
      feedback: personalFeedback || (isLeader ? 'Led project coordination, architecture design, and technical integration.' : 'Actively contributed to module development, testing, and documentation.')
    };
  });

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to generate or print the official Marks Sheet PDF.');
    return;
  }

  const htmlDoc = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Official_Project_Marks_Sheet_${project.projectName.replace(/\\s+/g, '_')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 12mm 12mm 12mm;
    }
    * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }
    body {
      color: #0f172a;
      margin: 0;
      padding: 20px;
      font-size: 11.5px;
      line-height: 1.4;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .no-print-toolbar {
      position: sticky;
      top: 0;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 20px;
      margin: -20px -20px 20px -20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .btn-action {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .btn-action:hover {
      background: #1d4ed8;
    }
    .btn-secondary-action {
      background: #475569;
      color: #ffffff;
      border: none;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
    }
    @media print {
      .no-print-toolbar { display: none !important; }
      body { padding: 0 !important; }
      @page { margin: 10mm 10mm; }
    }
    
    .inst-header {
      text-align: center;
      border-bottom: 2.5px solid #1e3a8a;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .inst-title {
      font-size: 16.5px;
      font-weight: 900;
      color: #1e3a8a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 2px 0;
    }
    .inst-sub {
      font-size: 10.5px;
      font-weight: 600;
      color: #475569;
      margin: 0 0 2px 0;
    }
    .inst-dept {
      font-size: 13px;
      font-weight: 800;
      color: #0369a1;
      text-transform: uppercase;
      margin: 4px 0 0 0;
    }
    .sheet-title-badge {
      display: inline-block;
      background: #eff6ff;
      color: #1e40af;
      border: 1.5px solid #bfdbfe;
      padding: 4px 16px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      margin-top: 8px;
      letter-spacing: 0.5px;
    }

    .meta-box {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 11px;
    }
    .meta-box td {
      padding: 5.5px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    .meta-lbl {
      width: 20%;
      font-weight: 700;
      color: #334155;
      background: #f1f5f9;
    }
    .meta-val {
      width: 30%;
      color: #0f172a;
    }

    .section-title {
      font-size: 11.5px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      background: #e2e8f0;
      padding: 5px 8px;
      border-radius: 4px;
      margin: 14px 0 6px 0;
      letter-spacing: 0.4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 10.5px;
    }
    .data-table th {
      background: #1e3a8a;
      color: #ffffff;
      font-weight: 700;
      padding: 6px 8px;
      border: 1px solid #1e3a8a;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
    }
    .data-table td {
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
    }
    .data-table tr:nth-child(even) td {
      background: #f8fafc;
    }

    .badge-role-leader {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 9.5px;
      text-transform: uppercase;
    }
    .badge-role-member {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 9.5px;
    }

    .grade-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 800;
      font-size: 11px;
      text-align: center;
    }

    .feedback-callout {
      background: #fafafa;
      border-left: 3px solid #0284c7;
      border-top: 1px solid #e2e8f0;
      border-right: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 7px 12px;
      margin: 6px 0 12px 0;
      font-size: 11px;
      color: #334155;
    }

    .sig-section {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      margin-top: 36px;
      padding-top: 10px;
      page-break-inside: avoid;
    }
    .sig-box {
      border-top: 1.5px solid #0f172a;
      text-align: center;
      padding-top: 6px;
      font-size: 10.5px;
    }
    .sig-name {
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 1px;
    }
    .sig-sub {
      font-size: 9.5px;
      color: #64748b;
    }
  </style>
</head>
<body>

  <!-- No-Print Top Controls -->
  <div class="no-print-toolbar">
    <div style="font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px;">
      <span>📑 RGMCET Project Milestone &amp; Marks Supervision Portal</span>
      <span style="font-size: 11px; font-weight: 500; opacity: 0.8;">(Official Evaluation PDF)</span>
    </div>
    <div style="display: flex; gap: 10px;">
      <button class="btn-action" onclick="window.print()">
        🖨️ Print / Save as PDF
      </button>
      <button class="btn-secondary-action" onclick="window.close()">
        ✖ Close
      </button>
    </div>
  </div>

  <!-- Institution Header -->
  <div class="inst-header">
    <h1 class="inst-title">Rajeev Gandhi Memorial College of Engineering &amp; Technology</h1>
    <p class="inst-sub">(AUTONOMOUS — Approved by AICTE, Accredited by NAAC with 'A+' Grade &amp; NBA Tier-1)</p>
    <p class="inst-sub">Affiliated to JNTUA, Ananthapuramu &bull; Nandyal - 518501, Andhra Pradesh</p>
    <div class="inst-dept">Department of ${escapeHtml(facultyDept)}</div>
    <div>
      <span class="sheet-title-badge">Official Project &amp; Individual Student Marks Award Sheet</span>
    </div>
  </div>

  <!-- Project Overview Metadata Table -->
  <table class="meta-box">
    <tr>
      <td class="meta-lbl">Project Title:</td>
      <td class="meta-val" colspan="3"><strong style="font-size: 12px; color: #1e3a8a;">${escapeHtml(project.projectName)}</strong></td>
    </tr>
    <tr>
      <td class="meta-lbl">Domain / Specialization:</td>
      <td class="meta-val">${escapeHtml(project.domain || 'Core / Applied Engineering')}</td>
      <td class="meta-lbl">Academic Batch &amp; Year:</td>
      <td class="meta-val"><strong>${escapeHtml(academicYear)}</strong> (${escapeHtml(facultyDept)})</td>
    </tr>
    <tr>
      <td class="meta-lbl">Team Leader:</td>
      <td class="meta-val">${escapeHtml(leaderName)} <span style="color: #64748b;">(${escapeHtml(leaderReg)})</span></td>
      <td class="meta-lbl">Total Team Strength:</td>
      <td class="meta-val"><strong>${studentRows.length} Student Member(s)</strong></td>
    </tr>
    <tr>
      <td class="meta-lbl">Faculty Guide / Evaluator:</td>
      <td class="meta-val"><strong>${escapeHtml(facultyName)}</strong> <span style="font-size: 10px; color: #64748b;">(${escapeHtml(facultyIdStr)})</span></td>
      <td class="meta-lbl">Guide Designation:</td>
      <td class="meta-val">${escapeHtml(facultyDesig)}</td>
    </tr>
    <tr>
      <td class="meta-lbl">Evaluation Date:</td>
      <td class="meta-val">${evalDateStr}</td>
      <td class="meta-lbl">Overall Project Score:</td>
      <td class="meta-val">
        <strong style="font-size: 13px; color: ${projectGrade.color};">${totalScore} / 100</strong>
        <span class="grade-badge" style="background: ${projectGrade.bg}; color: ${projectGrade.color}; margin-left: 6px;">${projectGrade.badge}</span>
      </td>
    </tr>
  </table>

  <!-- Section 1: Standard Evaluation Rubric Breakdown (100 Marks Max) -->
  <div class="section-title">
    <span>A. Project Rubric Evaluation Breakdown (Total: 100 Marks Max)</span>
    <span style="font-size: 11px; font-weight: 700; color: #1e40af;">Awarded: ${totalScore} / 100</span>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 8%;">S.No</th>
        <th style="width: 54%;">Evaluation Criteria &amp; Deliverables Scope</th>
        <th style="width: 18%; text-align: center;">Max Marks</th>
        <th style="width: 20%; text-align: center;">Marks Awarded</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="text-align: center;">1</td>
        <td><strong>Project Scope, Problem Definition &amp; Methodology</strong> (Requirements, literature survey, baseline architecture)</td>
        <td style="text-align: center;">30</td>
        <td style="text-align: center;"><strong>${pw} / 30</strong></td>
      </tr>
      <tr>
        <td style="text-align: center;">2</td>
        <td><strong>System Implementation, Code Quality &amp; Prototype</strong> (Algorithm design, modular code, technical depth)</td>
        <td style="text-align: center;">25</td>
        <td style="text-align: center;"><strong>${imp} / 25</strong></td>
      </tr>
      <tr>
        <td style="text-align: center;">3</td>
        <td><strong>Documentation, Report &amp; Project Deliverables</strong> (SRS, UML diagrams, test cases, synopsis report)</td>
        <td style="text-align: center;">15</td>
        <td style="text-align: center;"><strong>${doc} / 15</strong></td>
      </tr>
      <tr>
        <td style="text-align: center;">4</td>
        <td><strong>Presentation, Demo &amp; Technical Viva-Voce</strong> (Demo quality, technical question answering, clarity)</td>
        <td style="text-align: center;">20</td>
        <td style="text-align: center;"><strong>${pres} / 20</strong></td>
      </tr>
      <tr>
        <td style="text-align: center;">5</td>
        <td><strong>Team Coordination, Sprint Deadlines &amp; Participation</strong> (Milestone adherence, collaboration)</td>
        <td style="text-align: center;">10</td>
        <td style="text-align: center;"><strong>${tp} / 10</strong></td>
      </tr>
      <tr style="background: #eff6ff; font-weight: 800;">
        <td colspan="2" style="text-align: right; padding-right: 14px; text-transform: uppercase;">Total Evaluated Project Marks:</td>
        <td style="text-align: center;">100</td>
        <td style="text-align: center; color: #1e40af; font-size: 12px;">${totalScore} / 100</td>
      </tr>
    </tbody>
  </table>

  <div class="feedback-callout">
    <strong>Faculty Mentor General Remarks:</strong> ${escapeHtml(overallFeedback)}
  </div>

  <!-- Section 2: Individual Student Allocated Marks & Assessment (Table) -->
  <div class="section-title">
    <span>B. Individual Student Allocated Marks &amp; Assessment Sheet (${studentRows.length} Students)</span>
    <span style="font-size: 10px; font-weight: 600; color: #475569;">Evaluated by Guide</span>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 5%; text-align: center;">#</th>
        <th style="width: 14%;">Reg. Number</th>
        <th style="width: 20%;">Student Full Name</th>
        <th style="width: 12%; text-align: center;">Role</th>
        <th style="width: 12%; text-align: center;">Marks (100)</th>
        <th style="width: 10%; text-align: center;">Grade</th>
        <th style="width: 12%; text-align: center;">Attendance</th>
        <th style="width: 15%;">Guide Feedback / Viva Note</th>
      </tr>
    </thead>
    <tbody>
      ${studentRows.map(s => {
        const grade = getGradeDetails(s.individualMarks);
        return `
          <tr>
            <td style="text-align: center; font-weight: 700;">${s.sNo}</td>
            <td><strong>${escapeHtml(s.registerNumber)}</strong></td>
            <td>${escapeHtml(s.name)}</td>
            <td style="text-align: center;">
              <span class="${s.isLeader ? 'badge-role-leader' : 'badge-role-member'}">${s.role}</span>
            </td>
            <td style="text-align: center; font-weight: 800; font-size: 12px; color: ${grade.color};">
              ${s.individualMarks} / 100
            </td>
            <td style="text-align: center;">
              <span class="grade-badge" style="background: ${grade.bg}; color: ${grade.color};">${grade.grade}</span>
            </td>
            <td style="text-align: center; font-size: 10px; color: #475569;">
              ${escapeHtml(s.attendance)}
            </td>
            <td style="font-size: 10px; color: #334155;">
              ${escapeHtml(s.feedback)}
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <!-- Signatures Section -->
  <div class="sig-section">
    <div class="sig-box">
      <div style="height: 36px;"></div>
      <div class="sig-name">Prof. ${escapeHtml(facultyName)}</div>
      <div class="sig-sub">Faculty Guide / Mentor &bull; ${escapeHtml(facultyIdStr)}</div>
      <div class="sig-sub">${escapeHtml(facultyDept)}</div>
    </div>
    <div class="sig-box">
      <div style="height: 36px;"></div>
      <div class="sig-name">Project Coordinator</div>
      <div class="sig-sub">Department Project Committee</div>
      <div class="sig-sub">${escapeHtml(facultyDept)}</div>
    </div>
    <div class="sig-box">
      <div style="height: 36px;"></div>
      <div class="sig-name">Head of the Department (HOD)</div>
      <div class="sig-sub">Dept. of ${escapeHtml(facultyDept)}</div>
      <div class="sig-sub">[ OFFICIAL DEPARTMENT SEAL ]</div>
    </div>
  </div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        window.print();
      }, 500);
    });
  <\/script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlDoc);
  printWindow.document.close();
};

window.exportCurrentProjectMarksPDF = function() {
  const projectId = document.getElementById('evalProjectId')?.value;
  if (!projectId) {
    showToast('Please select an active project to export marks sheet.', 'warning');
    return;
  }
  exportProjectMarksPDF(projectId);
};

window.exportAllCompletedMarksPDF = async function() {
  const completed = assignedProjects.filter(p => p.isEvaluated && p.evaluation);
  if (completed.length === 0) {
    showToast('No completed project evaluations found to export.', 'warning');
    return;
  }

  const facultyName = currentFaculty?.name || 'Faculty Guide';
  const facultyDept = currentFaculty?.department || 'Computer Science & Engineering';
  const facultyIdStr = currentFaculty?.facultyId || 'FACULTY';
  const nowStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // Gather individual marks for all completed projects
  const consolidatedProjects = await Promise.all(
    completed.map(async (p, idx) => {
      let indList = [];
      try {
        const indRes = await apiRequest(`/evaluations/individual/${p._id || p.id}`);
        if (indRes.success && Array.isArray(indRes.data)) indList = indRes.data;
      } catch (e) {}

      const rawMembers = Array.isArray(p.teamMemberIds) ? p.teamMemberIds : [];
      const students = rawMembers.map((m, mIdx) => {
        const sId = String(m._id || m.id);
        const item = indList.find(x => String(x.studentId?._id || x.studentId?.id || x.studentId) === sId);
        const marks = item ? item.marks : (p.evaluation.totalMarks || 0);
        return {
          name: m.name,
          registerNumber: m.registerNumber,
          isLeader: mIdx === 0 || m.isLeader,
          marks,
          grade: getGradeDetails(marks).grade
        };
      });

      return {
        seq: idx + 1,
        projectName: p.projectName,
        domain: p.domain || 'Engineering',
        year: p.year || '3rd Year',
        department: p.department || facultyDept,
        totalMarks: p.evaluation.totalMarks || 0,
        grade: getGradeDetails(p.evaluation.totalMarks || 0).grade,
        students
      };
    })
  );

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to download the Master Marks PDF.');
    return;
  }

  const htmlDoc = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Master_Project_Marks_Report_${facultyName.replace(/\\s+/g, '_')}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 10mm; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { color: #0f172a; margin: 0; padding: 16px; font-size: 11px; line-height: 1.35; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { position: sticky; top: 0; background: #0f172a; color: #fff; padding: 10px 16px; margin: -16px -16px 16px -16px; display: flex; justify-content: space-between; align-items: center; }
    .btn-print { background: #2563eb; color: #fff; border: none; padding: 6px 16px; font-weight: 700; border-radius: 4px; cursor: pointer; }
    @media print { .no-print { display: none !important; } body { padding: 0 !important; } }
    .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 12px; }
    .inst-title { font-size: 16px; font-weight: 900; color: #1e3a8a; text-transform: uppercase; margin: 0; }
    .inst-sub { font-size: 10.5px; color: #475569; margin: 2px 0 0 0; }
    .table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10.5px; }
    .table th { background: #1e3a8a; color: #fff; padding: 6px 8px; border: 1px solid #1e3a8a; text-align: left; }
    .table td { padding: 5px 8px; border: 1px solid #cbd5e1; vertical-align: top; }
    .table tr:nth-child(even) td { background: #f8fafc; }
    .sig-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 40px; page-break-inside: avoid; }
    .sig-col { border-top: 1.5px solid #0f172a; text-align: center; padding-top: 6px; font-size: 10.5px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="no-print">
    <span style="font-weight: 700;">Consolidated Faculty Marks Master Sheet</span>
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>
  <div class="header">
    <h1 class="inst-title">Rajeev Gandhi Memorial College of Engineering &amp; Technology</h1>
    <p class="inst-sub">Autonomous &bull; Department of ${escapeHtml(facultyDept)}</p>
    <div style="font-weight: 800; color: #0284c7; font-size: 12px; margin-top: 4px; text-transform: uppercase;">
      Consolidated Project &amp; Student Marks Master Award Sheet (${consolidatedProjects.length} Projects Evaluated)
    </div>
    <p style="font-size: 10px; color: #64748b; margin-top: 2px;">Faculty Mentor: <strong>Prof. ${escapeHtml(facultyName)} (${escapeHtml(facultyIdStr)})</strong> &bull; Generated Date: ${nowStr}</p>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th style="width: 4%; text-align: center;">#</th>
        <th style="width: 25%;">Project Title &amp; Domain</th>
        <th style="width: 10%; text-align: center;">Batch</th>
        <th style="width: 10%; text-align: center;">Project Score</th>
        <th style="width: 51%;">Individual Student Allocated Marks &amp; Grades</th>
      </tr>
    </thead>
    <tbody>
      ${consolidatedProjects.map(p => `
        <tr>
          <td style="text-align: center; font-weight: 700;">${p.seq}</td>
          <td><strong>${escapeHtml(p.projectName)}</strong><div style="font-size: 9.5px; color: #64748b;">${escapeHtml(p.domain)}</div></td>
          <td style="text-align: center;">${escapeHtml(p.year)}</td>
          <td style="text-align: center; font-weight: 800; color: #1e40af;">${p.totalMarks}/100 (${p.grade})</td>
          <td>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px;">
              ${p.students.map(s => `
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 6px; font-size: 10px;">
                  <div style="font-weight: 600; color: #0f172a;">${escapeHtml(s.name)} ${s.isLeader ? '<span style="color: #2563eb; font-size: 9px;">[Leader]</span>' : ''}</div>
                  <div style="color: #64748b; font-size: 9px;">${escapeHtml(s.registerNumber)} &bull; <strong style="color: #059669;">${s.marks}/100 (${s.grade})</strong></div>
                </div>
              `).join('')}
            </div>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="sig-row">
    <div class="sig-col">
      Prof. ${escapeHtml(facultyName)}<br><span style="font-weight: 400; font-size: 9.5px; color: #64748b;">Faculty Guide / Mentor</span>
    </div>
    <div class="sig-col">
      Project Coordinator<br><span style="font-weight: 400; font-size: 9.5px; color: #64748b;">Department of ${escapeHtml(facultyDept)}</span>
    </div>
    <div class="sig-col">
      Head of Department (HOD)<br><span style="font-weight: 400; font-size: 9.5px; color: #64748b;">Dept. of ${escapeHtml(facultyDept)}</span>
    </div>
  </div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => { window.print(); }, 500);
    });
  <\/script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlDoc);
  printWindow.document.close();
};



