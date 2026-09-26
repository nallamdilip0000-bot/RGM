const express = require('express');
const router = express.Router();
const { Users, FacultyAllocations } = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { normalizeDepartment, normalizeYear } = require('../utils/academicUtils');

// ==========================================
// 1. GET AVAILABLE ALLOCATED FACULTY FOR LOGGED-IN STUDENT
// ==========================================
router.get('/available-faculty', verifyToken, requireRole('student'), async (req, res) => {
  try {
    // 1. Fetch latest student record to ensure up-to-date department & year
    const student = await Users.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found.' });
    }

    const studentDept = student.department || 'Computer Science & Engineering';
    const studentYear = student.year || 'III Year';

    // 2. Fetch all active faculty allocated to this department & year
    const facultyList = await FacultyAllocations.findActiveAllocatedFaculty(studentDept, studentYear);

    // Format clean list
    const cleanList = facultyList.map(f => ({
      _id: f._id || f.id,
      id: f._id || f.id,
      facultyId: f.facultyId,
      name: f.name,
      email: f.email,
      department: f.department,
      designation: f.designation,
      phone: f.phone
    })).sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      department: normalizeDepartment(studentDept),
      year: normalizeYear(studentYear),
      studentDepartment: studentDept,
      studentYear: studentYear,
      count: cleanList.length,
      data: cleanList
    });
  } catch (err) {
    console.error('Available Faculty Fetch Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve allocated faculty for your department and year.',
      error: err.message
    });
  }
});

module.exports = router;
