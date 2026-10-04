const express = require('express');
const router = express.Router();
const { Milestones, Projects, Tasks, Faculty } = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { notifyUser, notifyProjectMembers } = require('../services/notificationService');
const { runDeadlineChecker } = require('../services/deadlineChecker');
const { generateProfessionalEmailTemplate } = require('../services/emailService');
const { recalculateProgress } = require('../services/progressService');

// ==========================================
// 1. CREATE MILESTONE (Firebase)
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const { projectId, name, description, startDate, deadline, status } = req.body;

    if (!projectId || !name || !startDate || !deadline) {
      return res.status(400).json({
        success: false,
        message: 'Project ID, Milestone Name, Start Date, and Deadline are required.'
      });
    }

    const project = await Projects.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const isoDeadline = new Date(deadline).toISOString();
    const milestone = await Milestones.create({
      projectId: String(projectId),
      name: name.trim(),
      description: description ? description.trim() : '',
      startDate: new Date(startDate).toISOString(),
      deadline: isoDeadline,
      allocatedDeadline: isoDeadline,
      previousDeadline: isoDeadline,
      deadlineStatus: 'Approved',
      status: status || 'Not Started',
      progress: 0,
      createdAt: new Date().toISOString()
    });

    // Recalculate project progress
    await recalculateProgress(projectId, milestone.id);

    // Run deadline checker immediately in background
    runDeadlineChecker().catch(e => console.error('Milestone deadline check error:', e.message));

    res.status(201).json({
      success: true,
      message: 'Milestone created successfully.',
      data: milestone
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create milestone.', error: err.message });
  }
});

// ==========================================
// 2. GET MILESTONES FOR A PROJECT
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

    const milestones = await Milestones.findByProject(req.params.projectId);
    res.json({
      success: true,
      data: milestones.sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch milestones.', error: err.message });
  }
});

