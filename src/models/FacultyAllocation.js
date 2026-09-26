const mongoose = require('mongoose');

const facultyAllocationSchema = new mongoose.Schema({
  facultyId: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  year: {
    type: String,
    required: true,
    trim: true
  },
  active: {
    type: Boolean,
    default: true
  },
  allocatedBy: {
    type: String,
    default: 'admin'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound unique index to prevent duplicate allocations
facultyAllocationSchema.index({ facultyId: 1, department: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('FacultyAllocation', facultyAllocationSchema);
