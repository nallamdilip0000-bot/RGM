const { Tasks, Milestones, Projects, Users } = require('./dbService');
const { notifyUser } = require('./notificationService');
const { generateProfessionalEmailTemplate } = require('./emailService');

/**
 * 4 Daily Deadline Checkpoint Slots
 */
const DEADLINE_CHECK_SLOTS = [
  {
    slot: 1,
    name: 'Morning Checkpoint',
    time: '08:00 AM',
    slotTag: 'SLOT_1',
    headerTitle: '🌅 Morning Milestone & Task Deadline Briefing',
    greetingBadge: 'Morning Checkpoint (1/4)'
  },
  {
    slot: 2,
    name: 'Midday Checkpoint',
    time: '12:00 PM',
    slotTag: 'SLOT_2',
    headerTitle: '☀️ Midday Milestone & Task Progress Review',
    greetingBadge: 'Midday Checkpoint (2/4)'
  },
  {
    slot: 3,
    name: 'Evening Checkpoint',
    time: '04:00 PM',
    slotTag: 'SLOT_3',
    headerTitle: '🌇 Evening Milestone & Task Submission Notice',
    greetingBadge: 'Evening Checkpoint (3/4)'
  },
  {
    slot: 4,
    name: 'Night Cutoff Checkpoint',
    time: '08:00 PM',
    slotTag: 'SLOT_4',
    headerTitle: '🌙 Night Cutoff Milestone & Task Alert',
    greetingBadge: 'Night Cutoff (4/4)'
  }
];

/**
 * Returns the appropriate deadline checkpoint slot based on current hour
 * 00:00 - 09:59 -> Slot 1 (08:00 AM Morning)
 * 10:00 - 13:59 -> Slot 2 (12:00 PM Midday)
 * 14:00 - 17:59 -> Slot 3 (04:00 PM Evening)
 * 18:00 - 23:59 -> Slot 4 (08:00 PM Night)
 */
function getCurrentDeadlineSlot(date = new Date(), explicitSlot = null) {
  if (explicitSlot) {
    const sNum = parseInt(explicitSlot, 10);
    const found = DEADLINE_CHECK_SLOTS.find(s => s.slot === sNum);
    if (found) return found;
  }
  // Convert to IST (UTC + 5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60000) + istOffset);
  const hour = istDate.getHours();
  if (hour < 10) return DEADLINE_CHECK_SLOTS[0];
  if (hour < 14) return DEADLINE_CHECK_SLOTS[1];
  if (hour < 18) return DEADLINE_CHECK_SLOTS[2];
  return DEADLINE_CHECK_SLOTS[3];
}

/**
 * Calculates calendar day difference between target date and base date using IST calendar.
 * > 0: In future (e.g. +1 means tomorrow)
 * = 0: Today
 * < 0: Overdue (in past)
 */
function getCalendarDayDiff(targetDate, baseDate = new Date()) {
  if (!targetDate) return null;
  const target = new Date(targetDate);
  if (isNaN(target.getTime())) return null;

  const istOffset = 5.5 * 60 * 60 * 1000;
  const targetIST = new Date(target.getTime() + (target.getTimezoneOffset() * 60000) + istOffset);
  const baseIST = new Date(baseDate.getTime() + (baseDate.getTimezoneOffset() * 60000) + istOffset);

  const targetYMD = new Date(targetIST.getFullYear(), targetIST.getMonth(), targetIST.getDate());
  const baseYMD = new Date(baseIST.getFullYear(), baseIST.getMonth(), baseIST.getDate());

  const diffMs = targetYMD.getTime() - baseYMD.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formats date into readable string (e.g., "Saturday, 26 Sep 2026")
 */
function formatReadableDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return String(dateStr);
  }
}

/**
 * Scans incomplete Milestones and Tasks in Firebase and triggers 4 daily deadline emails.
 * Multi-channel alerts (Email, In-App) are dispatched with checkpoint slot deduplication.
 *
 * @param {Object} options { slot: 1|2|3|4, force: boolean }
 */
