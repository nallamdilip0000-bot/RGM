const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Faculty, Projects, Evaluations, Milestones, Tasks } = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { recalculateProgress } = require('../services/progressService');

// ==========================================
// 1. GET ALL FACULTY (Dynamic list for dropdowns - Firebase)
// ==========================================
router.get('/', async (req, res) => {
  try {
    const faculties = await Faculty.listActive();
    const cleanList = faculties.map(f => ({
      _id: f.id,
      id: f.id,
      facultyId: f.facultyId,
      name: f.name,
      email: f.email,
      department: f.department,
      designation: f.designation,
      phone: f.phone
    })).sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: cleanList
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve faculty list.', error: err.message });
  }
});

// ==========================================
// 2. GET ALL FACULTY (ADMIN VIEW)
// ==========================================
router.get('/admin/all', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const faculties = await Faculty.listAll();
    const clean = faculties.map(({ password, ...rest }) => rest);
    res.json({
      success: true,
      data: clean
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve faculty directory.', error: err.message });
  }
});

// ==========================================
// 3. ADD NEW FACULTY (Admin only)
// ==========================================
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { facultyId, name, email, password, department, designation, phone } = req.body;

    if (!facultyId || !name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Faculty ID, Name, Email, and Password are required.'
      });
    }

    const cleanFacultyId = facultyId.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    // Check unique facultyId
    const existingId = await Faculty.findByFacultyId(cleanFacultyId);
    if (existingId) {
      return res.status(400).json({ success: false, message: `Faculty ID "${cleanFacultyId}" already exists.` });
    }

    // Check unique email
    const existingEmail = await Faculty.findByEmail(cleanEmail);
    if (existingEmail) {
      return res.status(400).json({ success: false, message: `Faculty email "${cleanEmail}" already exists.` });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newFaculty = await Faculty.create({
      facultyId: cleanFacultyId,
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      department: department || 'Computer Science & Engineering',
      designation: designation || 'Assistant Professor',
      phone: phone ? phone.trim() : '',
      role: 'faculty',
      isActive: true,
      notificationPreferences: { email: true, inApp: true }
    });

    res.status(201).json({
      success: true,
      message: 'Faculty account created successfully in Firebase.',
      data: {
        id: newFaculty.id,
        _id: newFaculty.id,
        facultyId: newFaculty.facultyId,
        name: newFaculty.name,
        email: newFaculty.email,
        department: newFaculty.department,
        designation: newFaculty.designation,
        phone: newFaculty.phone
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create faculty account.', error: err.message });
  }
});

// ==========================================
// 4. GET SINGLE FACULTY BY ID
// ==========================================
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ success: false, message: 'Faculty not found.' });
    }
    const { password, ...clean } = faculty;
    res.json({ success: true, data: clean });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching faculty details.' });
  }
});

// ==========================================
// 5. UPDATE FACULTY (Admin only)
// ==========================================
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, department, designation, phone, isActive } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (department) updates.department = department.trim();
    if (designation) updates.designation = designation.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const updated = await Faculty.update(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Faculty member not found.' });
    }

    res.json({
      success: true,
      message: 'Faculty updated successfully.',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update faculty.', error: err.message });
  }
});

// ==========================================
// 6. RESET FACULTY PASSWORD (Admin only)
// ==========================================
router.put('/:id/reset-password', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await Faculty.update(req.params.id, { password: hashedPassword });

    res.json({
      success: true,
      message: 'Password reset successfully for faculty member.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to reset faculty password.', error: err.message });
  }
});