// ==========================================
// 3. UPDATE MILESTONE (With Offline Faculty Deadline Extension Request)
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, startDate, deadline, status, progress, deadlineChangeReason } = req.body;
    const milestone = await Milestones.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ success: false, message: 'Milestone not found.' });
    }

    const project = await Projects.findById(milestone.projectId);
    const updates = {};
    if (name) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (startDate) updates.startDate = new Date(startDate).toISOString();
    if (status) updates.status = status;
    if (progress !== undefined) updates.progress = Math.min(100, Math.max(0, Number(progress)));

    let isDeadlineChangeRequested = false;
    let oldAllocatedDeadlineStr = 'N/A';
    let newRequestedDeadlineStr = 'N/A';

    // If deadline is modified:
    if (deadline) {
      const newDateStr = new Date(deadline).toISOString().split('T')[0];
      const currentAllocatedIso = milestone.allocatedDeadline || milestone.deadline;
      const currentDateStr = currentAllocatedIso ? new Date(currentAllocatedIso).toISOString().split('T')[0] : '';
      const isDateChanged = Boolean(currentDateStr && newDateStr && currentDateStr !== newDateStr);

      if (isDateChanged) {
        if (req.user.role === 'student') {
          // Student requested a new deadline after offline consultation -> requires faculty approval
          isDeadlineChangeRequested = true;
          updates.previousDeadline = currentAllocatedIso;
          updates.requestedDeadline = new Date(deadline).toISOString();
          updates.deadlineStatus = 'Pending_Approval';
          updates.deadlineChangeReason = deadlineChangeReason ? deadlineChangeReason.trim() : 'Student updated deadline after offline faculty discussion';
          updates.deadlineRequestedBy = req.user.name || req.userDoc?.name || 'Student';
          updates.deadlineRequestedAt = new Date().toISOString();
          // Active deadline remains the previous allocated date until approved!
          updates.deadline = currentAllocatedIso;
          updates.allocatedDeadline = currentAllocatedIso;

          oldAllocatedDeadlineStr = new Date(currentAllocatedIso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          newRequestedDeadlineStr = new Date(deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } else {
          // Faculty or Admin directly changes deadline
          const newIso = new Date(deadline).toISOString();
          updates.deadline = newIso;
          updates.allocatedDeadline = newIso;
          updates.previousDeadline = currentAllocatedIso;
          updates.deadlineStatus = 'Approved';
        }
      }
    }

    const updated = await Milestones.update(req.params.id, updates);

    // If student requested a deadline change, notify the assigned Faculty Guide immediately
    if (isDeadlineChangeRequested && project && project.facultyId) {
      let faculty = project.facultyId;
      if (faculty && (typeof faculty === 'string' || !faculty.email)) {
        faculty = (await Faculty.findById(faculty.id || faculty._id || faculty)) || faculty;
      }

      if (faculty) {
        const studentName = req.user.name || req.userDoc?.name || 'Student';
        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const facultyReviewUrl = `${appUrl}/faculty/?projectId=${project.id}`;
        const notifTitle = `⏳ Deadline Extension Request: "${milestone.name}"`;
        const notifMsg = `${studentName} requested a deadline change for milestone "${milestone.name}" in project "${project.projectName}". Previous allocated deadline: ${oldAllocatedDeadlineStr}, Requested new deadline: ${newRequestedDeadlineStr}. Reason: "${updates.deadlineChangeReason}". Please approve or reject in the Faculty Portal.`;

        const emailHtml = generateProfessionalEmailTemplate({
          headerTitle: 'Rajeev Gandhi Memorial College of Engg. & Tech.',
          headerSubtitle: 'Academic Project Milestone Supervision Portal',
          recipientName: `Prof. ${faculty.name}`,
          badgeText: 'Deadline Approval Required',
          badgeColor: '#ea580c',
          badgeBg: '#fff7ed',
          title: `⏳ Milestone Deadline Change Request: "${milestone.name}"`,
          summaryText: `A student team member has submitted a deadline extension request following offline consultation. Your approval is required to update the milestone schedule.`,
          details: [
            { label: 'Project Name', value: project.projectName, highlight: true },
            { label: 'Milestone', value: milestone.name },
            { label: 'Requested By', value: studentName },
            { label: 'Previous Allocated Date', value: oldAllocatedDeadlineStr, highlight: true },
            { label: 'Requested New Deadline', value: newRequestedDeadlineStr, highlight: true },
            { label: 'Offline Reason / Note', value: updates.deadlineChangeReason }
          ],
          actionSteps: [
            'Log into the Faculty Portal to review the student proposal and project progress.',
            'Approve the extension if the offline discussion is verified.',
            'If rejected, the student must strictly deliver by the previous allocated date.'
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
          milestoneId: milestone.id,
          type: `MILESTONE_DEADLINE_REQUEST_${milestone.id}_${Date.now()}`,
          title: notifTitle,
          message: notifMsg,
          emailHtml,
          isDirectAction: true,
          force: true
        });
      }
    }

    // Recalculate project progress
    await recalculateProgress(milestone.projectId, milestone.id);

    // Run deadline checker in background
    runDeadlineChecker().catch(e => console.error('Milestone update deadline check error:', e.message));

    const responseMsg = isDeadlineChangeRequested
      ? 'Milestone updated. Deadline change request submitted to your Faculty Mentor for approval. (Previous allocated deadline remains active until approved).'
      : 'Milestone updated successfully.';

    res.json({
      success: true,
      message: responseMsg,
      data: updated,
      isPendingApproval: isDeadlineChangeRequested
    });
  } catch (err) {
    console.error('Milestone Update Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update milestone.', error: err.message });
  }
});

