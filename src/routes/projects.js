const express = require('express');
const router = express.Router();
const {
  Projects,
  Users,
  Faculty,
  Milestones,
  Tasks,
  Evaluations,
  FacultyAllocations,
  ProjectDocuments,
  MentorshipAttendance
} = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { notifyUser } = require('../services/notificationService');
const {
  sendEmail,
  sendProjectAssignedEmail,
  sendTeamMemberAddedEmail,
  sendProjectCreationConfirmationEmail,
  generateProfessionalEmailTemplate
} = require('../services/emailService');
const { isDepartmentMatch, isYearMatch } = require('../utils/academicUtils');
const { recalculateProgress } = require('../services/progressService');

// ==========================================
// 1. SEARCH REGISTERED STUDENTS (Firebase)
// ==========================================
router.get('/students/search', verifyToken, async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim().toLowerCase() : '';
    const studentYear = req.user.year;
    const allStudents = await Users.listAll(u => {
      if (u.role !== 'student' || u.isActive === false) return false;
      if (req.user.role === 'student' && studentYear && u.year && !isYearMatch(u.year, studentYear)) {
        return false;
      }
      return true;
    });

    let filtered = allStudents;
    if (query && query.length >= 2) {
      filtered = allStudents.filter(s =>
        (s.registerNumber && s.registerNumber.toLowerCase().includes(query)) ||
        (s.name && s.name.toLowerCase().includes(query)) ||
        (s.email && s.email.toLowerCase().includes(query))
      );
    }

    const result = filtered.slice(0, 15).map(s => ({
      _id: s.id,
      id: s.id,
      name: s.name,
      registerNumber: s.registerNumber,
      email: s.email,
      department: s.department,
      year: s.year
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to search students.', error: err.message });
  }
});

// ==========================================
// 2. CREATE PROJECT (Manual Team Members by Name & Reg No - Firebase)
// ==========================================
router.post('/', verifyToken, requireRole('student'), async (req, res) => {
  try {
    const {
      projectName,
      description,
      domain,
      startDate,
      deadline,
      facultyId,
      teamMemberIds,
      teamMembers
    } = req.body;

    if (!projectName || !description || !domain || !startDate || !deadline || !facultyId) {
      return res.status(400).json({
        success: false,
        message: 'Project Name, Description, Domain, Start Date, Deadline, and Faculty are all required.'
      });
    }

    const teamLeaderId = req.user.id;
    const studentUser = await Users.findById(teamLeaderId);
    const studentDept = studentUser?.department || req.user.department || 'Computer Science & Engineering';
    const studentYear = studentUser?.year || req.user.year || 'III Year';
    const leaderRegNo = (studentUser?.registerNumber || req.user.registerNumber || '').trim().toUpperCase();
    const leaderEmail = (studentUser?.email || req.user.email || '').trim().toLowerCase();
    const leaderName = studentUser?.name || req.user.name || 'Team Leader';
    const leaderPhone = studentUser?.phone || req.user.phone || '';

    // Parse team members entered manually (by name and reg no)
    const rawMembers = Array.isArray(teamMembers)
      ? teamMembers
      : (Array.isArray(teamMemberIds) ? teamMemberIds : []);

    let parsedMembers = [];
    const seenRegs = new Set();
    const seenEmails = new Set();
    const seenIds = new Set();

    // 1. Team Leader is Member #1 (Leader)
    parsedMembers.push({
      _id: teamLeaderId,
      id: teamLeaderId,
      name: leaderName,
      registerNumber: leaderRegNo,
      isLeader: true,
      department: studentDept,
      year: studentYear,
      email: leaderEmail,
      phone: leaderPhone
    });
    seenIds.add(String(teamLeaderId));
    if (leaderRegNo) seenRegs.add(leaderRegNo);
    if (leaderEmail) seenEmails.add(leaderEmail);

    // 2. Parse and enrich all other team members
    for (let i = 0; i < rawMembers.length; i++) {
      const item = rawMembers[i];
      if (!item) continue;

      let name = '';
      let registerNumber = '';
      let email = '';
      let phone = '';
      let memberId = null;

      if (typeof item === 'object') {
        name = (item.name || '').trim();
        registerNumber = (item.registerNumber || '').trim().toUpperCase();
        email = (item.email || '').trim().toLowerCase();
        phone = (item.phone || '').trim();
        memberId = item._id || item.id || null;
      } else if (typeof item === 'string') {
        memberId = item;
      }

      // If registered user exists, enrich details
      let existingUser = null;
      if (memberId && !String(memberId).startsWith('mem_')) {
        existingUser = await Users.findById(memberId);
      }
      if (!existingUser && registerNumber) {
        existingUser = await Users.findOne(u => u.registerNumber && u.registerNumber.toUpperCase() === registerNumber);
      }
      if (!existingUser && email) {
        existingUser = await Users.findByEmail(email);
      }

      if (existingUser) {
        memberId = existingUser.id || existingUser._id;
        name = name || existingUser.name;
        registerNumber = registerNumber || (existingUser.registerNumber ? existingUser.registerNumber.toUpperCase() : '');
        email = email || (existingUser.email ? existingUser.email.toLowerCase() : '');
        phone = phone || (existingUser.phone || '');
      }

      if (!name && !registerNumber) continue;

      // Skip if this is the team leader (already added)
      const isLeaderMember = (memberId && String(memberId) === String(teamLeaderId)) ||
        (registerNumber && registerNumber === leaderRegNo) ||
        (email && email === leaderEmail);

      if (isLeaderMember) continue;

      // Deduplicate
      if (memberId && seenIds.has(String(memberId))) continue;
      if (registerNumber && seenRegs.has(registerNumber)) continue;
      if (email && seenEmails.has(email)) continue;

      if (memberId) seenIds.add(String(memberId));
      if (registerNumber) seenRegs.add(registerNumber);
      if (email) seenEmails.add(email);

      const resolvedMemberId = memberId || `mem_${Date.now()}_${i}`;
      parsedMembers.push({
        _id: resolvedMemberId,
        id: resolvedMemberId,
        name: name || 'Team Member',
        registerNumber: registerNumber || '',
        isLeader: false,
        department: existingUser?.department || item.department || studentDept,
        year: existingUser?.year || item.year || studentYear,
        email: email || '',
        phone: phone || ''
      });
    }

    if (parsedMembers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one team member (Name and Register Number).'
      });
    }

    // Verify faculty exists
    const rawFacId = String(facultyId).trim();
    let faculty = await Faculty.findById(rawFacId);
    if (!faculty) faculty = await Faculty.findByFacultyId(rawFacId);
    if (!faculty) {
      faculty = await Faculty.findOne(f => String(f.id) === rawFacId || String(f._id) === rawFacId || (f.facultyId && f.facultyId.toUpperCase() === rawFacId.toUpperCase()));
    }

    if (!faculty || faculty.isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Selected faculty does not exist or is inactive.'
      });
    }

    const canonicalFacId = faculty.id || faculty._id;

    // Verify whether that faculty is currently allocated to that Department + Year
    const allocation = await FacultyAllocations.findByFacultyDeptYear(canonicalFacId, studentDept, studentYear);
    if (!allocation || allocation.active === false) {
      return res.status(400).json({
        success: false,
        message: 'Selected faculty is not allocated to your department and year.'
      });
    }

    // Create Project in Firebase
    const project = await Projects.create({
      projectName: projectName.trim(),
      description: description.trim(),
      domain: domain.trim(),
      department: studentDept,
      year: studentYear,
      teamLeaderId,
      teamMemberIds: parsedMembers,
      teamMembers: parsedMembers,
      facultyId: canonicalFacId,
      startDate: new Date(startDate).toISOString(),
      deadline: new Date(deadline).toISOString(),
      status: 'Submitted',
      progress: 0,
      createdAt: new Date().toISOString()
    });

    const populatedProject = await Projects.populate(project);
    const appUrl = process.env.APP_URL || 'http://localhost:5000';
    const facultyProjectLink = `${appUrl}/faculty/?projectId=${project.id}&action=review`;
    const studentProjectLink = `${appUrl}/student/?projectId=${project.id}`;
    const membersList = (populatedProject.teamMemberIds || parsedMembers).map(m => `${m.name} (${m.registerNumber || 'Student'})`).join(', ');

    // 1. Multi-channel Notification + Live Email to Faculty Guide
    const facultyEmail = (faculty.email || '').trim().toLowerCase();
    const facultyEmailHtml = generateProfessionalEmailTemplate({
      headerTitle: 'Academic Faculty Mentorship Portal',
      headerSubtitle: 'New Project Allocation & Approval Request',
      recipientName: `Prof. ${faculty.name}`,
      badgeText: 'New Project Submission',
      badgeColor: '#2563eb',
      badgeBg: '#eff6ff',
      title: `📌 New Project Submitted for Approval: "${project.projectName}"`,
      summaryText: `A student team led by ${leaderName} (${leaderRegNo || 'Leader'}) has submitted a new project proposal and requested your mentorship and approval.`,
      details: [
        { label: 'Project Name', value: project.projectName, highlight: true },
        { label: 'Domain / Topic', value: project.domain || 'General' },
        { label: 'Team Leader', value: `${leaderName} (${leaderRegNo || 'Leader'})` },
        { label: 'Team Members', value: membersList || 'Assigned team members' },
        { label: 'Department & Year', value: `${studentDept} • ${studentYear}` },
        { label: 'Submission Deadline', value: new Date(deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
      ],
      actionSteps: [
        'Log into the Faculty Portal to review the project scope and milestone breakdown.',
        'Accept/Approve the project or provide constructive feedback/rejection remarks if revisions are needed.',
        'Monitor student progress and evaluate milestone deliverables.'
      ],
      buttonText: 'Review & Approve in Faculty Portal',
      buttonUrl: facultyProjectLink,
      alertType: 'info'
    });

    console.log(`[Project Create] Dispatching faculty email notification to ${facultyEmail} (${faculty.name}) for "${project.projectName}"`);
    await notifyUser({
      userId: faculty.id || canonicalFacId,
      userModel: 'Faculty',
      userRole: 'faculty',
      userEmail: facultyEmail,
      userName: faculty.name,
      userPhone: faculty.phone,
      preferences: faculty.notificationPreferences || { inApp: true, email: true },
      projectId: project.id,
      type: `PROJECT_ASSIGNED_${project.id}_${Date.now()}`,
      title: `📋 New Project Submitted for Approval: "${project.projectName}"`,
      message: `Team led by ${leaderName} (${leaderRegNo || 'Student Team'}) assigned the project "${project.projectName}" to you for review and approval. Submission deadline: ${new Date(deadline).toLocaleDateString('en-GB')}.`,
      emailHtml: facultyEmailHtml,
      isDirectAction: true,
      force: true
    });

    // 2. Multi-channel Notification + Live Email to Team Leader (Confirmation)
    if (leaderEmail) {
      const leaderEmailHtml = generateProfessionalEmailTemplate({
        headerTitle: 'Academic Project Milestone Supervision Portal',
        headerSubtitle: 'Project Submission Confirmation',
        recipientName: leaderName,
        badgeText: 'Project Submitted',
        badgeColor: '#2563eb',
        badgeBg: '#eff6ff',
        title: `🚀 Project Proposal Submitted: "${project.projectName}"`,
        summaryText: `Your project proposal "${project.projectName}" has been successfully created and submitted to Prof. ${faculty.name} for review and approval.`,
        details: [
          { label: 'Project Name', value: project.projectName, highlight: true },
          { label: 'Domain / Topic', value: project.domain || 'General' },
          { label: 'Assigned Faculty Guide', value: `Prof. ${faculty.name}` },
          { label: 'Team Members', value: membersList || 'Assigned team members' },
          { label: 'Department & Year', value: `${studentDept} • ${studentYear}` },
          { label: 'Final Deadline', value: new Date(deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
        ],
        actionSteps: [
          'Your faculty guide has been notified via email to review and approve your submission.',
          'Once approved, start defining milestones and assigning tasks to your team members.',
          'Maintain continuous communication with your team and faculty mentor.'
        ],
        buttonText: 'View Project in Student Portal',
        buttonUrl: studentProjectLink,
        alertType: 'info'
      });

      console.log(`[Project Create] Dispatching leader confirmation email to ${leaderEmail} (${leaderName})`);
      await notifyUser({
        userId: teamLeaderId,
        userModel: 'User',
        userRole: 'student',
        userEmail: leaderEmail,
        userName: leaderName,
        userPhone: leaderPhone,
        preferences: studentUser?.notificationPreferences || { inApp: true, email: true },
        projectId: project.id,
        type: `PROJECT_CREATED_${project.id}_${Date.now()}`,
        title: `🚀 Project Proposal Submitted: "${project.projectName}"`,
        message: `Your project "${project.projectName}" was submitted to Prof. ${faculty.name} for review and approval.`,
        emailHtml: leaderEmailHtml,
        isDirectAction: true,
        force: true
      });
    }

    // 3. Multi-channel Notification + Live Email to every non-leader Team Member
    for (const member of parsedMembers) {
      if (member.isLeader) continue;

      let studentAccount = null;
      const memId = member.id || member._id;
      if (memId && !String(memId).startsWith('mem_')) {
        studentAccount = await Users.findById(memId);
      }
      if (!studentAccount && member.registerNumber) {
        studentAccount = await Users.findOne(u => u.registerNumber && u.registerNumber.toUpperCase() === member.registerNumber.toUpperCase());
      }
      if (!studentAccount && member.email) {
        studentAccount = await Users.findByEmail(member.email);
      }

      const targetEmail = (studentAccount?.email || member.email || '').trim().toLowerCase();
      const targetName = studentAccount?.name || member.name || 'Student Member';
      const targetPhone = studentAccount?.phone || member.phone || '';
      const targetId = studentAccount?.id || member.id || targetEmail;

      if (targetEmail || targetId) {
        const notifTitle = `👥 Added to New Project: "${project.projectName}"`;
        const notifMsg = `You have been added as a team member to "${project.projectName}" led by ${leaderName}. Assigned faculty guide: Prof. ${faculty.name}.`;

        const emailHtml = generateProfessionalEmailTemplate({
          headerTitle: 'Rajeev Gandhi Memorial College of Engg. & Tech.',
          headerSubtitle: 'Academic Project Milestone Supervision Portal',
          recipientName: targetName,
          badgeText: 'Team Member Added',
          badgeColor: '#059669',
          badgeBg: '#ecfdf5',
          title: notifTitle,
          summaryText: `Your peer ${leaderName} has added you to their academic project team for the ongoing semester.`,
          details: [
            { label: 'Project Name', value: project.projectName, highlight: true },
            { label: 'Domain / Topic', value: project.domain || 'General' },
            { label: 'Team Leader', value: `${leaderName} (${leaderRegNo || 'Leader'})` },
            { label: 'Assigned Faculty Mentor', value: `Prof. ${faculty.name}` },
            { label: 'Final Deadline', value: new Date(project.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
            { label: 'Department / Year', value: `${studentDept} (${studentYear})` }
          ],
          actionSteps: [
            'Log into the Student Portal to view project milestones and allocated tasks.',
            'Coordinate with your team leader for task breakdowns and initial planning.',
            'Keep track of milestone due dates to ensure timely submissions.'
          ],
          buttonText: 'Open Project in Student Portal',
          buttonUrl: studentProjectLink,
          alertType: 'success'
        });

        console.log(`[Team Member Added Live Email] Dispatching to ${targetEmail || 'No-Email'} (${targetName}) for project "${project.projectName}"`);

        await notifyUser({
          userId: targetId,
          userModel: 'User',
          userRole: 'student',
          userEmail: targetEmail,
          userName: targetName,
          userPhone: targetPhone,
          preferences: studentAccount?.notificationPreferences || { inApp: true, email: true },
          projectId: project.id,
          type: `ADDED_TO_PROJECT_${project.id}_${targetId || targetEmail}_${Date.now()}`,
          title: notifTitle,
          message: notifMsg,
          emailHtml,
          isDirectAction: true,
          force: true
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Project created and submitted to faculty successfully in Firebase.',
      data: populatedProject
    });
  } catch (err) {
    console.error('Project Creation Error:', err);
    res.status(500).json({ success: false, message: 'Failed to create project.', error: err.message });
  }
});

// ==========================================
// 3. GET PROJECTS (Role-aware: Student sees enrolled; Faculty sees assigned; Admin sees all)
// ==========================================
router.get('/', verifyToken, async (req, res) => {
  try {
    let projects = [];
    if (req.user.role === 'student') {
      const studentId = String(req.user.id);
      const studentReg = (req.user.registerNumber || '').toUpperCase();
      const studentEmail = (req.user.email || '').toLowerCase();
      projects = await Projects.listAll(p => {
        const leaderId = String(p.teamLeaderId?.id || p.teamLeaderId?._id || p.teamLeaderId);
        const memberIds = Array.isArray(p.teamMemberIds)
          ? p.teamMemberIds.map(m => String(m?.id || m?._id || m))
          : [];
        const memberRegs = Array.isArray(p.teamMemberIds)
          ? p.teamMemberIds.map(m => String(m?.registerNumber || '').toUpperCase())
          : [];
        const memberEmails = Array.isArray(p.teamMemberIds)
          ? p.teamMemberIds.map(m => String(m?.email || '').toLowerCase())
          : [];
        return leaderId === studentId || memberIds.includes(studentId) ||
          (studentReg && memberRegs.includes(studentReg)) ||
          (studentEmail && memberEmails.includes(studentEmail));
      });
    } else if (req.user.role === 'faculty') {
      const facultyId = String(req.user.id);
      projects = await Projects.listAll(p => String(p.facultyId?.id || p.facultyId?._id || p.facultyId) === facultyId);
    } else {
      projects = await Projects.listAll();
    }

    const enhanced = await Promise.all(
      projects.map(async p => {
        const { projectProgress } = await recalculateProgress(p.id);
        const updatedDoc = await Projects.findById(p.id);
        return {
          ...p,
          status: updatedDoc?.status || p.status,
          progress: projectProgress !== undefined ? projectProgress : (p.progress || 0)
        };
      })
    );

    res.json({
      success: true,
      data: enhanced
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch projects.', error: err.message });
  }
});

// ==========================================
// 4. GET SINGLE PROJECT DETAILS
// ==========================================
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const project = await Projects.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    // Role-based access control for students: must belong to project
    if (req.user.role === 'student') {
      const studentId = String(req.user.id);
      const studentReg = (req.user.registerNumber || '').toUpperCase();
      const studentEmail = (req.user.email || '').toLowerCase();
      const leaderId = String(project.teamLeaderId?.id || project.teamLeaderId?._id || project.teamLeaderId);
      const memberIds = Array.isArray(project.teamMemberIds)
        ? project.teamMemberIds.map(m => String(m?.id || m?._id || m))
        : [];
      const memberRegs = Array.isArray(project.teamMemberIds)
        ? project.teamMemberIds.map(m => String(m?.registerNumber || '').toUpperCase())
        : [];
      const memberEmails = Array.isArray(project.teamMemberIds)
        ? project.teamMemberIds.map(m => String(m?.email || '').toLowerCase())
        : [];
      const isEnrolled = leaderId === studentId || memberIds.includes(studentId) ||
        (studentReg && memberRegs.includes(studentReg)) ||
        (studentEmail && memberEmails.includes(studentEmail));
      if (!isEnrolled) {
        return res.status(403).json({ success: false, message: 'Unauthorized. You do not have permission to view another student\'s project.' });
      }
    }

    const { projectProgress } = await recalculateProgress(project.id);
    const milestones = await Milestones.findByProject(project.id);
    const tasks = await Tasks.findByProject(project.id);
    const evaluation = await Evaluations.findByProject(project.id);

    const isStudent = req.user.role === 'student';

    res.json({
      success: true,
      data: {
        ...project,
        progress: projectProgress !== undefined ? projectProgress : (project.progress || 0),
        milestones,
        tasks,
        evaluation: isStudent ? null : (evaluation || null)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving project details.', error: err.message });
  }
});

// ==========================================
// 5. UPDATE PROJECT (Edit title, description, domain, dates, faculty, team members)
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const project = await Projects.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const isLeader = String(project.teamLeaderId?.id || project.teamLeaderId?._id || project.teamLeaderId) === String(req.user.id);
    const isFaculty = req.user.role === 'faculty' && String(project.facultyId?.id || project.facultyId?._id || project.facultyId) === String(req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (!isLeader && !isFaculty && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized to edit this project.' });
    }

    const {
      projectName,
      description,
      domain,
      startDate,
      deadline,
      facultyId,
      teamMembers,
      teamMemberIds,
      department,
      year
    } = req.body;

    const updates = {};
    if (projectName) updates.projectName = projectName.trim();
    if (description !== undefined) updates.description = description.trim();
    if (domain) updates.domain = domain.trim();
    if (startDate) updates.startDate = new Date(startDate).toISOString();
    if (deadline) updates.deadline = new Date(deadline).toISOString();
    if (department) updates.department = department.trim();
    if (year) updates.year = year.trim();

    if (facultyId) {
      let faculty = await Faculty.findById(facultyId);
      if (!faculty) faculty = await Faculty.findByFacultyId(facultyId);
      if (faculty) updates.facultyId = faculty.id || faculty._id;
    }

    // Process team members if updated
    const rawMembers = Array.isArray(teamMembers) ? teamMembers : (Array.isArray(teamMemberIds) ? teamMemberIds : null);
    if (rawMembers) {
      const leaderId = String(project.teamLeaderId?.id || project.teamLeaderId?._id || project.teamLeaderId);
      const leaderDoc = await Users.findById(leaderId);
      const leaderRegNo = (leaderDoc?.registerNumber || '').toUpperCase();
      const leaderEmail = (leaderDoc?.email || '').toLowerCase();

      let parsedMembers = [];
      const seenRegs = new Set();
      const seenEmails = new Set();
      const seenIds = new Set();

      for (let i = 0; i < rawMembers.length; i++) {
        const item = rawMembers[i];
        if (!item) continue;

        let name = '';
        let registerNumber = '';
        let email = '';
        let phone = '';
        let memberId = null;

        if (typeof item === 'object') {
          name = (item.name || '').trim();
          registerNumber = (item.registerNumber || '').trim().toUpperCase();
          email = (item.email || '').trim().toLowerCase();
          phone = (item.phone || '').trim();
          memberId = item._id || item.id || null;
        } else if (typeof item === 'string') {
          memberId = item;
        }

        let existingUser = null;
        if (memberId && !String(memberId).startsWith('mem_')) {
          existingUser = await Users.findById(memberId);
        }
        if (!existingUser && registerNumber) {
          existingUser = await Users.findOne(u => u.registerNumber && u.registerNumber.toUpperCase() === registerNumber);
        }
        if (!existingUser && email) {
          existingUser = await Users.findByEmail(email);
        }

        if (existingUser) {
          memberId = existingUser.id || existingUser._id;
          name = name || existingUser.name;
          registerNumber = registerNumber || (existingUser.registerNumber ? existingUser.registerNumber.toUpperCase() : '');
          email = email || (existingUser.email ? existingUser.email.toLowerCase() : '');
          phone = phone || (existingUser.phone || '');
        }

        if (!name && !registerNumber) continue;

        const isThisLeader = (memberId && String(memberId) === leaderId) ||
          (registerNumber && registerNumber === leaderRegNo) ||
          (email && email === leaderEmail) ||
          Boolean(item?.isLeader && (memberId === leaderId || registerNumber === leaderRegNo));

        if (memberId && seenIds.has(String(memberId))) continue;
        if (registerNumber && seenRegs.has(registerNumber)) continue;
        if (email && seenEmails.has(email)) continue;

        if (memberId) seenIds.add(String(memberId));
        if (registerNumber) seenRegs.add(registerNumber);
        if (email) seenEmails.add(email);

        const resolvedMemberId = memberId || `mem_${Date.now()}_${i}`;
        parsedMembers.push({
          _id: resolvedMemberId,
          id: resolvedMemberId,
          name: name || 'Team Member',
          registerNumber: registerNumber || '',
          isLeader: isThisLeader,
          department: existingUser?.department || item?.department || updates.department || project.department || 'CSE',
          year: existingUser?.year || item?.year || updates.year || project.year || '3rd Year',
          email: email || '',
          phone: phone || ''
        });
      }

      // Ensure leader is present
      const hasLeader = parsedMembers.some(m => m.isLeader || String(m.id) === leaderId);
      if (!hasLeader && leaderDoc) {
        parsedMembers.unshift({
          _id: leaderDoc.id,
          id: leaderDoc.id,
          name: leaderDoc.name,
          registerNumber: leaderDoc.registerNumber || '',
          isLeader: true,
          department: leaderDoc.department || updates.department || project.department || 'CSE',
          year: leaderDoc.year || updates.year || project.year || '3rd Year',
          email: leaderDoc.email || '',
          phone: leaderDoc.phone || ''
        });
      }

      if (parsedMembers.length > 0) {
        updates.teamMemberIds = parsedMembers;
        updates.teamMembers = parsedMembers;
      }
    }

    const updated = await Projects.update(project.id, updates);
    const populated = await Projects.populate(updated);

    // Notify any newly added team members in this update
    if (rawMembers && updates.teamMemberIds && updates.teamMemberIds.length > 0) {
      try {
        const oldMembers = Array.isArray(project.teamMemberIds) ? project.teamMemberIds : (Array.isArray(project.teamMembers) ? project.teamMembers : []);
        const oldRegs = new Set(oldMembers.map(m => (m?.registerNumber || '').toUpperCase()).filter(Boolean));
        const oldIds = new Set(oldMembers.map(m => String(m?.id || m?._id || m)).filter(Boolean));
        const oldEmails = new Set(oldMembers.map(m => (m?.email || '').toLowerCase()).filter(Boolean));

        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const projectUrl = `${appUrl}/student/?projectId=${project.id}`;
        const leaderName = req.user.name || 'Team Leader';

        let facultyDoc = populated.facultyId || project.facultyId;
        if (facultyDoc && (typeof facultyDoc === 'string' || !facultyDoc.name)) {
          facultyDoc = (await Faculty.findById(facultyDoc.id || facultyDoc._id || facultyDoc)) || facultyDoc;
        }
        const facultyName = facultyDoc?.name || 'Faculty Guide';

        for (const member of updates.teamMemberIds) {
          const memReg = (member.registerNumber || '').toUpperCase();
          const memId = String(member.id || member._id || '');
          const memEmail = (member.email || '').toLowerCase();

          const isOld = (memReg && oldRegs.has(memReg)) || (memId && oldIds.has(memId)) || (memEmail && oldEmails.has(memEmail));
          const isLeader = member.isLeader || memId === String(project.teamLeaderId?.id || project.teamLeaderId) || (memReg && memReg === (req.user.registerNumber || '').toUpperCase());

          if (!isOld && !isLeader) {
            let studentAccount = null;
            if (memId && !memId.startsWith('mem_')) {
              studentAccount = await Users.findById(memId);
            }
            if (!studentAccount && memReg) {
              studentAccount = await Users.findOne(u => u.registerNumber && u.registerNumber.toUpperCase() === memReg);
            }
            if (!studentAccount && memEmail) {
              studentAccount = await Users.findByEmail(memEmail);
            }

            const targetEmail = (studentAccount?.email || member.email || '').trim().toLowerCase();
            const targetName = studentAccount?.name || member.name || 'Student Member';
            const targetPhone = studentAccount?.phone || member.phone || '';
            const targetId = studentAccount?.id || memId || targetEmail;

            if (targetEmail || targetId) {
              const notifTitle = `👥 Added to Project: "${project.projectName}"`;
              const notifMsg = `You have been added as a team member to "${project.projectName}" led by ${leaderName}. Assigned faculty guide: Prof. ${facultyName}.`;

              const emailHtml = generateProfessionalEmailTemplate({
                headerTitle: 'Rajeev Gandhi Memorial College of Engg. & Tech.',
                headerSubtitle: 'Academic Project Milestone Supervision Portal',
                recipientName: targetName,
                badgeText: 'Team Member Added',
                badgeColor: '#059669',
                badgeBg: '#ecfdf5',
                title: notifTitle,
                summaryText: `Your peer ${leaderName} has added you to their academic project team for the ongoing semester.`,
                details: [
                  { label: 'Project Name', value: project.projectName, highlight: true },
                  { label: 'Team Leader', value: leaderName },
                  { label: 'Assigned Faculty Mentor', value: `Prof. ${facultyName}` },
                  { label: 'Final Deadline', value: new Date(updated.deadline || project.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
                  { label: 'Department / Year', value: `${updated.department || project.department || 'CSE'} (${updated.year || project.year || '3rd Year'})` }
                ],
                actionSteps: [
                  'Log into the Student Portal to view project milestones and requirements.',
                  'Coordinate with your team leader for task breakdowns and initial planning.',
                  'Keep track of milestone due dates to ensure timely submissions.'
                ],
                buttonText: 'Open Project in Student Portal',
                buttonUrl: projectUrl,
                alertType: 'success'
              });

              console.log(`[New Team Member Added in Update Live Email] Dispatching to ${targetEmail || 'No-Email'} (${targetName}) for project "${project.projectName}"`);

              await notifyUser({
                userId: targetId,
                userModel: 'User',
                userRole: 'student',
                userEmail: targetEmail,
                userName: targetName,
                userPhone: targetPhone,
                preferences: studentAccount?.notificationPreferences || { inApp: true, email: true },
                projectId: project.id,
                type: `ADDED_TO_PROJECT_${project.id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                title: notifTitle,
                message: notifMsg,
                emailHtml,
                isDirectAction: true,
                force: true
              });
            }
          }
        }
      } catch (memberNotifErr) {
        console.warn('[Project Update] Team member notification warning:', memberNotifErr.message);
      }
    }

    // If student/team leader modified project deadline or start date, notify the faculty mentor
    if (req.user.role === 'student' && populated && populated.facultyId) {
      const isDeadlineChanged = deadline && project.deadline &&
        new Date(project.deadline).toISOString().split('T')[0] !== new Date(deadline).toISOString().split('T')[0];
      const isStartDateChanged = startDate && project.startDate &&
        new Date(project.startDate).toISOString().split('T')[0] !== new Date(startDate).toISOString().split('T')[0];
      const isResubmitted = project.status === 'Rejected' && updates.status === 'Submitted';
      const isFacultyChanged = updates.facultyId && String(updates.facultyId) !== String(project.facultyId?.id || project.facultyId);

      let faculty = populated.facultyId;
      if (faculty && (typeof faculty === 'string' || !faculty.email)) {
        faculty = (await Faculty.findById(faculty.id || faculty._id || faculty)) || faculty;
      }

      if (faculty && (isResubmitted || isFacultyChanged)) {
        const leaderName = req.user.name || req.userDoc?.name || 'Team Leader';
        const leaderRegNo = req.user.registerNumber || req.userDoc?.registerNumber || '';
        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const facultyProjectLink = `${appUrl}/faculty/?projectId=${project.id}&action=review`;
        const membersList = (populated.teamMemberIds || []).map(m => `${m.name} (${m.registerNumber || 'Student'})`).join(', ');
        const facEmail = (faculty.email || '').trim().toLowerCase();

        const facultyEmailHtml = generateProfessionalEmailTemplate({
          headerTitle: 'Academic Faculty Mentorship Portal',
          headerSubtitle: 'Project Resubmission & Approval Request',
          recipientName: `Prof. ${faculty.name}`,
          badgeText: isResubmitted ? 'Revised Project Resubmission' : 'New Project Assigned',
          badgeColor: '#2563eb',
          badgeBg: '#eff6ff',
          title: `📌 Project Submitted for Approval: "${populated.projectName}"`,
          summaryText: `Team led by ${leaderName} (${leaderRegNo || 'Leader'}) has submitted their revised project proposal "${populated.projectName}" for your review and approval.`,
          details: [
            { label: 'Project Name', value: populated.projectName, highlight: true },
            { label: 'Domain / Topic', value: populated.domain || 'General' },
            { label: 'Team Leader', value: `${leaderName} (${leaderRegNo || 'Leader'})` },
            { label: 'Team Members', value: membersList || 'Assigned team members' },
            { label: 'Department & Year', value: `${populated.department || 'CSE'} • ${populated.year || '3rd Year'}` },
            { label: 'Submission Deadline', value: new Date(populated.deadline || deadline || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
          ],
          actionSteps: [
            'Log into the Faculty Portal to review the updated project proposal.',
            'Accept & Approve the project or provide feedback.',
            'Monitor student progress and evaluate milestone deliverables.'
          ],
          buttonText: 'Review & Approve in Faculty Portal',
          buttonUrl: facultyProjectLink,
          alertType: 'info'
        });

        console.log(`[Project Update] Dispatching faculty email notification to ${facEmail} (${faculty.name}) for "${populated.projectName}"`);
        await notifyUser({
          userId: faculty.id || faculty._id,
          userModel: 'Faculty',
          userRole: 'faculty',
          userEmail: facEmail,
          userName: faculty.name,
          userPhone: faculty.phone,
          preferences: faculty.notificationPreferences || { inApp: true, email: true },
          projectId: project.id,
          type: `PROJECT_ASSIGNED_${project.id}_${Date.now()}`,
          title: `📋 Project Submitted for Approval: "${populated.projectName}"`,
          message: `Team led by ${leaderName} submitted the project "${populated.projectName}" for your review and approval.`,
          emailHtml: facultyEmailHtml,
          isDirectAction: true,
          force: true
        });
      } else if (faculty && (isDeadlineChanged || isStartDateChanged)) {
        const studentName = req.user.name || req.userDoc?.name || 'Student / Team Leader';
        const oldDeadlineStr = project.deadline ? new Date(project.deadline).toLocaleDateString('en-GB') : 'N/A';
        const newDeadlineStr = deadline ? new Date(deadline).toLocaleDateString('en-GB') : oldDeadlineStr;

        let changeSummary = `overall project deadline from ${oldDeadlineStr} to ${newDeadlineStr}`;
        if (isStartDateChanged && !isDeadlineChanged) {
          const oldStartStr = project.startDate ? new Date(project.startDate).toLocaleDateString('en-GB') : 'N/A';
          const newStartStr = startDate ? new Date(startDate).toLocaleDateString('en-GB') : oldStartStr;
          changeSummary = `start date from ${oldStartStr} to ${newStartStr}`;
        }

        const notifTitle = `📅 Project Deadline Changed: "${project.projectName}"`;
        const notifMsg = `Notice: ${studentName} updated the ${changeSummary} for project "${project.projectName}".`;
        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const facultyProjectUrl = `${appUrl}/faculty/?projectId=${project.id}`;

        const emailHtml = generateProfessionalEmailTemplate({
          headerTitle: 'Academic Faculty Mentorship Portal',
          headerSubtitle: 'Project Schedule / Timeline Change Notice',
          recipientName: `Prof. ${faculty.name}`,
          badgeText: 'Project Schedule Updated',
          badgeColor: '#2563eb',
          badgeBg: '#eff6ff',
          title: notifTitle,
          summaryText: notifMsg,
          details: [
            { label: 'Project Name', value: project.projectName, highlight: true },
            { label: 'Updated By', value: studentName },
            { label: 'Schedule Modification', value: changeSummary, highlight: true },
            { label: 'Updated At', value: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
          ],
          actionSteps: [
            'Log into the Faculty Portal to inspect the revised project schedule and milestone timeline.',
            'Coordinate with the student team leader during your review sessions.'
          ],
          buttonText: 'View Project in Faculty Portal',
          buttonUrl: facultyProjectUrl,
          alertType: 'info'
        });

        await notifyUser({
          userId: faculty.id || faculty._id || (typeof faculty === 'string' ? faculty : null),
          userModel: 'Faculty',
          userRole: 'faculty',
          userEmail: faculty.email,
          userName: faculty.name,
          userPhone: faculty.phone,
          preferences: faculty.notificationPreferences || { inApp: true, email: true },
          projectId: project.id,
          type: `PROJECT_DEADLINE_CHANGED_${Date.now()}`,
          title: notifTitle,
          message: notifMsg,
          emailHtml,
          isDirectAction: true,
          force: true
        });
      }
    }

    res.json({
      success: true,
      message: 'Project details updated successfully.',
      data: populated
    });
  } catch (err) {
    console.error('Project Update Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update project.', error: err.message });
  }
});

// ==========================================
// 6. UPDATE PROJECT STATUS (Faculty approval/rejection)
// ==========================================
router.put('/:id/status', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const project = await Projects.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    if (req.user.role === 'faculty' && String(project.facultyId?.id || project.facultyId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized. Not assigned to this project.' });
    }

    if (status === 'Rejected' && (!rejectionReason || !rejectionReason.trim())) {
      return res.status(400).json({ success: false, message: 'A rejection reason is required when rejecting a project.' });
    }

    const updates = {
      status,
      rejectionReason: status === 'Rejected' ? rejectionReason.trim() : ''
    };

    const updated = await Projects.update(project.id, updates);
    const populated = await Projects.populate(updated);

    const facultyName = req.user.name || req.userDoc?.name || 'Faculty Guide';
    const appUrl = process.env.APP_URL || 'http://localhost:5000';
    const projectUrl = `${appUrl}/student/?projectId=${project.id}`;

    // 1. Resolve Team Leader Information
    let teamLeader = populated.teamLeaderId;
    if (teamLeader && (typeof teamLeader === 'string' || !teamLeader.email)) {
      teamLeader = (await Users.findById(teamLeader.id || teamLeader._id || teamLeader)) || teamLeader;
    }
    const leaderName = teamLeader?.name || 'Team Leader';

    // 2. Gather All Team Members (Leader + Members) and resolve their registered User accounts to ensure valid email addresses
    const rawMembers = [];
    if (teamLeader) rawMembers.push(teamLeader);
    if (Array.isArray(populated.teamMemberIds)) rawMembers.push(...populated.teamMemberIds);
    if (Array.isArray(populated.teamMembers)) rawMembers.push(...populated.teamMembers);
    if (Array.isArray(project.teamMemberIds)) rawMembers.push(...project.teamMemberIds);
    if (Array.isArray(project.teamMembers)) rawMembers.push(...project.teamMembers);

    const resolvedRecipients = [];
    const seenDedupeKeys = new Set();

    for (const member of rawMembers) {
      if (!member) continue;

      let userDoc = null;
      const memId = member.id || member._id || (typeof member === 'string' ? member : null);

      if (memId && typeof memId === 'string' && !memId.startsWith('mem_')) {
        userDoc = await Users.findById(memId);
      }
      if (!userDoc && member.registerNumber) {
        userDoc = await Users.findOne(u => u.registerNumber && u.registerNumber.toUpperCase() === member.registerNumber.toUpperCase());
      }
      if (!userDoc && member.email) {
        userDoc = await Users.findByEmail(member.email);
      }

      const finalEmail = (userDoc?.email || member.email || '').trim().toLowerCase();
      const finalName = userDoc?.name || member.name || 'Student Member';
      const finalRegisterNumber = userDoc?.registerNumber || member.registerNumber || '';
      const finalPhone = userDoc?.phone || member.phone || '';
      const finalUserId = userDoc?.id || memId || finalEmail || finalRegisterNumber;
      const finalPreferences = userDoc?.notificationPreferences || { inApp: true, email: true };

      // Unique deduplication key
      const dedupeKey = finalEmail ? `email:${finalEmail}` : (finalUserId ? `id:${finalUserId}` : (finalRegisterNumber ? `reg:${finalRegisterNumber}` : null));
      if (!dedupeKey || seenDedupeKeys.has(dedupeKey)) continue;
      seenDedupeKeys.add(dedupeKey);

      resolvedRecipients.push({
        id: finalUserId,
        name: finalName,
        email: finalEmail,
        phone: finalPhone,
        registerNumber: finalRegisterNumber,
        preferences: finalPreferences
      });
    }

    const isApproved = status === 'Approved';
    const isRejected = status === 'Rejected';

    const notifType = isApproved
      ? `PROJECT_APPROVED_${project.id}_${Date.now()}`
      : (isRejected ? `PROJECT_REJECTED_${project.id}_${Date.now()}` : `PROJECT_STATUS_${project.id}_${Date.now()}`);

    const notifTitle = isApproved
      ? `🎉 Project Approved: "${project.projectName}"`
      : (isRejected ? `⚠️ Project Revision Required: "${project.projectName}"` : `📋 Project Status: ${status}`);

    const notifMsg = isApproved
      ? `Great news! Faculty Mentor Prof. ${facultyName} has officially approved your project "${project.projectName}". All team members can now proceed with task execution and milestone deliverables.`
      : (isRejected
        ? `Notice: Faculty Mentor Prof. ${facultyName} has requested revisions for project "${project.projectName}". Reason: "${updates.rejectionReason}". Please review the feedback and update your submission.`
        : `Notice: Project "${project.projectName}" status has been updated to "${status}" by Prof. ${facultyName}.`);

    const emailBadgeText = isApproved ? 'Project Approved' : (isRejected ? 'Revision Required' : 'Status Update');
    const alertType = isApproved ? 'success' : (isRejected ? 'danger' : 'info');

    const formattedDeadline = project.deadline
      ? new Date(project.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'End of Semester';

    const membersSummary = resolvedRecipients.map(r => `${r.name}${r.registerNumber ? ` (${r.registerNumber})` : ''}`).join(', ');

    const emailDetails = [
      { label: 'Project Name', value: project.projectName, highlight: true },
      { label: 'Faculty Mentor', value: `Prof. ${facultyName}` },
      { label: 'Academic Batch', value: `${project.department || 'CSE'} • ${project.year || '3rd Year'}` },
      { label: 'Project Status', value: isApproved ? 'APPROVED (Active)' : status, highlight: true },
      { label: 'Team Leader', value: leaderName },
      { label: 'Team Members', value: membersSummary || 'All team members' },
      { label: 'Final Deadline', value: formattedDeadline }
    ];

    if (isRejected && updates.rejectionReason) {
      emailDetails.push({ label: 'Rejection Reason / Feedback', value: updates.rejectionReason, highlight: true });
    }

    const actionSteps = isApproved
      ? [
          'Log into the Student Portal to track project milestones and assigned tasks.',
          'Coordinate with your team members and start working on Milestone 1 deliverables.',
          'Submit regular milestone progress updates to your faculty mentor for periodic review.'
        ]
      : (isRejected
        ? [
            'Review the mentor remarks and feedback points listed above.',
            'Refine project scope, milestones, or team composition in your student workspace.',
            'Reach out to your mentor or resubmit the proposal once revisions are complete.'
          ]
        : ['Log into the Student Portal to check latest project details.']);

    // Send email + in-app notification to each resolved project member
    for (const recipient of resolvedRecipients) {
      const emailHtml = generateProfessionalEmailTemplate({
        headerTitle: 'Rajeev Gandhi Memorial College of Engg. & Tech.',
        headerSubtitle: 'Academic Project Milestone Supervision Portal',
        recipientName: recipient.name || 'Student Member',
        badgeText: emailBadgeText,
        badgeColor: isApproved ? '#059669' : (isRejected ? '#dc2626' : '#2563eb'),
        badgeBg: isApproved ? '#ecfdf5' : (isRejected ? '#fef2f2' : '#eff6ff'),
        title: notifTitle,
        summaryText: notifMsg,
        details: emailDetails,
        actionSteps,
        buttonText: 'Open Project in Student Portal',
        buttonUrl: projectUrl,
        alertType
      });

      console.log(`[Project ${status} Email] Dispatching to ${recipient.email || 'No-Email'} (${recipient.name}) for project "${project.projectName}"`);

      await notifyUser({
        userId: recipient.id,
        userModel: 'User',
        userRole: 'student',
        userEmail: recipient.email,
        userName: recipient.name,
        userPhone: recipient.phone,
        preferences: recipient.preferences || { inApp: true, email: true },
        projectId: project.id,
        type: notifType,
        title: notifTitle,
        message: notifMsg,
        emailHtml,
        isDirectAction: true,
        force: true
      });
    }

    res.json({
      success: true,
      message: `Project status successfully updated to "${status}". Live email notifications dispatched to all ${resolvedRecipients.length} project member(s).`,
      data: updated,
      notifiedCount: resolvedRecipients.length
    });
  } catch (err) {
    console.error('Project Status Update Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update project status.', error: err.message });
  }
});

// ==========================================
// 7. DELETE PROJECT (Student leader, Faculty mentor, or Admin)
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const project = await Projects.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const isLeader = String(project.teamLeaderId?.id || project.teamLeaderId?._id || project.teamLeaderId) === String(req.user.id);
    const isFaculty = req.user.role === 'faculty' && String(project.facultyId?.id || project.facultyId?._id || project.facultyId) === String(req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (!isLeader && !isFaculty && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this project.' });
    }

    // If deleted by a student/team leader, notify the assigned faculty
    if (req.user.role === 'student' && project.facultyId) {
      let faculty = project.facultyId;
      if (faculty && (typeof faculty === 'string' || !faculty.email)) {
        faculty = (await Faculty.findById(faculty.id || faculty._id || faculty)) || faculty;
      }

      if (faculty) {
        const studentName = req.user.name || req.userDoc?.name || 'Student / Team Leader';
        const notifTitle = `🗑️ Project Deleted: "${project.projectName}"`;
        const notifMsg = `Notice: ${studentName} deleted the project "${project.projectName}". All associated milestones, tasks, and evaluations have been removed.`;

        const emailHtml = generateProfessionalEmailTemplate({
          headerTitle: 'Academic Faculty Mentorship Portal',
          headerSubtitle: 'Project Deletion Notice',
          recipientName: `Prof. ${faculty.name}`,
          badgeText: 'Project Removed',
          badgeColor: '#dc2626',
          badgeBg: '#fef2f2',
          title: notifTitle,
          summaryText: notifMsg,
          details: [
            { label: 'Project Name', value: project.projectName, highlight: true },
            { label: 'Deleted By', value: studentName },
            { label: 'Deletion Date', value: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
          ],
          actionSteps: [
            'All records, milestones, tasks, and deliverables for this project have been removed.',
            'Contact the student team leader if you believe this was done in error.'
          ],
          alertType: 'danger'
        });

        await notifyUser({
          userId: faculty.id || faculty._id || (typeof faculty === 'string' ? faculty : null),
          userModel: 'Faculty',
          userRole: 'faculty',
          userEmail: faculty.email,
          userName: faculty.name,
          userPhone: faculty.phone,
          preferences: faculty.notificationPreferences || { inApp: true, email: true },
          projectId: project.id,
          type: `PROJECT_DELETED_${Date.now()}`,
          title: notifTitle,
          message: notifMsg,
          emailHtml,
          isDirectAction: true,
          force: true
        });
      }
    }

    await Milestones.deleteByProject(project.id);
    await Tasks.deleteByProject(project.id);
    await Evaluations.deleteByProject(project.id);
    await ProjectDocuments.deleteByProject(project.id);
    await MentorshipAttendance.deleteByProject(project.id);
    await Projects.delete(project.id);

    res.json({
      success: true,
      message: 'Project and all associated milestones, tasks, documents, and evaluations deleted successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete project.', error: err.message });
  }
});

module.exports = router;
