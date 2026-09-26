const express = require('express');
const router = express.Router();
const {
  Projects,
  Users,
  Faculty,
  Milestones,
  Tasks,
  Evaluations,
  FacultyAllocations
} = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { notifyUser } = require('../services/notificationService');
const { sendProjectAssignedEmail, generateProfessionalEmailTemplate } = require('../services/emailService');
const { isDepartmentMatch, isYearMatch } = require('../utils/academicUtils');
const { recalculateProgress } = require('../services/progressService');

// ==========================================
// 1. SEARCH REGISTERED STUDENTS (Firebase)
// ==========================================
router.get('/students/search', verifyToken, async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim().toLowerCase() : '';
    const allStudents = await Users.listAll(u => u.role === 'student' && u.isActive !== false);

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
    const studentDept = studentUser?.department || 'Computer Science & Engineering';
    const studentYear = studentUser?.year || 'III Year';

    // Parse team members entered manually (by name and reg no)
    const rawMembers = Array.isArray(teamMembers)
      ? teamMembers
      : (Array.isArray(teamMemberIds) ? teamMemberIds : []);

    let parsedMembers = [];
    for (let i = 0; i < rawMembers.length; i++) {
      const item = rawMembers[i];
      if (typeof item === 'object' && item !== null) {
        const name = (item.name || '').trim();
        const registerNumber = (item.registerNumber || '').trim().toUpperCase();
        if (!name || !registerNumber) continue;
        const memberId = item._id || item.id || `mem_${Date.now()}_${i}`;
        parsedMembers.push({
          _id: memberId,
          id: memberId,
          name,
          registerNumber,
          isLeader: Boolean(item.isLeader || i === 0),
          department: item.department || studentDept,
          email: item.email || '',
          phone: item.phone || ''
        });
      } else if (typeof item === 'string') {
        const existingStudent = await Users.findById(item);
        if (existingStudent) {
          parsedMembers.push({
            _id: existingStudent.id,
            id: existingStudent.id,
            name: existingStudent.name,
            registerNumber: existingStudent.registerNumber || '',
            isLeader: String(existingStudent.id) === String(teamLeaderId),
            department: existingStudent.department || studentDept,
            email: existingStudent.email || '',
            phone: existingStudent.phone || ''
          });
        }
      }
    }

    // Ensure team leader is included as leader
    const leaderInList = parsedMembers.some(m =>
      String(m.id) === String(teamLeaderId) ||
      (m.registerNumber && m.registerNumber.toUpperCase() === (studentUser?.registerNumber || '').toUpperCase())
    );
    if (!leaderInList) {
      parsedMembers.unshift({
        _id: teamLeaderId,
        id: teamLeaderId,
        name: studentUser?.name || req.user.name || 'Team Leader',
        registerNumber: studentUser?.registerNumber || '',
        isLeader: true,
        department: studentDept,
        email: studentUser?.email || req.user.email || '',
        phone: studentUser?.phone || req.user.phone || ''
      });
    }

    if (parsedMembers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one team member (Name and Register Number).'
      });
    }

    // Verify faculty exists
    let faculty = await Faculty.findById(facultyId);
    if (!faculty) faculty = await Faculty.findByFacultyId(facultyId);
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
      facultyId,
      startDate: new Date(startDate).toISOString(),
      deadline: new Date(deadline).toISOString(),
      status: 'Submitted',
      progress: 0,
      createdAt: new Date().toISOString()
    });

    const populatedProject = await Projects.populate(project);
    const appUrl = process.env.APP_URL || 'http://localhost:5000';
    const facultyProjectLink = `${appUrl}/faculty/index.html?projectId=${project.id}`;
    const membersList = (populatedProject.teamMemberIds || parsedMembers).map(m => `${m.name} (${m.registerNumber || 'Student'})`).join(', ');

    const facultyEmailHtml = generateProfessionalEmailTemplate({
      headerTitle: 'Academic Faculty Mentorship Portal',
      headerSubtitle: 'New Project Allocation & Approval Request',
      recipientName: `Prof. ${faculty.name}`,
      badgeText: 'New Project Submission',
      badgeColor: '#2563eb',
      badgeBg: '#eff6ff',
      title: `📌 New Project Submitted for Approval: "${project.projectName}"`,
      summaryText: `A student team led by ${req.user.name || 'Student'} (${req.user.registerNumber || ''}) has submitted a new project proposal and requested your mentorship and approval.`,
      details: [
        { label: 'Project Name', value: project.projectName, highlight: true },
        { label: 'Domain / Topic', value: project.domain || 'General' },
        { label: 'Team Leader', value: `${req.user.name} (${req.user.registerNumber || ''})` },
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

    // Multi-channel Notification to Faculty (In-app, Live Email)
    await notifyUser({
      userId: faculty.id,
      userModel: 'Faculty',
      userRole: 'faculty',
      userEmail: faculty.email,
      userName: faculty.name,
      userPhone: faculty.phone,
      preferences: faculty.notificationPreferences,
      projectId: project.id,
      type: `PROJECT_ASSIGNED_${Date.now()}`,
      title: `📋 New Project Submitted for Approval: "${project.projectName}"`,
      message: `Team led by ${req.user.name || 'Student Team'} (${req.user.registerNumber || ''}) assigned the project "${project.projectName}" to you for review and approval. Submission deadline: ${new Date(deadline).toLocaleDateString('en-GB')}.`,
      emailHtml: facultyEmailHtml,
      isDirectAction: true
    });

    // Notify team members who have registered user accounts in Firebase or entered emails
    const projectUrl = `${appUrl}/student/index.html?projectId=${project.id}`;

    for (const member of parsedMembers) {
      const isLeader = String(member.id) === String(teamLeaderId) ||
        (member.registerNumber && studentUser?.registerNumber && member.registerNumber.toUpperCase() === studentUser.registerNumber.toUpperCase()) ||
        (member.email && (studentUser?.email || req.user.email) && member.email.toLowerCase() === (studentUser?.email || req.user.email).toLowerCase());

      if (!isLeader) {
        let studentAccount = null;
        if (member.id && !String(member.id).startsWith('mem_')) {
          studentAccount = await Users.findById(member.id);
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
          const notifMsg = `You have been added as a team member to "${project.projectName}" led by ${req.user.name}. Assigned faculty guide: Prof. ${faculty.name}.`;

          const emailHtml = generateProfessionalEmailTemplate({
            headerTitle: 'Rajeev Gandhi Memorial College of Engg. & Tech.',
            headerSubtitle: 'Academic Project Milestone Supervision Portal',
            recipientName: targetName,
            badgeText: 'Team Member Added',
            badgeColor: '#059669',
            badgeBg: '#ecfdf5',
            title: notifTitle,
            summaryText: `Your peer ${req.user.name} has added you to their academic project team for the ongoing semester.`,
            details: [
              { label: 'Project Name', value: project.projectName, highlight: true },
              { label: 'Team Leader', value: `${req.user.name} (${req.user.registerNumber || 'Leader'})` },
              { label: 'Assigned Faculty Mentor', value: `Prof. ${faculty.name}` },
              { label: 'Final Deadline', value: new Date(project.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
              { label: 'Department / Year', value: `${studentDept} (${studentYear})` }
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
      projects = await Projects.listAll(p => {
        const leaderId = String(p.teamLeaderId?.id || p.teamLeaderId?._id || p.teamLeaderId);
        const memberIds = Array.isArray(p.teamMemberIds)
          ? p.teamMemberIds.map(m => String(m?.id || m?._id || m))
          : [];
        const memberRegs = Array.isArray(p.teamMemberIds)
          ? p.teamMemberIds.map(m => String(m?.registerNumber || '').toUpperCase())
          : [];
        return leaderId === studentId || memberIds.includes(studentId) || (studentReg && memberRegs.includes(studentReg));
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
        return {
          ...p,
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
      let parsedMembers = [];
      for (let i = 0; i < rawMembers.length; i++) {
        const item = rawMembers[i];
        if (typeof item === 'object' && item !== null) {
          const name = (item.name || '').trim();
          const registerNumber = (item.registerNumber || '').trim().toUpperCase();
          if (!name || !registerNumber) continue;
          const memberId = item._id || item.id || `mem_${Date.now()}_${i}`;
          parsedMembers.push({
            _id: memberId,
            id: memberId,
            name,
            registerNumber,
            isLeader: Boolean(item.isLeader || i === 0),
            department: item.department || updates.department || project.department || 'CSE',
            year: item.year || updates.year || project.year || '3rd Year',
            email: item.email || '',
            phone: item.phone || ''
          });
        } else if (typeof item === 'string') {
          const existingStudent = await Users.findById(item);
          if (existingStudent) {
            parsedMembers.push({
              _id: existingStudent.id,
              id: existingStudent.id,
              name: existingStudent.name,
              registerNumber: existingStudent.registerNumber || '',
              isLeader: String(existingStudent.id) === String(project.teamLeaderId?.id || project.teamLeaderId),
              department: existingStudent.department || updates.department || project.department,
              year: existingStudent.year || updates.year || project.year,
              email: existingStudent.email || '',
              phone: existingStudent.phone || ''
            });
          }
        }
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
        const projectUrl = `${appUrl}/student/index.html?projectId=${project.id}`;
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

      if (isDeadlineChanged || isStartDateChanged) {
        const studentName = req.user.name || req.userDoc?.name || 'Student / Team Leader';
        const oldDeadlineStr = project.deadline ? new Date(project.deadline).toLocaleDateString('en-GB') : 'N/A';
        const newDeadlineStr = deadline ? new Date(deadline).toLocaleDateString('en-GB') : oldDeadlineStr;

        let changeSummary = `overall project deadline from ${oldDeadlineStr} to ${newDeadlineStr}`;
        if (isStartDateChanged && !isDeadlineChanged) {
          const oldStartStr = project.startDate ? new Date(project.startDate).toLocaleDateString('en-GB') : 'N/A';
          const newStartStr = startDate ? new Date(startDate).toLocaleDateString('en-GB') : oldStartStr;
          changeSummary = `start date from ${oldStartStr} to ${newStartStr}`;
        }

        let faculty = populated.facultyId;
        if (faculty && (typeof faculty === 'string' || !faculty.email)) {
          faculty = (await Faculty.findById(faculty.id || faculty._id || faculty)) || faculty;
        }

        if (faculty) {
          await notifyUser({
            userId: faculty.id || faculty._id || (typeof faculty === 'string' ? faculty : null),
            userModel: 'Faculty',
            userRole: 'faculty',
            userEmail: faculty.email,
            userName: faculty.name,
            userPhone: faculty.phone,
            preferences: faculty.notificationPreferences,
            projectId: project.id,
            type: `PROJECT_DEADLINE_CHANGED_${Date.now()}`,
            title: `📅 Project Deadline Changed: "${project.projectName}"`,
            message: `Notice: ${studentName} updated the ${changeSummary} for project "${project.projectName}".`
          });
        }
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
    const projectUrl = `${appUrl}/student/index.html?projectId=${project.id}`;

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
        await notifyUser({
          userId: faculty.id || faculty._id || (typeof faculty === 'string' ? faculty : null),
          userModel: 'Faculty',
          userRole: 'faculty',
          userEmail: faculty.email,
          userName: faculty.name,
          userPhone: faculty.phone,
          preferences: faculty.notificationPreferences,
          projectId: project.id,
          type: `PROJECT_DELETED_${Date.now()}`,
          title: `🗑️ Project Deleted: "${project.projectName}"`,
          message: `Notice: ${studentName} deleted the project "${project.projectName}". All associated milestones, tasks, and evaluations have been removed.`
        });
      }
    }

    await Milestones.deleteByProject(project.id);
    await Tasks.deleteByProject(project.id);
    await Evaluations.deleteByProject(project.id);
    await Projects.delete(project.id);

    res.json({
      success: true,
      message: 'Project and all associated milestones, tasks, and evaluations deleted successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete project.', error: err.message });
  }
});

module.exports = router;
