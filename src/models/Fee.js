const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  studentName: {
    type: String,
    trim: true
  },
  course: {
    type: String
  },
  year: {
    type: String
  },
  totalFee: {
    type: Number,
    default: 75000
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  dueAmount: {
    type: Number,
    default: 75000
  },
  status: {
    type: String,
    enum: ['Paid', 'Pending', 'Partial'],
    default: 'Pending',
    index: true
  },
  paymentHistory: [
    {
      amount: Number,
      date: { type: Date, default: Date.now },
      receiptNo: String,
      method: { type: String, default: 'Online / Cash' },
      notes: String,
      collectedBy: { type: String, trim: true },
      adminCampus: { type: String, trim: true }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Fee', feeSchema);
