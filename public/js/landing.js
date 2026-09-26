/**
 * Landing Page Controller
 * Modals and Authentication Triggers
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // ENTRANCE SPLASH SCREEN ANIMATION CONTROLLER
  // ==========================================
  const introSplash = document.getElementById('rgm-intro-splash');
  const btnSkipIntro = document.getElementById('btnSkipIntro');
  const btnReplayIntro = document.getElementById('btnReplayIntro');
  const introProgressBar = document.getElementById('introProgressBar');
  const introPercentText = document.getElementById('introPercentText');
  const introStatusText = document.getElementById('introStatusText');
  const introParticles = document.getElementById('introParticles');

  // Spawn floating cosmic particles
  if (introParticles) {
    introParticles.innerHTML = '';
    const particleCount = 26;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.className = 'intro-particle';
      const size = Math.random() * 4 + 2;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${Math.random() * 4 + 3.5}s`;
      p.style.animationDelay = `${Math.random() * 3}s`;
      const colors = ['#fbbf24', '#38bdf8', '#818cf8', '#ffffff'];
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      introParticles.appendChild(p);
    }
  }

  let introCompleted = false;
  let introInterval = null;

  function dismissIntro() {
    if (introCompleted) return;
    introCompleted = true;
    if (introInterval) clearInterval(introInterval);

    if (introSplash) {
      introSplash.classList.add('closing');
      setTimeout(() => {
        introSplash.style.display = 'none';
        document.body.classList.add('page-entered');
      }, 700);
    } else {
      document.body.classList.add('page-entered');
    }
  }

  function startIntroAnimation() {
    introCompleted = false;
    if (introSplash) {
      introSplash.style.display = 'flex';
      introSplash.classList.remove('closing');
      document.body.classList.remove('page-entered');
    }

    let progress = 0;
    const durationMs = 2500; // ~2.5 seconds premium entrance animation
    const intervalMs = 25;
    const step = 100 / (durationMs / intervalMs);

    if (introProgressBar) introProgressBar.style.width = '0%';
    if (introPercentText) introPercentText.textContent = '0%';
    if (introStatusText) introStatusText.textContent = '⚡ Initializing Academic Engine...';

    if (introInterval) clearInterval(introInterval);

    introInterval = setInterval(() => {
      progress += step;
      if (progress >= 100) {
        progress = 100;
        clearInterval(introInterval);
        if (introProgressBar) introProgressBar.style.width = '100%';
        if (introPercentText) introPercentText.textContent = '100%';
        if (introStatusText) introStatusText.textContent = '✨ Welcome to RGMCET Project Tracker!';
        setTimeout(dismissIntro, 400);
        return;
      }

      const rounded = Math.floor(progress);
      if (introProgressBar) introProgressBar.style.width = `${progress}%`;
      if (introPercentText) introPercentText.textContent = `${rounded}%`;

      if (progress > 80) {
        if (introStatusText) introStatusText.textContent = '🚀 Launching Academic Workspace...';
      } else if (progress > 50) {
        if (introStatusText) introStatusText.textContent = '🔥 Synchronizing Milestone Tracker Engine...';
      } else if (progress > 25) {
        if (introStatusText) introStatusText.textContent = '🏛️ Verifying RGMCET Autonomous Policies...';
      }
    }, intervalMs);
  }

  // Start immediately upon page entrance
  startIntroAnimation();

  // Skip buttons
  if (btnSkipIntro) {
    btnSkipIntro.addEventListener('click', dismissIntro);
  }

  // Replay button
  if (btnReplayIntro) {
    btnReplayIntro.addEventListener('click', (e) => {
      e.preventDefault();
      startIntroAnimation();
    });
  }

  // Key navigation for quick skip
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Escape' || e.key === 'Enter') && !introCompleted) {
      dismissIntro();
    }
  });

  // Modal elements
  const studentLoginModal = document.getElementById('studentLoginModal');
  const studentRegisterModal = document.getElementById('studentRegisterModal');
  const facultyLoginModal = document.getElementById('facultyLoginModal');
  const adminLoginModal = document.getElementById('adminLoginModal');

  // Trigger buttons
  const btnOpenStudentLogin = document.getElementById('btnOpenStudentLogin');
  const heroStudentBtn = document.getElementById('heroStudentBtn');
  const btnOpenStudentRegister = document.getElementById('btnOpenStudentRegister');
  const btnOpenFacultyLogin = document.getElementById('btnOpenFacultyLogin');
  const heroFacultyBtn = document.getElementById('heroFacultyBtn');
  const btnOpenAdminLogin = document.getElementById('btnOpenAdminLogin');
  const heroAdminBtn = document.getElementById('heroAdminBtn');

  // Helper to open modal
  function openModal(modal) {
    if (modal) modal.classList.add('active');
  }

  // Helper to close modal
  function closeModal(modal) {
    if (modal) modal.classList.remove('active');
  }

  // Bind close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      closeModal(modal);
    });
  });

  // Close when clicking outside container
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay);
      }
    });
  });

  // Open modals
  if (btnOpenStudentLogin) btnOpenStudentLogin.addEventListener('click', () => openModal(studentLoginModal));
  if (heroStudentBtn) heroStudentBtn.addEventListener('click', () => openModal(studentLoginModal));

  if (btnOpenStudentRegister) btnOpenStudentRegister.addEventListener('click', () => openModal(studentRegisterModal));

  if (btnOpenFacultyLogin) btnOpenFacultyLogin.addEventListener('click', () => openModal(facultyLoginModal));
  if (heroFacultyBtn) heroFacultyBtn.addEventListener('click', () => openModal(facultyLoginModal));

  if (btnOpenAdminLogin) btnOpenAdminLogin.addEventListener('click', () => openModal(adminLoginModal));
  if (heroAdminBtn) heroAdminBtn.addEventListener('click', () => openModal(adminLoginModal));

  // ==========================================
  // STUDENT LOGIN FORM
  const getRedirectDestination = (defaultPath) => {
    const redirect = sessionStorage.getItem('authRedirect');
    if (redirect) {
      sessionStorage.removeItem('authRedirect');
      return redirect;
    }
    return defaultPath;
  };

  // ==========================================
  // STUDENT LOGIN FORM
  // ==========================================
  const studentLoginForm = document.getElementById('studentLoginForm');
  if (studentLoginForm) {
    studentLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('studentIdentifier').value;
      const password = document.getElementById('studentPassword').value;
      const submitBtn = document.getElementById('studentLoginSubmitBtn');

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying...';

        const res = await apiRequest('/auth/student/login', 'POST', { identifier, password });
        if (res.success) {
          setSession(res.token, res.user);
          showToast('Student Login Successful! Redirecting...', 'success');
          setTimeout(() => {
            window.location.href = getRedirectDestination('/student/');
          }, 800);
        }
      } catch (err) {
        showToast(err.message || 'Login failed', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });
  }

  // ==========================================
  // STUDENT REGISTRATION FORM
  // ==========================================
  const studentRegisterForm = document.getElementById('studentRegisterForm');
  if (studentRegisterForm) {
    studentRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regName').value;
      const registerNumber = document.getElementById('regNumber').value;
      const email = document.getElementById('regEmail').value;
      const phone = document.getElementById('regPhone').value;
      const department = document.getElementById('regDept').value;
      const year = document.getElementById('regYear').value;
      const password = document.getElementById('regPassword').value;
      const confirmPassword = document.getElementById('regConfirmPassword').value;
      const submitBtn = document.getElementById('studentRegisterSubmitBtn');

      if (password !== confirmPassword) {
        showToast('Passwords do not match!', 'error');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account...';

        const payload = {
          name,
          registerNumber,
          email,
          phone,
          department,
          year,
          password,
          confirmPassword
        };

        const res = await apiRequest('/auth/student/register', 'POST', payload);
        if (res.success) {
          setSession(res.token, res.user);
          showToast('Registration successful! Welcome to Project Tracker.', 'success');
          setTimeout(() => {
            window.location.href = getRedirectDestination('/student/');
          }, 800);
        }
      } catch (err) {
        showToast(err.message || 'Registration failed', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Student Account';
      }
    });
  }

  // ==========================================
  // FACULTY LOGIN FORM
  // ==========================================
  const facultyLoginForm = document.getElementById('facultyLoginForm');
  if (facultyLoginForm) {
    facultyLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('facultyIdentifier').value;
      const password = document.getElementById('facultyPassword').value;
      const submitBtn = document.getElementById('facultyLoginSubmitBtn');

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying...';

        const res = await apiRequest('/auth/faculty/login', 'POST', { identifier, password });
        if (res.success) {
          setSession(res.token, res.user);
          showToast('Faculty Login Successful! Redirecting...', 'success');
          setTimeout(() => {
            window.location.href = getRedirectDestination('/faculty/');
          }, 800);
        }
      } catch (err) {
        showToast(err.message || 'Faculty login failed', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Faculty Sign In';
      }
    });
  }

  // ==========================================
  // ADMIN LOGIN FORM
  // ==========================================
  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('adminEmail').value;
      const password = document.getElementById('adminPassword').value;
      const submitBtn = document.getElementById('adminLoginSubmitBtn');

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying...';

        const res = await apiRequest('/auth/admin/login', 'POST', { email, password });
        if (res.success) {
          setSession(res.token, res.user);
          showToast('Admin Login Successful! Redirecting...', 'success');
          setTimeout(() => {
            window.location.href = getRedirectDestination('/admin/');
          }, 800);
        }
      } catch (err) {
        showToast(err.message || 'Admin login failed', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Admin Sign In';
      }
    });
  }
});
