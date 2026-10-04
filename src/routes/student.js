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

// ==========================================
// 2. LOOKUP REGISTERED STUDENT BY REGISTER NUMBER (FOR TEAM MEMBER ADDITION)
// ==========================================
router.get('/lookup-member', verifyToken, requireRole('student'), async (req, res) => {
  try {
    const rawRegNo = (req.query.regNo || req.query.identifier || '').trim();
    if (!rawRegNo) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a student register number to look up.'
      });
    }

    const cleanRegNo = rawRegNo.toUpperCase();
    const leaderUser = await Users.findById(req.user.id);
    const leaderRegNo = (leaderUser?.registerNumber || req.user.registerNumber || '').trim().toUpperCase();
    const leaderEmail = (leaderUser?.email || req.user.email || '').trim().toLowerCase();

    // Prevent searching/adding oneself (team leader)
    if (cleanRegNo === leaderRegNo || rawRegNo.toLowerCase() === leaderEmail) {
      return res.status(400).json({
        success: false,
        isLeader: true,
        message: 'You are the Team Leader and are already automatically included as Member #1.'
      });
    }

    // Look up in registered student users
    let member = await Users.findOne(u => u.role === 'student' && u.registerNumber && u.registerNumber.trim().toUpperCase() === cleanRegNo);
    if (!member && rawRegNo.includes('@')) {
      member = await Users.findOne(u => u.role === 'student' && u.email && u.email.trim().toLowerCase() === rawRegNo.toLowerCase());
    }

    if (!member) {
      return res.status(404).json({
        success: false,
        notRegistered: true,
        message: `Student with Register Number "${cleanRegNo}" is not registered on the portal. Please ask them to complete Student Registration first.`
      });
    }

    const leaderDept = leaderUser?.department || req.user.department || '';
    const leaderYear = leaderUser?.year || req.user.year || '';

    // Check department & year alignment
    const isSameDept = !leaderDept || !member.department || normalizeDepartment(member.department) === normalizeDepartment(leaderDept);
    const isSameYear = !leaderYear || !member.year || normalizeYear(member.year) === normalizeYear(leaderYear);

    let warning = null;
    if (!isSameDept || !isSameYear) {
      warning = `Note: Student is in ${member.department || 'Unknown Dept'} • ${member.year || 'Unknown Year'} (Your cohort: ${leaderDept} • ${leaderYear}).`;
    }

    res.json({
      success: true,
      member: {
        id: member.id || member._id,
        _id: member.id || member._id,
        name: member.name,
        registerNumber: (member.registerNumber || '').toUpperCase(),
        email: (member.email || '').toLowerCase(),
        phone: member.phone || '',
        department: member.department || leaderDept,
        year: member.year || leaderYear
      },
      warning
    });
  } catch (err) {
    console.error('Member Lookup Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to look up student account.',
      error: err.message
    });
  }
});

module.exports = router;
