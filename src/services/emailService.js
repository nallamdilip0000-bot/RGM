const nodemailer = require('nodemailer');

let transporter = null;

const createTransporterInstance = () => {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (host && user && pass && pass !== 'app_specific_password_here') {
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    return nodemailer.createTransport({
      pool: !isServerless,
      maxConnections: 5,
      maxMessages: 100,
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }
  return null;
};

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = createTransporterInstance();
  if (transporter) {
    console.log(`Configured SMTP Email Transporter via ${process.env.EMAIL_HOST || 'smtp.gmail.com'}:${process.env.EMAIL_PORT || '587'}`);
  } else {
    console.info('SMTP credentials not fully set; email service running in development/simulation mode.');
  }
  return transporter;
};

/**
 * Send an email notification
 * @param {Object} options { to, subject, html, text }
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (!to || !to.trim()) {
    console.warn('[Email Warning] Attempted to send email without a recipient.');
    return { success: false, error: 'No recipient provided' };
  }

  const cleanTo = to.trim().toLowerCase();
  const from = process.env.EMAIL_FROM || '"Personal Project Milestone Tracker" <notifications@collegemilestones.edu>';
  let activeTransporter = getTransporter();

  if (activeTransporter) {
    try {
      const senderEmail = process.env.EMAIL_USER || from;
      const info = await activeTransporter.sendMail({
        from,
        to: cleanTo,
        replyTo: senderEmail,
        subject,
        text: text || html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        html,
        headers: {
          'X-Entity-Ref-ID': `rgm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          'X-Auto-Response-Suppress': 'OOF, AutoReply'
        }
      });
      console.log(`[Email Sent] MessageId: ${info.messageId} to ${cleanTo}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`[Email Error] Failed to send email to ${cleanTo}:`, err.message);
      // Reset transporter so connection refreshes on next call
      transporter = null;
      return { success: false, error: err.message };
    }
  } else {
    console.log(`\n================== [SIMULATED EMAIL DISPATCH] ==================`);
    console.log(`To: ${cleanTo}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${text || html.replace(/<[^>]+>/g, '')}`);
    console.log(`================================================================\n`);
    return { success: true, simulated: true };
  }
};

/**
 * Generates a polished, responsive HTML email template for students & faculty
 */
const generateProfessionalEmailTemplate = ({
  headerTitle = 'Academic Project Milestone Tracker',
  headerSubtitle = 'Student Notification & Milestone Engine',
  recipientName = 'Student',
  badgeText = 'Reminder',
  badgeColor = '#2563eb', // blue
  badgeBg = '#eff6ff',
  title = 'Important Deadline Update',
  summaryText = '',
  details = [], // [{ label, value, highlight }]
  actionSteps = [],
  buttonText = 'Open Student Portal',
  buttonUrl = '',
  alertType = 'info' // 'info', 'warning', 'danger', 'success'
}) => {
  const appUrl = process.env.APP_URL || 'http://localhost:5000';
  const targetUrl = buttonUrl || `${appUrl}/student/`;

  let headerGradient = 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)';
  let accentColor = '#2563eb';

  if (alertType === 'warning') {
    headerGradient = 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)';
    accentColor = '#ea580c';
  } else if (alertType === 'danger') {
    headerGradient = 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)';
    accentColor = '#dc2626';
  } else if (alertType === 'success') {
    headerGradient = 'linear-gradient(135deg, #065f46 0%, #059669 100%)';
    accentColor = '#059669';
  }

  const detailsRowsHtml = details.map(d => `
    <tr>
      <td style="padding: 10px 14px; font-size: 13.5px; color: #64748b; font-weight: 500; border-bottom: 1px solid #f1f5f9; width: 35%;">
        ${d.label}:
      </td>
      <td style="padding: 10px 14px; font-size: 14px; color: ${d.highlight ? accentColor : '#0f172a'}; font-weight: ${d.highlight ? '700' : '600'}; border-bottom: 1px solid #f1f5f9;">
        ${d.value}
      </td>
    </tr>
  `).join('');

  const actionStepsHtml = actionSteps.length > 0 ? `
    <div style="margin-top: 24px; padding: 16px 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
      <p style="margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">
        💡 Recommended Action Steps:
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 13.5px; line-height: 1.6;">
        ${actionSteps.map(step => `<li style="margin-bottom: 6px;">${step}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;">
    
    <!-- Top Header Banner -->
    <div style="background: ${headerGradient}; padding: 26px 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.2px;">${headerTitle}</h1>
      <p style="margin: 4px 0 0; font-size: 13px; color: #e2e8f0; opacity: 0.95;">${headerSubtitle}</p>
    </div>

    <!-- Main Content Body -->
    <div style="padding: 28px 24px;">
      
      <!-- Status Badge & Greeting -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <span style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid ${badgeColor}33;">
          ${badgeText}
        </span>
      </div>

      <h2 style="margin: 0 0 12px; font-size: 18px; color: #0f172a; font-weight: 700;">
        Hello, ${recipientName}
      </h2>

      <p style="margin: 0 0 20px; font-size: 14.5px; line-height: 1.6; color: #334155;">
        ${summaryText}
      </p>

      <!-- Details Table Box -->
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <tbody>
            ${detailsRowsHtml}
          </tbody>
        </table>
      </div>

      ${actionStepsHtml}

      <!-- Call to Action Button -->
      <div style="text-align: center; margin: 32px 0 12px;">
        <a href="${targetUrl}" style="display: inline-block; background: ${accentColor}; color: #ffffff; text-decoration: none; font-size: 14.5px; font-weight: 700; padding: 13px 32px; border-radius: 8px; box-shadow: 0 4px 12px ${accentColor}40; letter-spacing: 0.2px;">
          ${buttonText} &rarr;
        </a>
      </div>

    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; line-height: 1.5;">
      <p style="margin: 0 0 4px; font-weight: 600; color: #475569;">
        Personal Project Milestone Tracker
      </p>
      <p style="margin: 0;">
        Automated academic progress notification. Please do not reply directly to this automated email.
      </p>
    </div>

  </div>
