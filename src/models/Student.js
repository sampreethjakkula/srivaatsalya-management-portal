const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  course: {
    type: String,
    default: 'BiPC - NEET'
  },
  year: {
    type: String,
    default: '1st Year'
  },
  campus: {
    type: String,
    default: 'Day Scholar'
  },
  dob: {
    type: String,
    default: 'Not Provided'
  },
  gender: {
    type: String,
    default: 'Not Provided'
  },
  father: {
    type: String,
    default: 'Not Provided'
  },
  mother: {
    type: String,
    default: 'Not Provided'
  },
  phone: {
    type: String,
    default: 'Not Provided'
  },
  school: {
    type: String,
    default: 'Not Provided'
  },
  transport: {
    type: Boolean,
    default: false
  },
  att: {
    type: Number,
    default: 95
  },
  pass: {
    type: String,
    default: 'pass123'
  },
  results: {
    type: Array,
    default: []
  }
}, { timestamps: true });

// Compound indexes for fast searching and filtering under heavy load
studentSchema.index({ campus: 1, course: 1, year: 1 });

module.exports = mongoose.model('Student', studentSchema);
