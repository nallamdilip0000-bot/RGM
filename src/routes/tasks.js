const express = require('express');
const router = express.Router();
const { Tasks, Projects, Milestones, Users, Faculty } = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { notifyUser, notifyProjectMembers } = require('../services/notificationService');
const { runDeadlineChecker } = require('../services/deadlineChecker');
const { generateProfessionalEmailTemplate } = require('../services/emailService');

const { recalculateProgress } = require('../services/progressService');

// ==========================================
// 1. CREATE TASK (Individual or Group Assignment by Team Leader)
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      projectId,
      milestoneId,
      name,
      description,
      assignedTo,
      assignedMembers,
      isGroupTask: clientIsGroupTask,
      priority,
      deadline,
      status
    } = req.body;

    if (!projectId || !milestoneId || !name || !deadline) {
      return res.status(400).json({
        success: false,
        message: 'Project ID, Milestone ID, Task Name, and Deadline are required.'
      });
    }

    const project = await Projects.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const milestone = await Milestones.findById(milestoneId);
    const milestoneName = milestone ? milestone.name : 'Academic Milestone';

    const projectMembers = project.teamMemberIds || [];
    let isGroup = Boolean(clientIsGroupTask);
    let rawAssignees = [];

    if (assignedTo === 'ALL' || assignedTo === 'group' || clientIsGroupTask) {
      isGroup = true;
      rawAssignees = projectMembers;
    } else if (Array.isArray(assignedTo) && assignedTo.length > 0) {
      rawAssignees = assignedTo;
      if (rawAssignees.length >= projectMembers.length && projectMembers.length > 0) {
        isGroup = true;
      }
    } else if (assignedTo) {
      rawAssignees = [assignedTo];
    } else if (Array.isArray(assignedMembers) && assignedMembers.length > 0) {
      rawAssignees = assignedMembers;
    } else {
      isGroup = true;
      rawAssignees = projectMembers;
    }

    // Resolve assigned member profiles with full user details
    const resolvedAssignedMembers = [];
    for (const item of rawAssignees) {
      const itemId = String(item.id || item._id || item);
      let memberObj = projectMembers.find(m => String(m.id || m._id || m.registerNumber) === itemId) ||
                        (typeof item === 'object' && item.name ? item : null);

      let userDoc = null;
      if (!memberObj?.email) {
        if (itemId && !itemId.startsWith('mem_')) {
          userDoc = await Users.findById(itemId);
        }
        if (!userDoc && memberObj?.registerNumber) {
          userDoc = await Users.findByRegisterNumber(memberObj.registerNumber);
        }
      }

      const finalId = userDoc?.id || memberObj?.id || memberObj?._id || itemId;
      const finalName = userDoc?.name || memberObj?.name || 'Student';
      const finalEmail = (userDoc?.email || memberObj?.email || '').trim().toLowerCase();
      const finalPhone = userDoc?.phone || memberObj?.phone || '';
      const finalReg = userDoc?.registerNumber || memberObj?.registerNumber || '';
      const finalPrefs = userDoc?.notificationPreferences || memberObj?.notificationPreferences || { inApp: true, email: true };

      resolvedAssignedMembers.push({
        _id: finalId,
        id: finalId,
        name: finalName,
        registerNumber: finalReg,
        email: finalEmail,
        phone: finalPhone,
        notificationPreferences: finalPrefs
      });
    }

    const isoDeadline = new Date(deadline).toISOString();
    const task = await Tasks.create({
      projectId: String(projectId),
      milestoneId: String(milestoneId),
      name: name.trim(),
      description: description ? description.trim() : '',
      assignedTo: isGroup ? 'ALL' : resolvedAssignedMembers.map(m => m.id),
      assignedMemberIds: isGroup ? 'ALL' : resolvedAssignedMembers.map(m => m.id),
      assignedMembers: resolvedAssignedMembers,
      isGroupTask: isGroup,
      priority: priority || 'Medium',
      deadline: isoDeadline,
      allocatedDeadline: isoDeadline,
      previousDeadline: isoDeadline,
      deadlineStatus: 'Approved',
      status: status || 'To Do',
      createdAt: new Date().toISOString()
    });

    // Recalculate progress
    await recalculateProgress(projectId, milestoneId);

    // Multi-channel Notification: Send task assignment email for EVERY task assigned
    const appUrl = process.env.APP_URL || 'http://localhost:5000';
    const projectUrl = `${appUrl}/student/index.html?projectId=${project.id || project._id}`;
    const taskDeadlineStr = new Date(task.deadline).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const leaderName = req.user.name || 'Team Leader';
    const leaderId = String(req.user.id || req.user._id || '');
    const leaderReg = String(req.user.registerNumber || '').toUpperCase();
    const leaderEmail = String(req.user.email || '').toLowerCase();

    for (const student of resolvedAssignedMembers) {
      // Exclude the student team leader who created/assigned the task from receiving an assignment email to themselves
      const isAssignerLeader = String(student.id || student._id) === leaderId ||
        (student.registerNumber && leaderReg && String(student.registerNumber).toUpperCase() === leaderReg) ||
        (student.email && leaderEmail && String(student.email).toLowerCase() === leaderEmail);

      if (isAssignerLeader && req.user.role === 'student') {
        continue;
      }

      const notifTitle = isGroup ? `📌 New Group Task Assigned: "${task.name}"` : `📌 New Task Assigned: "${task.name}"`;
      const notifMsg = `You were assigned ${isGroup ? 'group task' : 'task'} "${task.name}" in project "${project.projectName}". Milestone: "${milestoneName}". Priority: ${task.priority}. Due: ${taskDeadlineStr}.`;

      const emailHtml = generateProfessionalEmailTemplate({
        headerTitle: 'Rajeev Gandhi Memorial College of Engg. & Tech.',
        headerSubtitle: `Task Assignment Notice (${isGroup ? 'Group Deliverable' : 'Individual Allocation'})`,
        recipientName: student.name || 'Student',
        badgeText: isGroup ? 'Group Task Assigned' : 'Individual Task Assigned',
        badgeColor: '#0284c7',
        badgeBg: '#f0f9ff',
        title: notifTitle,
        summaryText: `A new task has been assigned to you by team leader ${leaderName} for milestone "${milestoneName}" in project "${project.projectName}".`,
        details: [
          { label: 'Project Name', value: project.projectName, highlight: true },
          { label: 'Task Name', value: task.name },
          { label: 'Milestone', value: milestoneName },
          { label: 'Priority', value: task.priority || 'Medium' },
          { label: 'Assigned By', value: leaderName },
          { label: 'Submission Deadline', value: taskDeadlineStr, highlight: true },
          { label: 'Task Type', value: isGroup ? 'Group Deliverable (All Team Members)' : 'Individual Assignment' }
        ],
        actionSteps: [
          'Log into the Student Portal to read the full task description and instructions.',
          'Coordinate with your team leader and peers on technical implementation.',
          'Submit completed work and mark the task as "Completed" before the deadline.'
        ],
        buttonText: 'Open Task in Student Portal',
        buttonUrl: projectUrl,
        alertType: 'info'
      });

      console.log(`[Task Assigned Live Email] Dispatching to member ${student.email || 'No-Email'} (${student.name}) for task "${task.name}"`);

      // Dispatch task assignment email immediately to team member
      await notifyUser({
        userId: student.id || student._id,
        userModel: 'User',
        userRole: 'student',
        userEmail: student.email,
        userName: student.name,
        userPhone: student.phone,
        preferences: student.notificationPreferences || { inApp: true, email: true },
        projectId: project.id || project._id,
        taskId: task.id || task._id,
        milestoneId: task.milestoneId,
        type: `TASK_ASSIGNED_${task.id || task._id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        title: notifTitle,
        message: notifMsg,
        emailHtml,
        isDirectAction: true,
        force: true
      });
    }

    const populatedTask = await Tasks.findById(task.id);
    res.status(201).json({
      success: true,
      message: 'Task created and assignment notifications dispatched successfully.',
      data: populatedTask
    });
  } catch (err) {
    console.error('Task Creation Error:', err);
    res.status(500).json({ success: false, message: 'Failed to create task.', error: err.message });
  }
});

// ==========================================
// 2. GET TASKS FOR A PROJECT
// ==========================================
router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const project = await Projects.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

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
        return res.status(403).json({ success: false, message: 'Access denied. You do not belong to this project.' });
      }
    }

    const tasks = await Tasks.findByProject(req.params.projectId);
    res.json({
      success: true,
      data: tasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve tasks.', error: err.message });
  }
});

// ==========================================
// 3. UPDATE TASK (With Offline Faculty Deadline Extension Request)
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, assignedTo, priority, deadline, status, deadlineChangeReason } = req.body;
    const task = await Tasks.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    const project = await Projects.findById(task.projectId);
    const updates = {};
    if (name) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (priority) updates.priority = priority;
    if (assignedTo) updates.assignedTo = String(assignedTo);

    if (status && status !== task.status) {
      updates.status = status;
      updates.completedAt = status === 'Completed' ? new Date().toISOString() : null;
    }

    let isDeadlineChangeRequested = false;
    let oldAllocatedDeadlineStr = 'N/A';
    let newRequestedDeadlineStr = 'N/A';

    // If deadline is modified:
    if (deadline) {
      const newIso = new Date(deadline).toISOString();
      const currentAllocatedIso = task.allocatedDeadline || task.deadline;
      const isDateChanged = new Date(currentAllocatedIso).toISOString().split('T')[0] !== newIso.split('T')[0];

      if (isDateChanged) {
        if (req.user.role === 'student') {
          // Student requested a new deadline -> requires faculty approval
          isDeadlineChangeRequested = true;
          updates.previousDeadline = currentAllocatedIso;
          updates.requestedDeadline = newIso;
          updates.deadlineStatus = 'Pending_Approval';
          updates.deadlineChangeReason = deadlineChangeReason ? deadlineChangeReason.trim() : 'Student updated task deadline after offline faculty discussion';
          updates.deadlineRequestedBy = req.user.name || req.userDoc?.name || 'Student';
          updates.deadlineRequestedAt = new Date().toISOString();
          // Active deadline stays as previous allocated date until approved!
          updates.deadline = currentAllocatedIso;
          updates.allocatedDeadline = currentAllocatedIso;

          oldAllocatedDeadlineStr = new Date(currentAllocatedIso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          newRequestedDeadlineStr = new Date(newIso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } else {
          // Faculty or Admin directly changes deadline
          updates.deadline = newIso;
          updates.allocatedDeadline = newIso;
          updates.previousDeadline = currentAllocatedIso;
          updates.deadlineStatus = 'Approved';
        }
      }
    }

    const updated = await Tasks.update(task.id, updates);

    // Recalculate progress
    await recalculateProgress(task.projectId, task.milestoneId?.id || task.milestoneId);

    // If student requested a deadline change, notify the assigned Faculty Guide immediately
    if (isDeadlineChangeRequested && project && project.facultyId) {
      let faculty = project.facultyId;
      if (faculty && (typeof faculty === 'string' || !faculty.email)) {
        faculty = (await Faculty.findById(faculty.id || faculty._id || faculty)) || faculty;
      }

      if (faculty) {
        const studentName = req.user.name || req.userDoc?.name || 'Student';
        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const facultyReviewUrl = `${appUrl}/faculty/index.html?projectId=${project.id}`;
        const notifTitle = `⏳ Task Deadline Extension Request: "${task.name}"`;
        const notifMsg = `${studentName} requested a deadline change for task "${task.name}" in project "${project.projectName}". Previous allocated deadline: ${oldAllocatedDeadlineStr}, Requested new deadline: ${newRequestedDeadlineStr}. Reason: "${updates.deadlineChangeReason}". Please approve or reject in the Faculty Portal.`;

        const emailHtml = generateProfessionalEmailTemplate({
          headerTitle: 'Rajeev Gandhi Memorial College of Engg. & Tech.',
          headerSubtitle: 'Academic Project Milestone Supervision Portal',
          recipientName: `Prof. ${faculty.name}`,
          badgeText: 'Task Deadline Approval Required',
          badgeColor: '#ea580c',
          badgeBg: '#fff7ed',
          title: `⏳ Task Deadline Extension Request: "${task.name}"`,
          summaryText: `A student team member has submitted a task deadline change request following offline consultation. Your approval is required to update the schedule.`,
          details: [
            { label: 'Project Name', value: project.projectName, highlight: true },
            { label: 'Task Name', value: task.name },
            { label: 'Requested By', value: studentName },
            { label: 'Previous Allocated Date', value: oldAllocatedDeadlineStr, highlight: true },
            { label: 'Requested New Deadline', value: newRequestedDeadlineStr, highlight: true },
            { label: 'Offline Reason / Note', value: updates.deadlineChangeReason }
          ],
          actionSteps: [
            'Log into the Faculty Portal to review the student request.',
            'Approve the extension if offline discussion is verified.',
            'If rejected, the student must deliver the task on the previous allocated date.'
          ],
          buttonText: 'Review & Decide in Faculty Portal',
          buttonUrl: facultyReviewUrl,
          alertType: 'warning'
        });

        await notifyUser({
          userId: faculty.id || faculty._id,
          userModel: 'Faculty',
          userRole: 'faculty',
          userEmail: faculty.email,
          userName: faculty.name,
          userPhone: faculty.phone,
          preferences: faculty.notificationPreferences,
          projectId: project.id,
          taskId: task.id,
          type: `TASK_DEADLINE_REQUEST_${task.id}_${Date.now()}`,
          title: notifTitle,
          message: notifMsg,
          emailHtml,
          isDirectAction: true,
          force: true
        });
      }
    }

    // Run deadline checker in background
    runDeadlineChecker().catch(e => console.error('Task update deadline check error:', e.message));

    const populatedTask = await Tasks.findById(task.id);
    const responseMsg = isDeadlineChangeRequested
      ? 'Task updated. Deadline change request submitted to your Faculty Mentor for approval. (Previous allocated deadline remains active until approved).'
      : 'Task updated successfully.';

    res.json({
      success: true,
      message: responseMsg,
      data: populatedTask,
      isPendingApproval: isDeadlineChangeRequested
    });
  } catch (err) {
    console.error('Task Update Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update task.', error: err.message });
  }
});

// ==========================================
// 4. FACULTY TASK DEADLINE DECISION (Approve or Reject Extension)
// ==========================================
router.put('/:id/deadline-decision', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const { decision, remarks } = req.body; // decision: 'Approved' | 'Rejected'
    const task = await Tasks.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    const project = await Projects.findById(task.projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Associated project not found.' });
    }

    if (req.user.role === 'faculty' && String(project.facultyId?.id || project.facultyId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You are not assigned to this project.' });
    }

    if (!['Approved', 'Rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Decision must be either "Approved" or "Rejected".' });
    }

    const isApproved = decision === 'Approved';
    const previousDate = task.previousDeadline || task.allocatedDeadline || task.deadline;
    const requestedDate = task.requestedDeadline || task.deadline;
    const facultyName = req.user.name || req.userDoc?.name || 'Faculty Guide';

    const updates = {
      deadlineStatus: decision,
      deadlineDecisionBy: facultyName,
      deadlineDecisionAt: new Date().toISOString(),
      deadlineDecisionRemarks: remarks ? remarks.trim() : '',
      facultyDeadlineRemarks: remarks ? remarks.trim() : ''
    };

    if (isApproved) {
      // Approved: new requested deadline becomes active
      updates.deadline = requestedDate;
      updates.allocatedDeadline = requestedDate;
    } else {
      // Rejected: strictly maintain/revert to previous allocated deadline!
      updates.deadline = previousDate;
      updates.allocatedDeadline = previousDate;
    }

    const updated = await Tasks.update(task.id, updates);

    const prevDateStr = new Date(previousDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const newDateStr = new Date(requestedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Notify all student project members
    const notifTitle = isApproved
      ? `🎉 Task Deadline Approved: "${task.name}"`
      : `⚠️ Task Deadline Extension Rejected: "${task.name}"`;

    const notifMsg = isApproved
      ? `Great news! Faculty Guide Prof. ${facultyName} approved your requested deadline for task "${task.name}". Your new deadline is ${newDateStr}.`
      : `Notice: Faculty Guide Prof. ${facultyName} has rejected your deadline extension request for task "${task.name}". You must submit on the PREVIOUS ALLOCATED DATE: ${prevDateStr}.${remarks ? ` Mentor Remarks: "${remarks}".` : ''}`;

    const emailDetails = [
      { label: 'Project Name', value: project.projectName, highlight: true },
      { label: 'Task Name', value: task.name },
      { label: 'Faculty Mentor', value: `Prof. ${facultyName}` },
      { label: 'Decision', value: isApproved ? 'APPROVED (New Deadline Active)' : 'REJECTED (Must Submit on Previous Date)', highlight: true },
      { label: isApproved ? 'Active Deadline' : 'Mandatory Submission Date', value: isApproved ? newDateStr : prevDateStr, highlight: true },
      { label: 'Previous Allocated Date', value: prevDateStr }
    ];

    if (remarks) {
      emailDetails.push({ label: 'Mentor Feedback / Remarks', value: remarks, highlight: true });
    }

    const actionSteps = isApproved
      ? [
          `Your new approved deadline for task "${task.name}" is ${newDateStr}.`,
          'Coordinate with team members to deliver completed work by this target date.'
        ]
      : [
          `IMPORTANT: You must complete task "${task.name}" by the original deadline: ${prevDateStr}.`,
          'Review the faculty remarks provided above.',
          'Accelerate task execution to avoid milestone delays.'
        ];

    await notifyProjectMembers({
      project,
      title: notifTitle,
      message: notifMsg,
      badgeText: isApproved ? 'Deadline Approved' : 'Extension Rejected',
      badgeColor: isApproved ? '#059669' : '#dc2626',
      badgeBg: isApproved ? '#ecfdf5' : '#fef2f2',
      details: emailDetails,
      actionSteps,
      alertType: isApproved ? 'success' : 'danger',
      type: `TASK_DECISION_${task.id}_${Date.now()}`,
      taskId: task.id
    });

    res.json({
      success: true,
      message: isApproved
        ? `Task deadline approved (${newDateStr}). Team members notified via email.`
        : `Task deadline extension rejected. Team instructed to submit on previous date (${prevDateStr}).`,
      data: updated
    });
  } catch (err) {
    console.error('Task Deadline Decision Error:', err);
    res.status(500).json({ success: false, message: 'Failed to process deadline decision.', error: err.message });
  }
});

// ==========================================
// 5. DELETE TASK
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const task = await Tasks.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    const { projectId, milestoneId } = task;
    await Tasks.delete(task.id);

    await recalculateProgress(projectId, milestoneId?.id || milestoneId);

    // If student deleted task, notify faculty
    if (req.user.role === 'student') {
      const project = await Projects.findById(projectId);
      if (project && project.facultyId) {
        let faculty = project.facultyId;
        if (faculty && (typeof faculty === 'string' || !faculty.email)) {
          faculty = (await Faculty.findById(faculty.id || faculty._id || faculty)) || faculty;
        }

        if (faculty) {
          const studentName = req.user.name || req.userDoc?.name || 'Student / Team Leader';
          const notifTitle = `🗑️ Task Deleted: "${task.name}"`;
          const notifMsg = `Notice: ${studentName} deleted task "${task.name}" from project "${project.projectName}".`;

          const emailHtml = generateProfessionalEmailTemplate({
            headerTitle: 'Academic Faculty Mentorship Portal',
            headerSubtitle: 'Task Deletion Notice',
            recipientName: `Prof. ${faculty.name}`,
            badgeText: 'Task Removed',
            badgeColor: '#dc2626',
            badgeBg: '#fef2f2',
            title: notifTitle,
            summaryText: notifMsg,
            details: [
              { label: 'Project Name', value: project.projectName, highlight: true },
              { label: 'Task Name', value: task.name },
              { label: 'Deleted By', value: studentName },
              { label: 'Deletion Date', value: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
            ],
            actionSteps: [
              'Task and deliverables have been removed from the project workspace.',
              'Check updated project progress in the Faculty Portal.'
            ],
            alertType: 'warning'
          });

          await notifyUser({
            userId: faculty.id || faculty._id,
            userModel: 'Faculty',
            userRole: 'faculty',
            userEmail: faculty.email,
            userName: faculty.name,
            userPhone: faculty.phone,
            preferences: faculty.notificationPreferences || { inApp: true, email: true },
            projectId: project.id,
            type: `TASK_DELETED_${Date.now()}`,
            title: notifTitle,
            message: notifMsg,
            emailHtml,
            isDirectAction: true,
            force: true
          });
        }
      }
    }

    res.json({
      success: true,
      message: 'Task deleted successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete task.', error: err.message });
  }
});

module.exports = router;
