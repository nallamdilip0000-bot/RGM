const express = require('express');
const router = express.Router();
const { MentorshipAttendance, Projects, Users, Faculty } = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');

// ==========================================
// 1. LOG NEW MENTORSHIP MEETING & ATTENDANCE (Faculty & Admin only)
// ==========================================
router.post('/', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const { projectId, meetingDate, topic, notes, attendanceRecords } = req.body;

    if (!projectId || !meetingDate || !topic || !Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Project, Meeting Date, Topic, and Student Attendance Records are required.'
      });
    }

    const project = await Projects.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    // Ensure faculty is assigned to this project (unless admin)
    if (req.user.role === 'faculty') {
      const facId = String(project.facultyId?.id || project.facultyId?._id || project.facultyId);
      if (facId !== String(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Unauthorized. You are not assigned to this project.' });
      }
    }

    const facultyUser = req.userDoc || await Faculty.findById(req.user.id) || req.user;

    const teamMembersMap = {};
    (project.teamMemberIds || []).forEach(m => {
      const sId = String(m._id || m.id);
      teamMembersMap[sId] = m;
    });

    const cleanAttendance = attendanceRecords.map(r => {
      const sId = String(r.studentId);
      const memberInfo = teamMembersMap[sId] || {};
      return {
        studentId: sId,
        studentName: String(r.studentName || memberInfo.name || 'Student').trim(),
        registerNumber: String(r.registerNumber || memberInfo.registerNumber || '').trim(),
        year: String(r.year || memberInfo.year || project.year || '3rd Year').trim(),
        department: String(r.department || memberInfo.department || project.department || 'CSE').trim(),
        status: r.status === 'Absent' ? 'Absent' : 'Present',
        remarks: (r.remarks || '').trim()
      };
    });

    const meetingDoc = await MentorshipAttendance.create({
      projectId: String(project.id || project._id),
      projectName: project.projectName || 'Project',
      projectDomain: project.domain || '',
      projectYear: project.year || (project.academicYear ? `${project.academicYear}` : '3rd Year'),
      projectDept: project.department || 'CSE',
      facultyId: String(req.user.id),
      facultyName: facultyUser.name || 'Faculty Guide',
      meetingDate: new Date(meetingDate).toISOString(),
      topic: topic.trim(),
      notes: (notes || '').trim(),
      attendanceRecords: cleanAttendance,
      totalStudents: cleanAttendance.length,
      presentCount: cleanAttendance.filter(a => a.status === 'Present').length,
      absentCount: cleanAttendance.filter(a => a.status === 'Absent').length,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Mentorship meeting and attendance logged successfully.',
      data: meetingDoc
    });
  } catch (err) {
    console.error('Log Meeting Attendance Error:', err);
    res.status(500).json({ success: false, message: 'Failed to record meeting attendance.', error: err.message });
  }
});

// ==========================================
// 2. GET ALL MENTORSHIP MEETINGS FOR FACULTY (Faculty & Admin only)
// ==========================================
router.get('/faculty', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const facultyId = String(req.user.id);
    let meetings = [];

    if (req.user.role === 'faculty') {
      meetings = await MentorshipAttendance.listAll(m => String(m.facultyId) === String(facultyId));
    } else {
      meetings = await MentorshipAttendance.listAll();
    }

    // Enrich with current project details (Year, Department, Team member details)
    const allProjects = await Projects.listAll();
    const projectMap = {};
    allProjects.forEach(p => {
      if (p.id) projectMap[String(p.id)] = p;
      if (p._id) projectMap[String(p._id)] = p;
    });

    const enrichedMeetings = meetings.map(m => {
      const proj = projectMap[String(m.projectId)] || {};
      const projYear = m.projectYear || proj.year || '3rd Year';
      const projDept = m.projectDept || proj.department || 'CSE';

      const teamMap = {};
      (proj.teamMemberIds || []).forEach(tm => {
        if (tm.id) teamMap[String(tm.id)] = tm;
        if (tm._id) teamMap[String(tm._id)] = tm;
        if (tm.registerNumber) teamMap[String(tm.registerNumber).toUpperCase()] = tm;
      });

      const enrichedRecords = (m.attendanceRecords || []).map(r => {
        const tm = teamMap[String(r.studentId)] || teamMap[String(r.registerNumber || '').toUpperCase()] || {};
        return {
          ...r,
          studentName: r.studentName || tm.name || 'Student',
          registerNumber: r.registerNumber || tm.registerNumber || '',
          year: r.year || tm.year || projYear,
          department: r.department || tm.department || projDept
        };
      });

      return {
        ...m,
        projectName: m.projectName || proj.projectName || 'Project',
        projectDomain: m.projectDomain || proj.domain || '',
        projectYear: projYear,
        projectDept: projDept,
        attendanceRecords: enrichedRecords
      };
    });

    res.json({
      success: true,
      count: enrichedMeetings.length,
      data: enrichedMeetings
    });
  } catch (err) {
    console.error('Fetch Faculty Meetings Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch meeting records.', error: err.message });
  }
});

