const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const facultySchema = new mongoose.Schema({
  facultyId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  department: {
    type: String,
    trim: true,
    default: 'Computer Science & Engineering'
  },
  designation: {
    type: String,
    trim: true,
    default: 'Assistant Professor'
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  role: {
    type: String,
    default: 'faculty'
  },
  notificationPreferences: {
    email: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true },
    reminder3Day: { type: Boolean, default: true },
    reminder1Day: { type: Boolean, default: true },
    reminderDeadlineDay: { type: Boolean, default: true },
    reminderOverdue: { type: Boolean, default: true }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

facultySchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Faculty', facultySchema);