const runDeadlineChecker = async (options = {}) => {
  const now = new Date();
  const currentSlot = getCurrentDeadlineSlot(now, options.slot);
  const todayDateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const slotSuffix = options.force ? `_FORCED_${Date.now()}` : `_${todayDateStr}_${currentSlot.slotTag}`;

  console.log(`[DeadlineChecker] Running Slot ${currentSlot.slot} (${currentSlot.name} - ${currentSlot.time}) for ${todayDateStr}...`);
  const appUrl = process.env.APP_URL || 'http://localhost:5000';

  let processedMilestones = 0;
  let processedTasks = 0;
  let notificationsTriggered = 0;

  // =========================================================================
  // 1. CHECK MILESTONES DEADLINES (Alert ALL team members in the project)
  // =========================================================================
  try {
    const milestones = await Milestones.listAll(m => m.status !== 'Completed');

    for (const milestone of milestones) {
      if (!milestone.deadline || !milestone.projectId) continue;
      processedMilestones++;

      const project = await Projects.findById(milestone.projectId);
      if (!project) continue;

      const projectName = project.projectName || 'Academic Project';
      const deadlineStr = formatReadableDate(milestone.deadline);
      const diffDays = getCalendarDayDiff(milestone.deadline, now);
      if (diffDays === null) continue;

      const projectUrl = `${appUrl}/student/index.html?projectId=${project.id || project._id}`;

      let baseReminderType = null;
      let reminderTitle = '';
      let reminderMsg = '';
      let badgeText = '';
      let badgeColor = '#2563eb';
      let badgeBg = '#eff6ff';
      let alertType = 'info';
      let actionSteps = [];

      if (diffDays <= 3 && diffDays > 1) {
        baseReminderType = 'MILESTONE_REMINDER_3DAY';
        reminderTitle = `⏳ [${currentSlot.name}] 3-Day Reminder: Milestone "${milestone.name}"`;
        reminderMsg = `Milestone "${milestone.name}" in project "${projectName}" is due in ${diffDays} days (${deadlineStr}). Please coordinate deliverables with your team.`;
        badgeText = `⏳ ${diffDays} Days Remaining • ${currentSlot.greetingBadge}`;
        badgeColor = '#4f46e5';
        badgeBg = '#eef2ff';
        alertType = 'info';
        actionSteps = [
          'Review all pending milestone tasks and ensure assigned members are on track.',
          'Upload deliverables, code repositories, or progress reports before the cutoff date.',
          'Schedule a team check-in to clear any remaining blockers.'
        ];
      } else if (diffDays === 1) {
        baseReminderType = 'MILESTONE_REMINDER_1DAY';
        reminderTitle = `⚠️ [${currentSlot.name}] Tomorrow Deadline: Milestone "${milestone.name}"`;
        reminderMsg = `Urgent: Milestone "${milestone.name}" in project "${projectName}" is due tomorrow (${deadlineStr}). Please submit completed work.`;
        badgeText = `⚠️ Due Tomorrow • ${currentSlot.greetingBadge}`;
        badgeColor = '#ea580c';
        badgeBg = '#fff7ed';
        alertType = 'warning';
        actionSteps = [
          'Submit and mark all milestone tasks as Completed in your portal.',
          'Ensure documentation and code are verified with your team leader.',
          'Notify your faculty mentor once milestone deliverables are finalized.'
        ];
      } else if (diffDays === 0) {
        baseReminderType = 'MILESTONE_REMINDER_DEADLINE';
        reminderTitle = `🚨 [${currentSlot.name}] Milestone Deadline Today: "${milestone.name}"`;
        reminderMsg = `Action Required: Milestone "${milestone.name}" in project "${projectName}" is due TODAY (${deadlineStr}). Submit all milestone deliverables immediately.`;
        badgeText = `🚨 Due Today • ${currentSlot.greetingBadge}`;
        badgeColor = '#dc2626';
        badgeBg = '#fef2f2';
        alertType = 'danger';
        actionSteps = [
          'Action Required: Finalize all task submissions in the portal today.',
          'Verify that all team members have completed their individual allocations.',
          'Reach out to your faculty guide immediately if you require submission assistance.'
        ];
      } else if (diffDays < 0) {
        if (milestone.status !== 'Delayed' && milestone.status !== 'Overdue') {
          await Milestones.update(milestone.id || milestone._id, { status: 'Delayed' });
        }
        baseReminderType = 'MILESTONE_OVERDUE';
        reminderTitle = `❌ [${currentSlot.name}] Milestone Overdue: "${milestone.name}"`;
        reminderMsg = `Alert: Milestone "${milestone.name}" in project "${projectName}" was due on ${deadlineStr} and is now OVERDUE. Please contact your faculty guide.`;
        badgeText = `❌ Overdue Milestone • ${currentSlot.greetingBadge}`;
        badgeColor = '#991b1b';
        badgeBg = '#fef2f2';
        alertType = 'danger';
        actionSteps = [
          'Urgent: Contact your assigned faculty mentor regarding overdue milestone status.',
          'Submit pending items as soon as possible to avoid academic grade deductions.',
          'Update task completion status in the student portal.'
        ];
      }

      if (baseReminderType) {
        const reminderType = `${baseReminderType}${slotSuffix}`;

        // Collect all team members with deduplication by email/ID
        const rawMembers = Array.isArray(project.teamMemberIds) && project.teamMemberIds.length > 0
          ? project.teamMemberIds
          : (Array.isArray(project.teamMembers) ? project.teamMembers : []);

        const uniqueRecipients = [];
        const seenEmails = new Set();

        // Ensure Team Leader is always explicitly added
        if (project.teamLeaderId) {
          const leaderDoc = await Users.findById(project.teamLeaderId);
          if (leaderDoc) {
            const leaderEmail = (leaderDoc.email || '').trim().toLowerCase();
            const dedupeKey = leaderEmail ? `email:${leaderEmail}` : `id:${leaderDoc.id}`;
            if (!seenEmails.has(dedupeKey)) {
              seenEmails.add(dedupeKey);
              uniqueRecipients.push({
                id: leaderDoc.id,
                name: leaderDoc.name || 'Team Leader',
                email: leaderEmail,
                phone: leaderDoc.phone || '',
                notificationPreferences: leaderDoc.notificationPreferences
              });
            }
          }
        }

        for (const member of rawMembers) {
          if (!member) continue;
          let studentEmail = (member.email || '').trim().toLowerCase();
          let studentName = member.name || 'Student';
          let studentPhone = member.phone || '';
          let studentId = member.id || member._id || member.registerNumber;

          // If email is missing, lookup student by registerNumber or ID
          if (!studentEmail && member.registerNumber) {
            const userDoc = await Users.findByRegisterNumber(member.registerNumber);
            if (userDoc) {
              studentEmail = (userDoc.email || '').trim().toLowerCase();
              studentName = userDoc.name || studentName;
              studentPhone = userDoc.phone || studentPhone;
              studentId = userDoc.id || studentId;
            }
          } else if (!studentEmail && studentId && !String(studentId).startsWith('mem_')) {
            const userDoc = await Users.findById(studentId);
            if (userDoc) {
              studentEmail = (userDoc.email || '').trim().toLowerCase();
              studentName = userDoc.name || studentName;
              studentPhone = userDoc.phone || studentPhone;
            }
          }

          const dedupeKey = studentEmail ? `email:${studentEmail}` : `id:${studentId}`;
          if (!seenEmails.has(dedupeKey)) {
            seenEmails.add(dedupeKey);
            uniqueRecipients.push({
              id: studentId,
              name: studentName,
              email: studentEmail,
              phone: studentPhone,
              notificationPreferences: member.notificationPreferences
            });
          }
        }

        for (const member of uniqueRecipients) {
          const prefs = member.notificationPreferences || { inApp: true, email: true };

          if (member.email || member.phone || member.id) {
            // Generate professional email HTML
            const emailHtml = generateProfessionalEmailTemplate({
              headerTitle: currentSlot.headerTitle,
              headerSubtitle: `Milestone Deadline Notification (${currentSlot.name} - ${currentSlot.time})`,
              recipientName: member.name,
              badgeText,
              badgeColor,
              badgeBg,
              title: reminderTitle,
              summaryText: reminderMsg,
              details: [
                { label: 'Project Name', value: projectName, highlight: true },
                { label: 'Milestone', value: milestone.name },
                { label: 'Milestone Deadline', value: deadlineStr, highlight: diffDays <= 1 },
                { label: 'Current Status', value: milestone.status || 'In Progress' },
                { label: 'Daily Checkpoint', value: `${currentSlot.greetingBadge} at ${currentSlot.time}` }
              ],
              actionSteps,
              buttonText: 'View Milestone in Student Portal',
              buttonUrl: projectUrl,
              alertType
            });

            const res = await notifyUser({
              userId: member.id,
              userModel: 'User',
              userRole: 'student',
              userEmail: member.email,
              userName: member.name,
              userPhone: member.phone,
              preferences: prefs,
              projectId: project.id || project._id,
              milestoneId: milestone.id || milestone._id,
              type: reminderType,
              title: reminderTitle,
              message: reminderMsg,
              emailHtml,
              isDeadlineReminder: true,
              slot: currentSlot.slot,
              force: Boolean(options.force)
            });

            if (res.inApp || res.email) {
              notificationsTriggered++;
            }
          }
        }
      }
    }
  } catch (mErr) {
    console.error('[DeadlineChecker] Milestone check error:', mErr.message);
  }

  // =========================================================================
  // 2. CHECK TASKS DEADLINES (Alert assigned student & team leader)
  // =========================================================================
  try {
    const rawTasks = await Tasks.listAll(t => t.status !== 'Completed');
    // Sort tasks by nearest deadline first
    const tasks = rawTasks.sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));

    for (const task of tasks) {
      if (!task.deadline || !task.assignedTo) continue;
      processedTasks++;

      const project = task.projectId ? await Projects.findById(task.projectId) : null;
      const projectName = project ? project.projectName : 'Assigned Project';

      const diffDays = getCalendarDayDiff(task.deadline, now);
      if (diffDays === null) continue;

      const deadlineStr = formatReadableDate(task.deadline);
      const projectUrl = `${appUrl}/student/index.html?projectId=${project?.id || project?._id || ''}`;

      let baseReminderType = null;
      let reminderTitle = '';
      let reminderMsg = '';
      let badgeText = '';
      let badgeColor = '#2563eb';
      let badgeBg = '#eff6ff';
      let alertType = 'info';
      let actionSteps = [];

      if (diffDays <= 3 && diffDays > 1) {
        baseReminderType = 'TASK_REMINDER_3DAY';
        reminderTitle = `⏳ [${currentSlot.name}] 3-Day Reminder: Task "${task.name}"`;
        reminderMsg = `Task "${task.name}" in project "${projectName}" is due in ${diffDays} days (${deadlineStr}). Priority: ${task.priority || 'Medium'}.`;
        badgeText = `⏳ ${diffDays} Days Remaining • ${currentSlot.greetingBadge}`;
        badgeColor = '#4f46e5';
        badgeBg = '#eef2ff';
        alertType = 'info';
        actionSteps = [
          'Review the task description and requirements in the student portal.',
          'Complete your deliverables and commit code / documents.',
          'Coordinate with your team leader if you need additional time or support.'
        ];
      } else if (diffDays === 1) {
        baseReminderType = 'TASK_REMINDER_1DAY';
        reminderTitle = `⚠️ [${currentSlot.name}] Tomorrow Deadline: Task "${task.name}"`;
        reminderMsg = `Urgent: Task "${task.name}" in project "${projectName}" is due tomorrow (${deadlineStr}). Please submit your progress.`;
        badgeText = `⚠️ Due Tomorrow • ${currentSlot.greetingBadge}`;
        badgeColor = '#ea580c';
        badgeBg = '#fff7ed';
        alertType = 'warning';
        actionSteps = [
          'Finalize all task files and push completed work to the repository.',
          'Mark this task as "Completed" in your student portal.',
          'Notify your team that the task is ready for review.'
        ];
      } else if (diffDays === 0) {
        baseReminderType = 'TASK_REMINDER_DEADLINE';
        reminderTitle = `🚨 [${currentSlot.name}] Task Deadline Today: "${task.name}"`;
        reminderMsg = `Action Required: Task "${task.name}" in project "${projectName}" is due TODAY (${deadlineStr}). Submit your work now.`;
        badgeText = `🚨 Due Today • ${currentSlot.greetingBadge}`;
        badgeColor = '#dc2626';
        badgeBg = '#fef2f2';
        alertType = 'danger';
        actionSteps = [
          'Immediate action: Submit task deliverables before midnight.',
          'Update task status to "Completed" or "In Review".',
          'Contact your mentor or team leader if you encounter technical blockers.'
        ];
      } else if (diffDays < 0) {
        if (task.status !== 'Overdue') {
          await Tasks.update(task.id || task._id, { status: 'Overdue' });
        }
        baseReminderType = 'TASK_OVERDUE';
        reminderTitle = `❌ [${currentSlot.name}] Task Overdue: "${task.name}"`;
        reminderMsg = `Alert: Task "${task.name}" in project "${projectName}" was due on ${deadlineStr} and is now OVERDUE.`;
        badgeText = `❌ Task Overdue • ${currentSlot.greetingBadge}`;
        badgeColor = '#991b1b';
        badgeBg = '#fef2f2';
        alertType = 'danger';
        actionSteps = [
          'Urgent: Complete and submit this overdue task immediately.',
          'Provide a brief status update to your team leader and faculty mentor.',
          'Update task status in the portal once submitted.'
        ];
      }

      if (baseReminderType) {
        const reminderType = `${baseReminderType}${slotSuffix}`;

        // Collect all team members and assigned members with strict deduplication
        const uniqueRecipients = [];
        const seenEmails = new Set();

        const addCandidate = async (m) => {
          if (!m) return;
          let email = (m.email || '').trim().toLowerCase();
          let name = m.name || 'Student';
          let phone = m.phone || '';
          let id = m.id || m._id || m.registerNumber;

          // If email is missing, lookup student by registerNumber or ID
          if (!email && m.registerNumber) {
            const userDoc = await Users.findByRegisterNumber(m.registerNumber);
            if (userDoc) {
              email = (userDoc.email || '').trim().toLowerCase();
              name = userDoc.name || name;
              phone = userDoc.phone || phone;
              id = userDoc.id || id;
            }
          } else if (!email && id && !String(id).startsWith('mem_')) {
            const userDoc = await Users.findById(id);
            if (userDoc) {
              email = (userDoc.email || '').trim().toLowerCase();
              name = userDoc.name || name;
              phone = userDoc.phone || phone;
            }
          }

          const dedupeKey = email ? `email:${email}` : `id:${id}`;
          if (!seenEmails.has(dedupeKey)) {
            seenEmails.add(dedupeKey);
            uniqueRecipients.push({
              id,
              name,
              email,
              phone,
              notificationPreferences: m.notificationPreferences
            });
          }
        };

        // Add Team Leader
        if (project && project.teamLeaderId) {
          const leaderDoc = await Users.findById(project.teamLeaderId);
          if (leaderDoc) {
            await addCandidate({
              id: leaderDoc.id,
              name: leaderDoc.name || 'Team Leader',
              email: leaderDoc.email,
              phone: leaderDoc.phone || '',
              notificationPreferences: leaderDoc.notificationPreferences
            });
          }
        }

        // Add Assigned Members
        if (Array.isArray(task.assignedMembers) && task.assignedMembers.length > 0) {
          for (const member of task.assignedMembers) {
            await addCandidate(member);
          }
        } else if (task.assignedTo && typeof task.assignedTo === 'object') {
          await addCandidate(task.assignedTo);
        } else if (task.assignedTo === 'ALL' && project && Array.isArray(project.teamMemberIds)) {
          for (const member of project.teamMemberIds) {
            await addCandidate(member);
          }
        }

        for (const member of uniqueRecipients) {
          const prefs = member.notificationPreferences || { inApp: true, email: true };

          if (member.email || member.phone || member.id) {
            // Generate professional email HTML
            const emailHtml = generateProfessionalEmailTemplate({
              headerTitle: currentSlot.headerTitle,
              headerSubtitle: `Task Deadline Notice (${currentSlot.name} - ${currentSlot.time})`,
              recipientName: member.name,
              badgeText,
              badgeColor,
              badgeBg,
              title: reminderTitle,
              summaryText: reminderMsg,
              details: [
                { label: 'Project Name', value: projectName, highlight: true },
                { label: 'Task Name', value: task.name },
                { label: 'Task Deadline', value: deadlineStr, highlight: diffDays <= 1 },
                { label: 'Priority Level', value: task.priority || 'Medium' },
                { label: 'Current Status', value: task.status || 'To Do' },
                { label: 'Daily Checkpoint', value: `${currentSlot.greetingBadge} at ${currentSlot.time}` }
              ],
              actionSteps,
              buttonText: 'Open Task in Student Portal',
              buttonUrl: projectUrl,
              alertType
            });

            const dispatchRes = await notifyUser({
              userId: member.id,
              userModel: 'User',
              userRole: 'student',
              userEmail: member.email,
              userName: member.name,
              userPhone: member.phone,
              preferences: prefs,
              projectId: project?.id || project?._id,
              taskId: task.id || task._id,
              milestoneId: task.milestoneId?.id || task.milestoneId?._id || task.milestoneId || null,
              type: reminderType,
              title: reminderTitle,
              message: reminderMsg,
              emailHtml,
              isDeadlineReminder: true,
              slot: currentSlot.slot,
              force: Boolean(options.force)
            });

            if (dispatchRes.inApp || dispatchRes.email) {
              notificationsTriggered++;
            }
          }
        }
      }
    }
  } catch (tErr) {
    console.error('[DeadlineChecker] Task check error:', tErr.message);
  }

  console.log(`[DeadlineChecker] Completed Slot ${currentSlot.slot} (${currentSlot.name}). Milestones: ${processedMilestones}, Tasks: ${processedTasks}, Notifications sent: ${notificationsTriggered}`);
  return {
    success: true,
    slot: currentSlot,
    processedMilestones,
    processedTasks,
    notificationsTriggered,
    date: todayDateStr,
    timestamp: now
  };
};

module.exports = {
  runDeadlineChecker,
  getCurrentDeadlineSlot,
  DEADLINE_CHECK_SLOTS,
  getCalendarDayDiff
};