// ==========================================
// 3. GET ATTENDANCE STATS FOR A SPECIFIC PROJECT (Faculty & Admin only)
// ==========================================
router.get('/project/:projectId', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const projectId = String(req.params.projectId);
    const meetings = await MentorshipAttendance.findByProject(projectId);

    // Aggregate statistics per student
    const studentStats = {};
    meetings.forEach(m => {
      (m.attendanceRecords || []).forEach(r => {
        const sId = String(r.studentId);
        if (!studentStats[sId]) {
          studentStats[sId] = {
            studentId: sId,
            studentName: r.studentName,
            registerNumber: r.registerNumber,
            totalMeetings: 0,
            presentCount: 0,
            absentCount: 0,
            percentage: 0
          };
        }
        studentStats[sId].totalMeetings += 1;
        if (r.status === 'Present') {
          studentStats[sId].presentCount += 1;
        } else {
          studentStats[sId].absentCount += 1;
        }
      });
    });

    Object.values(studentStats).forEach(stat => {
      stat.percentage = stat.totalMeetings === 0 ? 0 : Math.round((stat.presentCount / stat.totalMeetings) * 100);
    });

    res.json({
      success: true,
      totalMeetings: meetings.length,
      meetings,
      studentStats
    });
  } catch (err) {
    console.error('Fetch Project Attendance Error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve project attendance stats.', error: err.message });
  }
});

// ==========================================
// 4. UPDATE / EDIT A MENTORSHIP MEETING RECORD (Faculty & Admin only)
// ==========================================
router.put('/:id', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const meeting = await MentorshipAttendance.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting record not found.' });
    }

    if (req.user.role === 'faculty' && String(meeting.facultyId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You cannot edit this record.' });
    }

    const { meetingDate, topic, notes, attendanceRecords } = req.body;

    let cleanAttendance = meeting.attendanceRecords || [];
    if (Array.isArray(attendanceRecords) && attendanceRecords.length > 0) {
      cleanAttendance = attendanceRecords.map(r => ({
        studentId: String(r.studentId),
        studentName: String(r.studentName || 'Student').trim(),
        registerNumber: String(r.registerNumber || '').trim(),
        year: String(r.year || meeting.projectYear || '3rd Year').trim(),
        department: String(r.department || meeting.projectDept || 'CSE').trim(),
        status: r.status === 'Absent' ? 'Absent' : 'Present',
        remarks: (r.remarks || '').trim()
      }));
    }

    const updateData = {
      meetingDate: meetingDate ? new Date(meetingDate).toISOString() : meeting.meetingDate,
      topic: topic ? topic.trim() : meeting.topic,
      notes: notes !== undefined ? notes.trim() : meeting.notes,
      attendanceRecords: cleanAttendance,
      totalStudents: cleanAttendance.length,
      presentCount: cleanAttendance.filter(a => a.status === 'Present').length,
      absentCount: cleanAttendance.filter(a => a.status === 'Absent').length,
      updatedAt: new Date().toISOString()
    };

    const updated = await MentorshipAttendance.update(req.params.id, updateData);

    res.json({
      success: true,
      message: 'Mentorship meeting record and attendance updated successfully.',
      data: updated
    });
  } catch (err) {
    console.error('Update Meeting Record Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update meeting record.', error: err.message });
  }
});

// ==========================================
// 5. DELETE A MENTORSHIP MEETING RECORD (Faculty & Admin only)
// ==========================================
router.delete('/:id', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const meeting = await MentorshipAttendance.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting record not found.' });
    }

    if (req.user.role === 'faculty' && String(meeting.facultyId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You cannot delete this record.' });
    }

    await MentorshipAttendance.delete(req.params.id);

    res.json({
      success: true,
      message: 'Meeting record deleted successfully.'
    });
  } catch (err) {
    console.error('Delete Meeting Record Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete meeting record.', error: err.message });
  }
});

module.exports = router;
