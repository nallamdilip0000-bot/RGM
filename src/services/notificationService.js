const { Notifications } = require('./dbService');
const { sendEmail, generateProfessionalEmailTemplate } = require('./emailService');

/**
 * Dispatch a notification across configured channels (in-app, email)
 * with strict duplicate prevention and user preference checks using Firebase.
 *
 * Rules:
 * 1. Direct operational events (e.g., Team Leader assigning tasks 'TASK_ASSIGNED')
 *    are dispatched immediately for EVERY task without daily cap or gap interval spacing.
 * 2. Automated deadline reminders ('TASK_REMINDER_*', 'MILESTONE_REMINDER_*')
 *    are scheduled for 4 daily checkpoints (Morning, Midday, Evening, Night) and
 *    capped at 4 deadline emails per student per day.
 */
const notifyUser = async ({
  userId,
  userModel = 'User',
  userRole = 'student',
  userEmail,
  userName,
  userPhone,
  preferences = {},
  projectId = null,
  milestoneId = null,
  taskId = null,
  type,
  title,
  message,
  emailHtml = null,
  isDirectAction: explicitDirectAction = null,
  isDeadlineReminder: explicitDeadlineReminder = null,
  slot = null,
  force = false
}) => {
  const results = { inApp: false, email: false };
  const effectiveUserId = userId || userEmail || userPhone || `usr_${Date.now()}`;
  const cleanEmail = userEmail ? userEmail.trim().toLowerCase() : null;

  // Determine notification category
  const isDirectAction = explicitDirectAction !== null
    ? Boolean(explicitDirectAction)
    : Boolean(
        type.startsWith('TASK_ASSIGNED') ||
        type.startsWith('ADDED_TO_PROJECT') ||
        type.startsWith('PROJECT_ASSIGNED') ||
        type.startsWith('PROJECT_APPROVED') ||
        type.startsWith('PROJECT_REJECTED') ||
        type.startsWith('PROJECT_STATUS') ||
        type.startsWith('TASK_DEADLINE_CHANGED') ||
        type.startsWith('TASK_DELETED') ||
        type.startsWith('MILESTONE_DEADLINE_CHANGED') ||
        type.startsWith('MILESTONE_COMPLETED') ||
        type.startsWith('MILESTONE_DELETED') ||
        type.startsWith('PROJECT_DEADLINE_CHANGED') ||
        type.startsWith('DOCUMENT_') ||
        type.startsWith('EVALUATION_')
      );

  const isDeadlineReminder = explicitDeadlineReminder !== null
    ? Boolean(explicitDeadlineReminder)
    : (!isDirectAction && Boolean(
        type.includes('REMINDER') ||
        type.includes('OVERDUE') ||
        type.includes('DEADLINE')
      ));

  // Default preferences fallback if not passed
  const prefs = {
    inApp: preferences.inApp !== false,
    email: preferences.email !== false
  };

  // 1. IN-APP NOTIFICATION
  if (prefs.inApp) {
    try {
      // Check deduplication
      const existing = await Notifications.findOne(n =>
        (String(n.userId) === String(effectiveUserId) || (cleanEmail && n.recipientEmail === cleanEmail)) &&
        n.type === type &&
        n.channel === 'in-app' &&
        (!projectId || String(n.projectId) === String(projectId)) &&
        (!milestoneId || String(n.milestoneId) === String(milestoneId)) &&
        (!taskId || String(n.taskId) === String(taskId))
      );

      if (!existing || force) {
        const notif = await Notifications.create({
          userId: String(effectiveUserId),
          recipientEmail: cleanEmail,
          userModel,
          userRole,
          projectId: projectId ? String(projectId) : null,
          milestoneId: milestoneId ? String(milestoneId) : null,
          taskId: taskId ? String(taskId) : null,
          type,
          channel: 'in-app',
          title: title || 'Notification',
          message,
          status: 'sent',
          read: false,
          isDirectAction,
          isDeadlineReminder,
          slot: slot || null
        });
        results.inApp = notif;
      }
    } catch (err) {
      console.error('[NotificationService] In-App creation failed:', err.message);
    }
  }

  // 2. EMAIL NOTIFICATION
  if (prefs.email && cleanEmail) {
    try {
      const existing = await Notifications.findOne(n =>
        (String(n.userId) === String(effectiveUserId) || n.recipientEmail === cleanEmail) &&
        n.type === type &&
        n.channel === 'email' &&
        ['sent', 'simulated'].includes(n.status) &&
        (!projectId || String(n.projectId) === String(projectId)) &&
        (!milestoneId || String(n.milestoneId) === String(milestoneId)) &&
        (!taskId || String(n.taskId) === String(taskId))
      );

      if (!existing || force) {
        // Slot-based deduplication (type tag: _YYYY-MM-DD_SLOT_X) ensures exactly 4 scheduled checkpoints per day
        // Only throttle if a student has received more than 16 reminder emails today (generous ceiling for heavy task loads)
        if (isDeadlineReminder && !force) {
          const maxDailyDeadlineEmails = parseInt(process.env.MAX_DAILY_DEADLINE_EMAILS || '24', 10);
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);

          const deadlineEmailsSentToday = await Notifications.countSentDeadlineEmailsToday(cleanEmail, startOfToday);
          if (deadlineEmailsSentToday >= maxDailyDeadlineEmails) {
            console.log(`[Deadline Email Safety Cap] Daily deadline safety cap (${maxDailyDeadlineEmails}/day) reached for ${cleanEmail}.`);
            return results;
          }
        }
        // Direct actions (e.g. TASK_ASSIGNED by team leader) bypass daily limits and gap spacing!

        // Build professional HTML if not custom passed
        const finalHtml = emailHtml || generateProfessionalEmailTemplate({
          recipientName: userName || 'Student',
          badgeText: isDirectAction ? 'Task Update' : 'Academic Alert',
          title: title || 'Project Update',
          summaryText: message,
          details: [
            { label: 'Notification', value: title || 'Notice' },
            { label: 'Message', value: message }
          ],
          actionSteps: [
            'Log into your student workspace to review tasks and milestone timelines.',
            'Collaborate with your project team members and mentor.'
          ],
          alertType: 'info'
        });

        const emailRes = await sendEmail({
          to: cleanEmail,
          subject: title || 'Academic Milestone Tracker Alert',
          html: finalHtml,
          text: message
        });

        await Notifications.create({
          userId: String(effectiveUserId),
          recipientEmail: cleanEmail,
          userModel,
          userRole,
          projectId: projectId ? String(projectId) : null,
          milestoneId: milestoneId ? String(milestoneId) : null,
          taskId: taskId ? String(taskId) : null,
          type,
          channel: 'email',
          title: title || 'Email Notification',
          message,
          isDirectAction,
          isDeadlineReminder,
          slot: slot || null,
          status: emailRes.success ? (emailRes.simulated ? 'simulated' : 'sent') : 'failed'
        });
        results.email = true;
      } else {
        console.log(`[Email Deduplicated] Notification of type "${type}" already sent for ${cleanEmail}. Skipping duplicate.`);
      }
    } catch (err) {
      console.error('[NotificationService] Email dispatch failed:', err.message);
    }
  }

  return results;
};

