const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Users, Students } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
      campus: user.campus,
      studentId: user.studentId
    },
    process.env.JWT_SECRET || 'sv_super_secret_jwt_key_2026_concurrency_safe',
    { expiresIn: '7d' }
  );
};

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please enter both Username/ID and Password.' });
    }

    const cleanUsername = String(username).trim().toUpperCase();
    const user = await Users.findOne({ username: cleanUsername });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    if (role && user.role !== role) {
      return res.status(403).json({ success: false, message: `Access denied. Selected role does not match this account.` });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid password. Please try again.' });
    }

    const token = signToken(user);

    let studentProfile = null;
    if (user.role === 'student' && user.studentId) {
      studentProfile = await Students.findOne({ id: user.studentId });
    }

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        name: user.name || user.username,
        campus: user.campus,
        studentId: user.studentId
      },
      student: studentProfile
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during authentication.' });
  }
});

// @route   GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await Users.findOne({ _id: req.user.id });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    let studentProfile = null;
    if (user.role === 'student' && user.studentId) {
      studentProfile = await Students.findOne({ id: user.studentId });
    }

    const safeUser = { ...user };
    delete safeUser.password;
    res.json({ success: true, user: safeUser, student: studentProfile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/auth/register-admin (Super Admin only)
router.post('/register-admin', protect, authorize('superadmin'), async (req, res) => {
  try {
    const { username, password, name, campus } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const cleanUsername = username.trim().toUpperCase();
    const existing = await Users.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Admin username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await Users.insert({
      username: cleanUsername,
      password: hashedPassword,
      role: 'admin',
      name: name || username,
      campus: campus || 'All Campuses',
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully.',
      admin: { username: newAdmin.username, campus: newAdmin.campus }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
