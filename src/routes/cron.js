const express = require('express');
const router = express.Router();
const { runDeadlineChecker, getCurrentDeadlineSlot, DEADLINE_CHECK_SLOTS } = require('../services/deadlineChecker');
const { Notifications } = require('../services/dbService');

// Middleware to optionally check cron secret
const verifyCronSecret = (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-cron-secret'] !== cronSecret && req.query.secret !== cronSecret) {
    return res.status(401).json({ success: false, message: 'Unauthorized cron invocation.' });
  }
  next();
};

/**
 * 1. GET /api/cron/check-deadlines
 * Trigger deadline check for current or specified slot (Slot 1: 08:00 AM, Slot 2: 12:00 PM, Slot 3: 04:00 PM, Slot 4: 08:00 PM)
 */
router.get('/check-deadlines', verifyCronSecret, async (req, res) => {
  try {
    const slot = req.query.slot ? parseInt(req.query.slot, 10) : null;
    const force = req.query.force === 'true';

    const result = await runDeadlineChecker({ slot, force });
    res.json({
      success: true,
      message: `Deadline checker executed successfully for ${result.slot?.name || 'current slot'}.`,
      result
    });
  } catch (err) {
    console.error('Cron Execution Error:', err);
    res.status(500).json({ success: false, message: 'Cron execution failed.', error: err.message });
  }
});

/**
 * 2. GET /api/cron/slots-status
 * Inspect the 4 daily deadline slots execution status and email counts for today
 */
router.get('/slots-status', verifyCronSecret, async (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentActiveSlot = getCurrentDeadlineSlot(now);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const allNotifsToday = await Notifications.listAllLogs(500);
    const deadlineNotifsToday = allNotifsToday.filter(n => {
      const created = new Date(n.createdAt);
      return created >= startOfToday && (n.isDeadlineReminder || (n.type && (n.type.includes('REMINDER') || n.type.includes('OVERDUE'))));
    });

    const slotsReport = DEADLINE_CHECK_SLOTS.map(slot => {
      const slotTag = slot.slotTag;
      const slotNotifs = deadlineNotifsToday.filter(n => (n.slot === slot.slot) || (n.type && n.type.includes(slotTag)));
      const emailsSent = slotNotifs.filter(n => n.channel === 'email' && ['sent', 'simulated'].includes(n.status)).length;
      const inAppSent = slotNotifs.filter(n => n.channel === 'in-app').length;

      return {
        slotNumber: slot.slot,
        name: slot.name,
        scheduledTime: slot.time,
        isCurrentActiveSlot: currentActiveSlot.slot === slot.slot,
        emailsSentToday: emailsSent,
        inAppNotificationsSent: inAppSent,
        hasRunToday: slotNotifs.length > 0
      };
    });

    res.json({
      success: true,
      date: todayStr,
      currentSlot: currentActiveSlot,
      maxDailyEmailsPerStudent: parseInt(process.env.MAX_DAILY_DEADLINE_EMAILS || '4', 10),
      totalDeadlineNotificationsToday: deadlineNotifsToday.length,
      slots: slotsReport
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve slot status.', error: err.message });
  }
});

/**
 * 3. POST /api/cron/run-slot/:slot
 * Trigger a specific slot manually (slot: 1, 2, 3, 4)
 */
router.post('/run-slot/:slot', verifyCronSecret, async (req, res) => {
  try {
    const slot = parseInt(req.params.slot, 10);
    if (!slot || slot < 1 || slot > 4) {
      return res.status(400).json({ success: false, message: 'Invalid slot number. Must be 1, 2, 3, or 4.' });
    }

    const force = req.query.force !== 'false';
    const result = await runDeadlineChecker({ slot, force });

    res.json({
      success: true,
      message: `Successfully executed deadline check for Slot ${slot} (${result.slot?.name}).`,
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to run slot.', error: err.message });
  }
});

module.exports = router;
