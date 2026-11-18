const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    default: ''
  },
  desc: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'global',
    index: true
  },
  campus: {
    type: String,
    default: 'All Campuses'
  },
  target: {
    type: String,
    default: 'All Students'
  },
  priority: {
    type: String,
    default: 'Normal'
  },
  postedBy: {
    type: String,
    default: 'Administrator'
  },
  sender: {
    type: String,
    default: 'Administrator'
  },
  date: {
    type: String,
    default: () => new Date().toISOString().split('T')[0]
  }
}, { timestamps: true });

module.exports = mongoose.model('Notice', noticeSchema);