</body>
</html>
  `;
};

/**
 * Format faculty project assignment email
 */
const sendProjectAssignedEmail = async ({ facultyEmail, facultyName, projectName, domain, teamLeaderName, teamMembers = [], deadline, projectId, department, year }) => {
  const appUrl = process.env.APP_URL || 'http://localhost:5000';
  const projectLink = `${appUrl}/faculty/?projectId=${projectId}&action=review`;

  const subject = `📌 New Academic Project Assigned: "${projectName}"`;
  const membersList = teamMembers.map(m => `${m.name} (${m.registerNumber || 'Student'})`).join(', ');

  const html = generateProfessionalEmailTemplate({
    headerTitle: 'Academic Faculty Mentorship Portal',
    headerSubtitle: 'New Project Allocation & Approval Request',
    recipientName: `Prof. ${facultyName}`,
    badgeText: 'New Project Submission',
    badgeColor: '#2563eb',
    badgeBg: '#eff6ff',
    title: subject,
    summaryText: `A student team led by ${teamLeaderName} has submitted a new project proposal and assigned you as their faculty guide and mentor for milestone supervision.`,
    details: [
      { label: 'Project Name', value: projectName, highlight: true },
      { label: 'Domain / Topic', value: domain || 'General' },
      { label: 'Team Leader', value: teamLeaderName },
      { label: 'Team Members', value: membersList || 'Assigned team members' },
      { label: 'Department & Year', value: `${department || 'CSE'} • ${year || 'III Year'}` },
      { label: 'Final Deadline', value: new Date(deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
    ],
    actionSteps: [
      'Log into the Faculty Portal to review the project scope and milestone breakdown.',
      'Accept & Approve the project or provide revision remarks.',
      'Monitor student progress and evaluate milestone deliverables.'
    ],
    buttonText: 'Review & Approve in Faculty Portal',
    buttonUrl: projectLink,
    alertType: 'info'
  });

  return sendEmail({ to: facultyEmail, subject, html });
};

/**
 * Format team member project addition email
 */
const sendTeamMemberAddedEmail = async ({ studentEmail, studentName, projectName, domain, teamLeaderName, facultyName, deadline, projectId, department, year }) => {
  const appUrl = process.env.APP_URL || 'http://localhost:5000';
  const projectLink = `${appUrl}/student/?projectId=${projectId}`;

  const subject = `👥 Added to New Project Team: "${projectName}"`;

  const html = generateProfessionalEmailTemplate({
    headerTitle: 'Academic Project Milestone Supervision Portal',
    headerSubtitle: 'Student Team Allocation Alert',
    recipientName: studentName || 'Student Member',
    badgeText: 'Team Member Added',
    badgeColor: '#059669',
    badgeBg: '#ecfdf5',
    title: subject,
    summaryText: `Your peer ${teamLeaderName} has added you to their academic project team for the ongoing semester.`,
    details: [
      { label: 'Project Name', value: projectName, highlight: true },
      { label: 'Domain / Topic', value: domain || 'General' },
      { label: 'Team Leader', value: teamLeaderName },
      { label: 'Faculty Guide', value: `Prof. ${facultyName}` },
      { label: 'Final Deadline', value: new Date(deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
      { label: 'Department / Year', value: `${department || 'CSE'} (${year || 'III Year'})` }
    ],
    actionSteps: [
      'Log into the Student Portal to view project milestones and allocated tasks.',
      'Coordinate with your team leader for workload breakdown and initial research.',
      'Track task due dates to maintain on-time milestone delivery.'
    ],
    buttonText: 'Open Project in Student Portal',
    buttonUrl: projectLink,
    alertType: 'success'
  });

  return sendEmail({ to: studentEmail, subject, html });
};

/**
 * Format project creation confirmation email for Team Leader
 */
const sendProjectCreationConfirmationEmail = async ({ leaderEmail, leaderName, projectName, domain, facultyName, teamMembers = [], deadline, projectId, department, year }) => {
  const appUrl = process.env.APP_URL || 'http://localhost:5000';
  const projectLink = `${appUrl}/student/?projectId=${projectId}`;

  const subject = `🚀 Project Proposal Submitted: "${projectName}"`;
  const membersList = teamMembers.map(m => `${m.name} (${m.registerNumber || 'Student'})`).join(', ');

  const html = generateProfessionalEmailTemplate({
    headerTitle: 'Academic Project Milestone Supervision Portal',
    headerSubtitle: 'Project Submission Confirmation',
    recipientName: leaderName || 'Team Leader',
    badgeText: 'Project Submitted',
    badgeColor: '#2563eb',
    badgeBg: '#eff6ff',
    title: subject,
    summaryText: `Your project proposal "${projectName}" has been successfully created and submitted to Prof. ${facultyName} for review and approval.`,
    details: [
      { label: 'Project Name', value: projectName, highlight: true },
      { label: 'Domain / Topic', value: domain || 'General' },
      { label: 'Assigned Faculty Guide', value: `Prof. ${facultyName}` },
      { label: 'Team Members', value: membersList || 'Team members assigned' },
      { label: 'Department / Year', value: `${department || 'CSE'} • ${year || 'III Year'}` },
      { label: 'Final Deadline', value: new Date(deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
    ],
    actionSteps: [
      'Your faculty guide has been notified via email to review and approve your submission.',
      'Once approved, start defining milestones and assigning tasks to your team members.',
      'Maintain continuous communication with your team and faculty mentor.'
    ],
    buttonText: 'View Project in Student Portal',
    buttonUrl: projectLink,
    alertType: 'info'
  });

  return sendEmail({ to: leaderEmail, subject, html });
};

module.exports = {
  sendEmail,
  sendProjectAssignedEmail,
  sendTeamMemberAddedEmail,
  sendProjectCreationConfirmationEmail,
  generateProfessionalEmailTemplate
};
