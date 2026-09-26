const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Users, Faculty, Projects } = require('../services/dbService');
const { verifyToken, JWT_SECRET } = require('../middleware/auth');

const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

// ==========================================
// 1. STUDENT REGISTRATION (Firebase)
// ==========================================
router.post('/student/register', async (req, res) => {
  try {
    const {
      name,
      registerNumber,
      email,
      password,
      confirmPassword,
      department,
      year,
      phone
    } = req.body;

    if (!name || !registerNumber || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, Register Number, Email, and Password are required.'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    const cleanRegNo = registerNumber.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    // Check unique register number
    const existingReg = await Users.findByRegisterNumber(cleanRegNo);
    if (existingReg) {
      return res.status(400).json({
        success: false,
        message: `Register Number ${cleanRegNo} is already registered.`
      });
    }

    // Check unique email
    const existingEmail = await Users.findByEmail(cleanEmail);
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: `Email ${cleanEmail} is already registered.`
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const student = await Users.create({
      name: name.trim(),
      registerNumber: cleanRegNo,
      email: cleanEmail,
      password: hashedPassword,
      department: department || 'Computer Science & Engineering',
      year: year || 'III Year',
      phone: phone ? phone.trim() : '',
      role: 'student',
      isActive: true,
      notificationPreferences: {
        email: true,
        inApp: true,
        reminder3Day: true,
        reminder1Day: true,
        reminderDeadlineDay: true,
        reminderOverdue: true
      }
    });

    // Synchronize any existing projects where this student was added by peers prior to registration
    try {
      const allProjects = await Projects.listAll();
      for (const p of allProjects) {
        let changed = false;
        const members = Array.isArray(p.teamMemberIds) ? [...p.teamMemberIds] : [];
        for (let i = 0; i < members.length; i++) {
          const m = members[i];
          if (m && (String(m.registerNumber).toUpperCase() === cleanRegNo || (m.email && String(m.email).toLowerCase() === cleanEmail))) {
            members[i] = {
              ...m,
              _id: student.id,
              id: student.id,
              name: student.name,
              email: cleanEmail,
              phone: student.phone || m.phone || ''
            };
            changed = true;
          }
        }
        if (changed) {
          await Projects.update(p.id, { teamMemberIds: members, teamMembers: members });
        }
      }
    } catch (syncErr) {
      console.warn('Project membership sync warning on register:', syncErr.message);
    }

    const token = generateToken({
      id: student.id,
      role: 'student',
      email: student.email,
      name: student.name,
      registerNumber: student.registerNumber
    });

    res.status(201).json({
      success: true,
      message: 'Student registered successfully in Firebase.',
      token,
      user: {
        id: student.id,
        name: student.name,
        registerNumber: student.registerNumber,
        email: student.email,
        department: student.department,
        year: student.year,
        phone: student.phone,
        role: student.role,
        notificationPreferences: student.notificationPreferences
      }
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.', error: err.message });
  }
});

// ==========================================
// 2. STUDENT LOGIN (Firebase)
// ==========================================
router.post('/student/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Register Number / Email and Password are required.'
      });
    }

    const trimmed = identifier.trim();
    let student = await Users.findByEmail(trimmed);
    if (!student) {
      student = await Users.findByRegisterNumber(trimmed);
    }

    if (!student || student.role !== 'student') {
      return res.status(401).json({
        success: false,
        message: 'Invalid student credentials or account does not exist.'
      });
    }

    if (student.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Contact administrator.'
      });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please verify your password.'
      });
    }

    const token = generateToken({
      id: student.id,
      role: 'student',
      email: student.email,
      name: student.name,
      registerNumber: student.registerNumber
    });

    res.json({
      success: true,
      message: 'Student login successful.',
      token,
      user: {
        id: student.id,
        name: student.name,
        registerNumber: student.registerNumber,
        email: student.email,
        department: student.department,
        year: student.year,
        phone: student.phone,
        role: student.role,
        notificationPreferences: student.notificationPreferences
      }
    });
  } catch (err) {
    console.error('Student Login Error:', err);
    res.status(500).json({ success: false, message: 'Server error during student login.', error: err.message });
  }
});

// ==========================================
// 3. FACULTY LOGIN (Firebase)
// ==========================================
router.post('/faculty/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Faculty ID / Email and Password are required.'
      });
    }

    const trimmed = identifier.trim();
    let faculty = await Faculty.findByEmail(trimmed);
    if (!faculty) {
      faculty = await Faculty.findByFacultyId(trimmed);
    }

    if (!faculty) {
      return res.status(401).json({
        success: false,
        message: 'Invalid faculty credentials. Faculty not found.'
      });
    }

    if (faculty.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Faculty account is currently disabled. Contact administrator.'
      });
    }

    const isMatch = await bcrypt.compare(password, faculty.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid faculty password.'
      });
    }

    const token = generateToken({
      id: faculty.id,
      role: 'faculty',
      email: faculty.email,
      name: faculty.name,
      facultyId: faculty.facultyId
    });

    res.json({
      success: true,
      message: 'Faculty login successful.',
      token,
      user: {
        id: faculty.id,
        name: faculty.name,
        facultyId: faculty.facultyId,
        email: faculty.email,
        department: faculty.department,
        designation: faculty.designation,
        phone: faculty.phone,
        role: 'faculty',
        notificationPreferences: faculty.notificationPreferences
      }
    });
  } catch (err) {
    console.error('Faculty Login Error:', err);
    res.status(500).json({ success: false, message: 'Server error during faculty login.', error: err.message });
  }
});

// ==========================================
// 4. ADMIN LOGIN (Firebase)
// ==========================================
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Admin Email and Password are required.'
      });
    }

    const admin = await Users.findByEmail(email.trim().toLowerCase());
    if (!admin || admin.role !== 'admin') {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials.'
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials.'
      });
    }

    const token = generateToken({
      id: admin.id,
      role: 'admin',
      email: admin.email,
      name: admin.name
    });

    res.json({
      success: true,
      message: 'Admin login successful.',
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: 'admin',
        notificationPreferences: admin.notificationPreferences
      }
    });
  } catch (err) {
    console.error('Admin Login Error:', err);
    res.status(500).json({ success: false, message: 'Server error during admin login.', error: err.message });
  }
});

// ==========================================
// 5. GET CURRENT USER (ME)
// ==========================================
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userDoc = req.userDoc;
    res.json({
      success: true,
      user: userDoc
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving user profile.' });
  }
});

// ==========================================
// 6. UPDATE PROFILE & PREFERENCES
// ==========================================
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { phone, department, year, notificationPreferences } = req.body;
    const targetId = req.user.id;
    const isFaculty = req.user.role === 'faculty';

    const updates = {};
    if (phone !== undefined) updates.phone = phone.trim();
    if (department !== undefined) updates.department = department.trim();
    if (year !== undefined) updates.year = year.trim();
    if (notificationPreferences) {
      updates.notificationPreferences = {
        ...(req.userDoc.notificationPreferences || {}),
        ...notificationPreferences
      };
    }

    let updated;
    if (isFaculty) {
      updated = await Faculty.update(targetId, updates);
    } else {
      updated = await Users.update(targetId, updates);
    }

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update profile.', error: err.message });
  }
});

module.exports = router;