// ==========================================
// 4. FACULTY DEADLINE DECISION (Approve or Reject Extension)
// ==========================================
router.put('/:id/deadline-decision', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const { decision, remarks } = req.body; // decision: 'Approved' | 'Rejected'
    const milestone = await Milestones.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ success: false, message: 'Milestone not found.' });
    }

    const project = await Projects.findById(milestone.projectId);
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
    const previousDate = milestone.previousDeadline || milestone.allocatedDeadline || milestone.deadline;
    const requestedDate = milestone.requestedDeadline || milestone.deadline;
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

    const updated = await Milestones.update(milestone.id, updates);

    const prevDateStr = new Date(previousDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const newDateStr = new Date(requestedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Notify all student project members
    const notifTitle = isApproved
      ? `🎉 Milestone Deadline Approved: "${milestone.name}"`
      : `⚠️ Milestone Deadline Request Rejected: "${milestone.name}"`;

    const notifMsg = isApproved
      ? `Great news! Faculty Guide Prof. ${facultyName} approved your requested deadline for milestone "${milestone.name}". Your new deadline is ${newDateStr}.`
      : `Notice: Faculty Guide Prof. ${facultyName} has rejected your deadline extension request for milestone "${milestone.name}". You must submit on the PREVIOUS ALLOCATED DATE: ${prevDateStr}.${remarks ? ` Mentor Remarks: "${remarks}".` : ''}`;

    const emailDetails = [
      { label: 'Project Name', value: project.projectName, highlight: true },
      { label: 'Milestone', value: milestone.name },
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
          `Your new approved deadline for milestone "${milestone.name}" is ${newDateStr}.`,
          'Coordinate with all team members to deliver by this target date.',
          'Submit task deliverables before the cutoff.'
        ]
      : [
          `IMPORTANT: You must submit milestone "${milestone.name}" by the original deadline: ${prevDateStr}.`,
          'Review the faculty remarks provided above.',
          'Accelerate milestone task completion to meet the required deadline.'
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
      type: `MILESTONE_DECISION_${milestone.id}_${Date.now()}`,
      milestoneId: milestone.id
    });

    // Recalculate project progress
    await recalculateProgress(milestone.projectId, milestone.id);

    res.json({
      success: true,
      message: isApproved
        ? `Milestone deadline approved (${newDateStr}). Team members notified via email.`
        : `Milestone deadline extension rejected. Team instructed to submit on previous date (${prevDateStr}).`,
      data: updated
    });
  } catch (err) {
    console.error('Milestone Deadline Decision Error:', err);
    res.status(500).json({ success: false, message: 'Failed to process deadline decision.', error: err.message });
  }
});

// ==========================================
// 5. DELETE MILESTONE
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const milestone = await Milestones.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ success: false, message: 'Milestone not found.' });
    }

    // Delete tasks under this milestone
    const tasks = await Tasks.findByMilestone(milestone.id);
    for (const t of tasks) {
      await Tasks.delete(t.id);
    }
    await Milestones.delete(milestone.id);

    // If student deleted milestone, notify faculty
    if (req.user.role === 'student') {
      const project = await Projects.findById(milestone.projectId);
      if (project && project.facultyId) {
        let faculty = project.facultyId;
        if (faculty && (typeof faculty === 'string' || !faculty.email)) {
          faculty = (await Faculty.findById(faculty.id || faculty._id || faculty)) || faculty;
        }

        if (faculty) {
          const studentName = req.user.name || req.userDoc?.name || 'Student / Team Leader';
          await notifyUser({
            userId: faculty.id || faculty._id,
            userModel: 'Faculty',
            userRole: 'faculty',
            userEmail: faculty.email,
            userName: faculty.name,
            userPhone: faculty.phone,
            preferences: faculty.notificationPreferences || { inApp: true, email: true },
            projectId: project.id,
            type: `MILESTONE_DELETED_${Date.now()}`,
            title: `🗑️ Milestone Deleted: "${milestone.name}"`,
            message: `Notice: ${studentName} deleted milestone "${milestone.name}" from project "${project.projectName}".`,
            isDirectAction: true,
            force: true
          });
        }
      }
    }

    // Recalculate project progress after deletion
    await recalculateProgress(milestone.projectId);

    res.json({
      success: true,
      message: 'Milestone and associated tasks deleted.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete milestone.', error: err.message });
  }
});

module.exports = router;
