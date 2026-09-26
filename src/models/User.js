const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  registerNumber: {
    type: String,
    unique: true,
    sparse: true, // sparse because admin may not have registerNumber
    trim: true,
    uppercase: true
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
  year: {
    type: String,
    trim: true,
    default: 'III Year'
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  role: {
    type: String,
    enum: ['student', 'admin'],
    default: 'student'
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

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
