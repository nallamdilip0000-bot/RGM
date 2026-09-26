const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    unique: true
  },
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true
  },
  projectWork: {
    type: Number,
    min: 0,
    max: 30,
    required: true
  },
  implementation: {
    type: Number,
    min: 0,
    max: 25,
    required: true
  },
  documentation: {
    type: Number,
    min: 0,
    max: 15,
    required: true
  },
  presentation: {
    type: Number,
    min: 0,
    max: 20,
    required: true
  },
  teamParticipation: {
    type: Number,
    min: 0,
    max: 10,
    required: true
  },
  totalMarks: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  feedback: {
    type: String,
    default: ''
  },
  evaluatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Evaluation', evaluationSchema);
