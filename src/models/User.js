const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'admin', 'superadmin'],
    default: 'student',
    required: true,
    index: true
  },
  name: {
    type: String,
    trim: true
  },
  campus: {
    type: String,
    default: 'All Campuses'
  },
  studentId: {
    type: String,
    trim: true,
    uppercase: true,
    index: true
  }
}, { timestamps: true });

// Password hashing is handled manually in routes and seed logic
// to maintain compatibility with both MongoDB and NeDB.
// Do NOT add a pre('save') hook here — it would double-hash passwords.

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
