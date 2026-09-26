/**
 * Universal API Client & Utility Library
 * Personal Project Milestone Tracker
 */

const API_BASE = '/api';

// Toast Notification Manager
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
  };

  toast.innerHTML = `
    <span style="display: inline-flex; align-items: center; justify-content: center;">${iconMap[type] || ''}</span>
    <div style="flex: 1;">${message}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Token & Session Helpers
function getToken() {
  return localStorage.getItem('token');
}

function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function getUser() {
  const user = localStorage.getItem('user');
  try {
    return user ? JSON.parse(user) : null;
  } catch (e) {
    return null;
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/index.html';
}

// Universal fetch wrapper
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();

    if (response.status === 401) {
      // Token expired or invalid
      console.warn('Session expired or unauthorized.');
      if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
        logout();
      }
    }

    if (!response.ok) {
      throw new Error(data.message || 'API request failed');
    }

    return data;
  } catch (err) {
    console.error(`[API Error] ${method} ${endpoint}:`, err);
    throw err;
  }
}

// Multipart File Upload Helper
async function apiUpload(endpoint, formData) {
  const headers = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await response.json();

    if (response.status === 401) {
      if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
        logout();
      }
    }

    if (!response.ok) {
      throw new Error(data.message || 'File upload failed');
    }

    return data;
  } catch (err) {
    console.error(`[Upload Error] POST ${endpoint}:`, err);
    throw err;
  }
}


// Route Guard
function checkAuth(requiredRole) {
  const token = getToken();
  const user = getUser();

  if (!token || !user) {
    window.location.href = '/index.html';
    return false;
  }

  if (requiredRole && user.role !== requiredRole) {
    showToast(`Access Denied: Requires ${requiredRole} credentials.`, 'error');
    if (user.role === 'student') window.location.href = '/student/';
    else if (user.role === 'faculty') window.location.href = '/faculty/';
    else if (user.role === 'admin') window.location.href = '/admin/';
    else window.location.href = '/index.html';
    return false;
  }

  // Populate common user elements if they exist
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  const userAvatarEl = document.getElementById('userAvatar');

  if (userNameEl) userNameEl.textContent = user.name;
  if (userRoleEl) userRoleEl.textContent = user.role.toUpperCase();
  if (userAvatarEl) {
    const initials = user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    userAvatarEl.textContent = initials || 'U';
  }

  return true;
}

// Format Date Utility
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return 'N/A';
  }
}

// Global HTML Escape Utility
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Setup In-App Notification Bell
function setupNotificationBell() {
  const bellBtn = document.getElementById('notifBellBtn');
  const bellBadge = document.getElementById('notifBadge');
  const dropdown = document.getElementById('notifDropdown');
  const list = document.getElementById('notifList');
  const markAllBtn = document.getElementById('markAllReadBtn');
  const clearAllBtn = document.getElementById('clearAllNotifBtn');

  if (!bellBtn || !dropdown) return;

  // Toggle dropdown
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
    loadNotifications();
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== bellBtn) {
      dropdown.classList.remove('active');
    }
  });

  if (markAllBtn) {
    markAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await markAllNotificationsRead();
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await clearAllNotifications();
    });
  }

  async function loadNotifications() {
    try {
      const res = await apiRequest('/notifications');
      if (res.success) {
        if (bellBadge) {
          bellBadge.textContent = res.unreadCount;
          bellBadge.style.display = res.unreadCount > 0 ? 'flex' : 'none';
        }

        if (list) {
          if (!res.data || res.data.length === 0) {
            list.innerHTML = '<div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 13px;">No notifications. All clear! 🎉</div>';
            return;
          }

          list.innerHTML = res.data.map(n => {
            const notifId = n.id || n._id;
            return `
              <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${notifId}')" style="cursor: pointer; position: relative;">
                <div class="notif-item-title" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                  <span style="font-weight: 600; color: #0f172a;">${escapeHtml(n.title)}</span>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 10px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 600; white-space: nowrap; display: inline-flex; align-items: center; gap: 3px;">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                      Email + In-App
                    </span>
                    <button type="button" onclick="deleteSingleNotif('${notifId}', event)" title="Clear notification" style="background: transparent; border: none; color: #94a3b8; font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: all 0.15s ease;" onmouseover="this.style.color='#ef4444'; this.style.backgroundColor='#fee2e2';" onmouseout="this.style.color='#94a3b8'; this.style.backgroundColor='transparent';">&times;</button>
                  </div>
                </div>
                <div class="notif-item-msg" style="margin: 4px 0 6px; font-size: 12.5px; color: #475569;">${escapeHtml(n.message)}</div>
                <div class="notif-item-time" style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #94a3b8;">
                  <span>${formatDate(n.createdAt)}</span>
                  <span style="color: #059669; font-weight: 500;">✓ Dispatched to Email</span>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    } catch (e) {
      console.warn('Could not fetch notifications:', e);
    }
  }

  window.refreshNotifications = loadNotifications;

  // Initial load & poll every 30s
  loadNotifications();
  setInterval(loadNotifications, 30000);
}

async function markNotifRead(id) {
  try {
    await apiRequest(`/notifications/${id}/read`, 'PUT');
    if (window.refreshNotifications) window.refreshNotifications();
    if (typeof renderNotificationInbox === 'function') renderNotificationInbox();
    if (typeof renderFacultyNotificationInbox === 'function') renderFacultyNotificationInbox();
  } catch (e) {
    console.warn('Error marking notification read:', e);
  }
}

async function markAllNotificationsRead() {
  try {
    await apiRequest('/notifications/read-all', 'PUT');
    if (window.refreshNotifications) window.refreshNotifications();
    if (typeof renderNotificationInbox === 'function') renderNotificationInbox();
    if (typeof renderFacultyNotificationInbox === 'function') renderFacultyNotificationInbox();
    showToast('All notifications marked as read', 'success');
  } catch (err) {
    showToast('Failed to mark read', 'error');
  }
}

async function clearAllNotifications() {
  try {
    try {
      await apiRequest('/notifications/clear-all', 'DELETE');
    } catch (delErr) {
      await apiRequest('/notifications/clear-all', 'POST');
    }
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.textContent = '0';
      badge.style.display = 'none';
    }
    const list = document.getElementById('notifList');
    if (list) {
      list.innerHTML = '<div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 13px;">No notifications. All clear! 🎉</div>';
    }
    if (window.refreshNotifications) window.refreshNotifications();
    if (typeof renderNotificationInbox === 'function') renderNotificationInbox();
    if (typeof renderFacultyNotificationInbox === 'function') renderFacultyNotificationInbox();
    showToast('All notifications cleared', 'success');
  } catch (err) {
    console.error('Clear all error:', err);
    showToast('Failed to clear notifications', 'error');
  }
}

async function deleteSingleNotif(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  try {
    await apiRequest(`/notifications/${id}`, 'DELETE');
    if (window.refreshNotifications) window.refreshNotifications();
    if (typeof renderNotificationInbox === 'function') renderNotificationInbox();
    if (typeof renderFacultyNotificationInbox === 'function') renderFacultyNotificationInbox();
    showToast('Notification cleared', 'success');
  } catch (err) {
    showToast('Failed to clear notification', 'error');
  }
}

window.markNotifRead = markNotifRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.clearAllNotifications = clearAllNotifications;
window.deleteSingleNotif = deleteSingleNotif;