// ==========================================
// 7. DELETE FACULTY (Admin only)
// ==========================================
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const assignedCount = await Projects.count(p => String(p.facultyId?.id || p.facultyId) === String(req.params.id));
    if (assignedCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete faculty with ${assignedCount} assigned project(s). You can disable the account instead.`
      });
    }

    await Faculty.delete(req.params.id);
    res.json({ success: true, message: 'Faculty member deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete faculty.', error: err.message });
  }
});

// ==========================================
// 8. FACULTY DASHBOARD: GET ASSIGNED PROJECTS
// ==========================================
router.get('/projects/assigned', verifyToken, requireRole('faculty'), async (req, res) => {
  try {
    const facultyId = req.user.id;
    const projects = await Projects.listAll(p => String(p.facultyId?.id || p.facultyId) === String(facultyId));

    // Attach evaluation status and real-time progress
    const enhanced = await Promise.all(
      projects.map(async p => {
        const { projectProgress } = await recalculateProgress(p.id);
        const evalDoc = await Evaluations.findByProject(p.id);
        return {
          ...p,
          progress: projectProgress !== undefined ? projectProgress : (p.progress || 0),
          evaluation: evalDoc || null,
          isEvaluated: !!evalDoc
        };
      })
    );

    res.json({
      success: true,
      data: enhanced
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load assigned projects.', error: err.message });
  }
});

// ==========================================
// 9. FACULTY DASHBOARD: GET SINGLE ASSIGNED PROJECT DETAILS
// ==========================================
router.get('/projects/assigned/:id', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const project = await Projects.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    if (req.user.role === 'faculty' && String(project.facultyId?.id || project.facultyId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized. This project is not assigned to you.' });
    }

    const { projectProgress } = await recalculateProgress(project.id);
    const evalDoc = await Evaluations.findByProject(project.id);
    return res.json({
      success: true,
      data: {
        ...project,
        progress: projectProgress !== undefined ? projectProgress : (project.progress || 0),
        evaluation: evalDoc || null,
        isEvaluated: !!evalDoc
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get project details.', error: err.message });
  }
});

// ==========================================
// 10. FACULTY DASHBOARD: GET PENDING DEADLINE EXTENSION REQUESTS
// ==========================================
router.get('/deadline-requests/pending', verifyToken, requireRole('faculty'), async (req, res) => {
  try {
    const facultyId = String(req.user.id);
    const assignedProjects = await Projects.listAll(p => String(p.facultyId?.id || p.facultyId) === facultyId);
    const projectIds = assignedProjects.map(p => String(p.id || p._id));

    if (projectIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch all pending milestones
    const allPendingMilestones = await Milestones.listAll(m => 
      projectIds.includes(String(m.projectId)) && m.deadlineStatus === 'Pending_Approval'
    );

    // Fetch all pending tasks
    const allPendingTasks = await Tasks.listAll(t => 
      projectIds.includes(String(t.projectId)) && t.deadlineStatus === 'Pending_Approval'
    );

    const pendingRequests = [];

    for (const m of allPendingMilestones) {
      const proj = assignedProjects.find(p => String(p.id || p._id) === String(m.projectId));
      pendingRequests.push({
        id: m.id,
        _id: m.id,
        type: 'milestone',
        name: m.name,
        projectName: proj ? proj.projectName : 'Assigned Project',
        projectId: m.projectId,
        studentName: m.deadlineRequestedBy || 'Student',
        previousDeadline: m.previousDeadline || m.allocatedDeadline || m.deadline,
        requestedDeadline: m.requestedDeadline || m.deadline,
        reason: m.deadlineChangeReason || 'Offline consultation with faculty',
        requestedAt: m.deadlineRequestedAt || m.updatedAt || new Date().toISOString()
      });
    }

    for (const t of allPendingTasks) {
      const proj = assignedProjects.find(p => String(p.id || p._id) === String(t.projectId));
      pendingRequests.push({
        id: t.id,
        _id: t.id,
        type: 'task',
        name: t.name,
        projectName: proj ? proj.projectName : 'Assigned Project',
        projectId: t.projectId,
        studentName: t.deadlineRequestedBy || 'Student',
        previousDeadline: t.previousDeadline || t.allocatedDeadline || t.deadline,
        requestedDeadline: t.requestedDeadline || t.deadline,
        reason: t.deadlineChangeReason || 'Offline consultation with faculty',
        requestedAt: t.deadlineRequestedAt || t.updatedAt || new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: pendingRequests.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
    });
  } catch (err) {
    console.error('Pending Deadline Requests Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch pending deadline requests.', error: err.message });
  }
});

module.exports = router;

