const mongoose = require('mongoose');

const individualEvaluationSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true
  },
  marks: {
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

// A student has one individual evaluation per project
individualEvaluationSchema.index({ projectId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('IndividualEvaluation', individualEvaluationSchema);
