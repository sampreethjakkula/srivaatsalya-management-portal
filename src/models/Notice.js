const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['global', 'admin'],
    default: 'global',
    index: true
  },
  campus: {
    type: String,
    default: 'All Campuses'
  },
  postedBy: {
    type: String,
    default: 'Admin'
  },
  date: {
    type: String,
    default: () => new Date().toISOString().split('T')[0]
  }
}, { timestamps: true });

module.exports = mongoose.model('Notice', noticeSchema);
