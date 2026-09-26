const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  projectName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  domain: {
    type: String,
    required: true,
    trim: true
  },
  teamLeaderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  teamMemberIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  deadline: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Approved', 'In Progress', 'Completed', 'Delayed', 'Rejected'],
    default: 'Submitted'
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Validate 4 to 5 members
projectSchema.path('teamMemberIds').validate(function (members) {
  return members && members.length >= 4 && members.length <= 5;
}, 'Project must contain strictly 4 to 5 team members.');

module.exports = mongoose.model('Project', projectSchema);
