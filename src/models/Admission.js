const mongoose = require('mongoose');

const admissionSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  dob: { type: String },
  gender: { type: String },
  fatherName: { type: String },
  motherName: { type: String },
  phone: { type: String, required: true },
  email: { type: String },
  course: { type: String, required: true },
  campus: { type: String },
  previousSchool: { type: String },
  tenthMarks: { type: String },
  address: { type: String },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Admission', admissionSchema);