/**
 * Resolves all unique project team members (Leader + Members) from database,
 * generates a personalized professional email template for each, and dispatches multi-channel notification.
 */
const notifyProjectMembers = async ({
  project,
  title,
  message,
  badgeText = 'Project Notification',
  badgeColor = '#2563eb',
  badgeBg = '#eff6ff',
  details = [],
  actionSteps = [],
  buttonText = 'Open Student Portal',
  buttonUrl = null,
  alertType = 'info',
  type = `PROJECT_NOTIFICATION_${Date.now()}`,
  milestoneId = null,
  taskId = null
}) => {
  const { Users, Projects } = require('./dbService');
  const populated = await Projects.populate(project);
  const appUrl = process.env.APP_URL || 'http://localhost:5000';
  const targetUrl = buttonUrl || `${appUrl}/student/index.html?projectId=${project.id || project._id}`;

  const rawMembers = [];
  if (populated.teamLeaderId) rawMembers.push(populated.teamLeaderId);
  if (Array.isArray(populated.teamMemberIds)) rawMembers.push(...populated.teamMemberIds);
  if (Array.isArray(populated.teamMembers)) rawMembers.push(...populated.teamMembers);
  if (Array.isArray(project.teamMemberIds)) rawMembers.push(...project.teamMemberIds);
  if (Array.isArray(project.teamMembers)) rawMembers.push(...project.teamMembers);

  const seenKeys = new Set();
  const recipients = [];

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

    const email = (userDoc?.email || member.email || '').trim().toLowerCase();
    const name = userDoc?.name || member.name || 'Student';
    const regNo = userDoc?.registerNumber || member.registerNumber || '';
    const phone = userDoc?.phone || member.phone || '';
    const userId = userDoc?.id || memId || email || regNo;
    const preferences = userDoc?.notificationPreferences || { inApp: true, email: true };

    const dedupeKey = email ? `email:${email}` : (userId ? `id:${userId}` : (regNo ? `reg:${regNo}` : null));
    if (!dedupeKey || seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    recipients.push({ id: userId, name, email, phone, registerNumber: regNo, preferences });
  }

  const results = [];
  for (const r of recipients) {
    const emailHtml = generateProfessionalEmailTemplate({
      headerTitle: 'Rajeev Gandhi Memorial College of Engg. & Tech.',
      headerSubtitle: 'Academic Project Milestone Supervision Portal',
      recipientName: r.name || 'Student Member',
      badgeText,
      badgeColor,
      badgeBg,
      title,
      summaryText: message,
      details,
      actionSteps,
      buttonText,
      buttonUrl: targetUrl,
      alertType
    });

    const res = await notifyUser({
      userId: r.id,
      userModel: 'User',
      userRole: 'student',
      userEmail: r.email,
      userName: r.name,
      userPhone: r.phone,
      preferences: r.preferences,
      projectId: project.id || project._id,
      milestoneId,
      taskId,
      type,
      title,
      message,
      emailHtml,
      isDirectAction: true,
      force: true
    });
    results.push({ recipient: r, res });
  }

  return { recipientsCount: recipients.length, results };
};

module.exports = {
  notifyUser,
  notifyProjectMembers
};
