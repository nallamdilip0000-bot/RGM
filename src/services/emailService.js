const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (host && user && pass && pass !== 'app_specific_password_here') {
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    transporter = nodemailer.createTransport({
      pool: !isServerless,
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
    console.log(`Configured SMTP Email Transporter (${isServerless ? 'Direct' : 'Pooled'}) via ${host}:${port}`);
  } else {
    console.info('SMTP credentials not fully set; email service running in development/simulation mode.');
    transporter = null;
  }
  return transporter;
};

/**
 * Send an email notification
 * @param {Object} options { to, subject, html, text }
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const from = process.env.EMAIL_FROM || '"Personal Project Milestone Tracker" <notifications@collegemilestones.edu>';
  const activeTransporter = getTransporter();

  if (activeTransporter) {
    try {
      const info = await activeTransporter.sendMail({
        from,
        to,
        subject,
        text: text || html.replace(/<[^>]+>/g, ''),
        html
      });
      console.log(`[Email Sent] MessageId: ${info.messageId} to ${to}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`[Email Error] Failed to send email to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  } else {
    console.log(`\n================== [SIMULATED EMAIL DISPATCH] ==================`);
    console.log(`To: ${to}`);
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
const sendProjectAssignedEmail = async ({ facultyEmail, facultyName, projectName, teamLeaderName, teamMembers = [], deadline, projectId }) => {
  const appUrl = process.env.APP_URL || 'http://localhost:5000';
  const projectLink = `${appUrl}/faculty/index.html?projectId=${projectId}`;

  const subject = `📌 New Academic Project Assigned: "${projectName}"`;
  const membersList = teamMembers.map(m => `${m.name} (${m.registerNumber || 'Student'})`).join(', ');

  const html = generateProfessionalEmailTemplate({
    headerTitle: 'Academic Faculty Mentorship Portal',
    headerSubtitle: 'New Project Allocation Alert',
    recipientName: `Prof. ${facultyName}`,
    badgeText: 'New Project Assigned',
    badgeColor: '#2563eb',
    badgeBg: '#eff6ff',
    title: subject,
    summaryText: `A new student project has been submitted and assigned to you for mentorship, progress reviews, and milestone evaluation.`,
    details: [
      { label: 'Project Name', value: projectName, highlight: true },
      { label: 'Team Leader', value: teamLeaderName },
      { label: 'Team Members', value: membersList || 'Team members assigned' },
      { label: 'Final Deadline', value: new Date(deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
    ],
    actionSteps: [
      'Log into the Faculty Portal to review project domain and timeline.',
      'Check upcoming milestones and schedule evaluation reviews with the student team.',
      'Provide continuous guidance through the milestone tracking workspace.'
    ],
    buttonText: 'View Project in Faculty Portal',
    buttonUrl: projectLink,
    alertType: 'info'
  });

  return sendEmail({ to: facultyEmail, subject, html });
};

module.exports = {
  sendEmail,
  sendProjectAssignedEmail,
  generateProfessionalEmailTemplate
};
