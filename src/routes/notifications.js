const express = require('express');
const router = express.Router();
const { Notifications, Users, Faculty } = require('../services/dbService');
const { verifyToken } = require('../middleware/auth');

// ==========================================
// 1. GET USER IN-APP NOTIFICATIONS (Firebase)
// ==========================================
router.get('/', verifyToken, async (req, res) => {
  try {
    let notifications = await Notifications.findForUser(
      req.user.id,
      req.user.email,
      req.user.role,
      req.user.registerNumber
    );

    // If student, completely filter out any evaluation, marks, score, or grading notifications
    if (req.user.role === 'student') {
      notifications = notifications.filter(n => {
        const type = String(n.type || '').toUpperCase();
        const title = String(n.title || '').toLowerCase();
        const msg = String(n.message || '').toLowerCase();

        if (
          type.includes('EVALUAT') ||
          type.includes('MARK') ||
          type.includes('GRADE') ||
          type.includes('SCORE') ||
          type.includes('RUBRIC') ||
          type.includes('FACULTY_REVIEW')
        ) {
          return false;
        }

        if (
          title.includes('evaluat') ||
          title.includes('mark') ||
          title.includes('score') ||
          title.includes('grade') ||
          title.includes('grading') ||
          title.includes('rubric') ||
          title.includes('faculty review')
        ) {
          return false;
        }

        if (
          msg.includes('evaluat') ||
          msg.includes('mark') ||
          msg.includes('score') ||
          msg.includes('grade') ||
          msg.includes('grading') ||
          msg.includes('rubric') ||
          msg.includes('faculty review') ||
          msg.includes('feedback has been recorded') ||
          msg.includes('faculty evaluation')
        ) {
          return false;
        }

        return true;
      });
    }

    const unreadCount = notifications.filter(n => !n.read).length;

    res.json({
      success: true,
      unreadCount,
      data: notifications
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.', error: err.message });
  }
});

// ==========================================
// 2. MARK SINGLE NOTIFICATION AS READ
// ==========================================
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const updated = await Notifications.markRead(req.params.id);
    res.json({
      success: true,
      message: 'Notification marked as read.',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update notification.', error: err.message });
  }
});

// ==========================================
// 3. MARK ALL NOTIFICATIONS AS READ
// ==========================================
router.put('/read-all', verifyToken, async (req, res) => {
  try {
    await Notifications.markAllRead(
      req.user.id,
      req.user.email,
      req.user.role,
      req.user.registerNumber
    );
    res.json({
      success: true,
      message: 'All notifications marked as read.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to mark all notifications as read.', error: err.message });
  }
});

// ==========================================
// 4. CLEAR ALL NOTIFICATIONS FOR USER
// ==========================================
router.delete('/clear-all', verifyToken, async (req, res) => {
  try {
    await Notifications.clearAll(
      req.user.id,
      req.user.email,
      req.user.role,
      req.user.registerNumber
    );
    res.json({
      success: true,
      message: 'All notifications cleared successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to clear notifications.', error: err.message });
  }
});

router.post('/clear-all', verifyToken, async (req, res) => {
  try {
    await Notifications.clearAll(
      req.user.id,
      req.user.email,
      req.user.role,
      req.user.registerNumber
    );
    res.json({
      success: true,
      message: 'All notifications cleared successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to clear notifications.', error: err.message });
  }
});

// ==========================================
// 5. DELETE SINGLE NOTIFICATION
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await Notifications.delete(req.params.id);
    res.json({
      success: true,
      message: 'Notification deleted successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete notification.', error: err.message });
  }
});

// ==========================================
// 5. GET NOTIFICATION PREFERENCES
// ==========================================
router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const userDoc = req.userDoc;
    res.json({
      success: true,
      data: userDoc.notificationPreferences || {
        email: true,
        inApp: true,
        reminder3Day: true,
        reminder1Day: true,
        reminderDeadlineDay: true,
        reminderOverdue: true
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve preferences.' });
  }
});

// ==========================================
// 6. UPDATE NOTIFICATION PREFERENCES
// ==========================================
router.put('/preferences', verifyToken, async (req, res) => {
  try {
    const {
      email,
      inApp,
      reminder3Day,
      reminder1Day,
      reminderDeadlineDay,
      reminderOverdue
    } = req.body;

    const currentPrefs = req.userDoc.notificationPreferences || {};
    const newPrefs = {
      email: email !== undefined ? Boolean(email) : currentPrefs.email !== false,
      inApp: inApp !== undefined ? Boolean(inApp) : currentPrefs.inApp !== false,
      reminder3Day: reminder3Day !== undefined ? Boolean(reminder3Day) : currentPrefs.reminder3Day !== false,
      reminder1Day: reminder1Day !== undefined ? Boolean(reminder1Day) : currentPrefs.reminder1Day !== false,
      reminderDeadlineDay: reminderDeadlineDay !== undefined ? Boolean(reminderDeadlineDay) : currentPrefs.reminderDeadlineDay !== false,
      reminderOverdue: reminderOverdue !== undefined ? Boolean(reminderOverdue) : currentPrefs.reminderOverdue !== false
    };

    if (req.user.role === 'faculty') {
      await Faculty.update(req.user.id, { notificationPreferences: newPrefs });
    } else {
      await Users.update(req.user.id, { notificationPreferences: newPrefs });
    }

    res.json({
      success: true,
      message: 'Notification settings updated successfully in Firebase.',
      data: newPrefs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update preferences.', error: err.message });
  }
});

module.exports = router;
