const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'userModel'
  },
  userModel: {
    type: String,
    enum: ['User', 'Faculty'],
    default: 'User'
  },
  userRole: {
    type: String,
    enum: ['student', 'faculty', 'admin'],
    default: 'student'
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  type: {
    type: String,
    required: true // e.g. 'NEW_PROJECT_ASSIGNED', 'PROJECT_APPROVED', 'PROJECT_REJECTED', 'TASK_REMINDER_3DAY', 'TASK_REMINDER_1DAY', 'TASK_REMINDER_DEADLINE', 'TASK_OVERDUE', 'MARKS_ASSIGNED', 'FEEDBACK_ADDED'
  },
  channel: {
    type: String,
    enum: ['in-app', 'email'],
    required: true
  },
  title: {
    type: String,
    default: 'Notification'
  },
  message: {
    type: String,
    required: true
  },
  scheduledFor: {
    type: Date,
    default: Date.now
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['sent', 'pending', 'failed', 'simulated'],
    default: 'sent'
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Composite index for fast lookups and deduplication checking
notificationSchema.index({ userId: 1, type: 1, channel: 1, projectId: 1, taskId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
