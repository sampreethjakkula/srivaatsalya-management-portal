const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Users, Students } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');
const { normalizeCampus, isValidAdminCampus, CANONICAL_CAMPUSES } = require('../utils/campus');

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
    let user = await Users.findOne({ username: cleanUsername });

    // Auto-provision user account if student was imported from Excel
    if (!user) {
      const studentProfile = await Students.findOne({ id: cleanUsername });
      if (studentProfile) {
        const expectedPass = studentProfile.pass || 'pass123';
        if (password === expectedPass || password === 'pass123' || password === 'student123') {
          const hashedPassword = await bcrypt.hash(expectedPass, 10);
          user = await Users.insert({
            username: cleanUsername,
            password: hashedPassword,
            role: 'student',
            name: studentProfile.name,
            campus: studentProfile.campus,
            studentId: cleanUsername,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

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

    if (!campus || !isValidAdminCampus(campus)) {
      return res.status(400).json({
        success: false,
        message: 'Campus selection is mandatory. Regular admins must be assigned to exactly one specific campus. "All Campuses" is not permitted.'
      });
    }

    const cleanUsername = username.trim().toUpperCase();
    const existing = await Users.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Admin username already exists.' });
    }

    const assignedCampus = normalizeCampus(campus);
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await Users.insert({
      username: cleanUsername,
      password: hashedPassword,
      role: 'admin',
      name: name ? name.trim() : username,
      campus: assignedCampus,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully.',
      admin: { username: newAdmin.username, campus: newAdmin.campus, name: newAdmin.name }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/auth/users or /api/users (Super Admin only - list all admins)
router.get('/users', protect, authorize('superadmin'), async (req, res) => {
  try {
    const users = await Users.find({ role: 'admin' });
    const safeUsers = users.map(u => ({
      username: u.username,
      name: u.name || u.username,
      campus: u.campus ? normalizeCampus(u.campus) : 'Unassigned',
      rawCampus: u.campus,
      role: u.role,
      createdAt: u.createdAt
    }));
    res.json({ success: true, count: safeUsers.length, users: safeUsers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/auth/users/:username (Super Admin only - update admin name / campus)
router.put('/users/:username', protect, authorize('superadmin'), async (req, res) => {
  try {
    const username = req.params.username.trim().toUpperCase();
    const { name, campus } = req.body;

    const targetUser = await Users.findOne({ username });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: `User "${username}" not found.` });
    }

    if (username === 'SUPERADMIN' && campus && campus !== 'All Campuses') {
      return res.status(400).json({ success: false, message: 'Super Admin maintains global access across all campuses.' });
    }

    const updateFields = {};
    if (name) updateFields.name = name.trim();

    if (campus !== undefined) {
      if (targetUser.role === 'admin') {
        if (!isValidAdminCampus(campus)) {
          return res.status(400).json({
            success: false,
            message: 'Regular admins must be assigned to a specific campus. "All Campuses" is not permitted.'
          });
        }
        updateFields.campus = normalizeCampus(campus);
      }
    }

    await Users.update({ username }, { $set: updateFields });
    const updated = await Users.findOne({ username });

    res.json({
      success: true,
      message: `Admin "${username}" updated successfully.`,
      user: {
        username: updated.username,
        name: updated.name,
        campus: updated.campus,
        role: updated.role
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/auth/users/:username/password (Super Admin only - change admin password)
router.put('/users/:username/password', protect, authorize('superadmin'), async (req, res) => {
  try {
    const username = req.params.username.trim().toUpperCase();
    const { password } = req.body;

    if (!password || password.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'New password is required.' });
    }

    const targetUser = await Users.findOne({ username });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: `User "${username}" not found.` });
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    await Users.update({ username }, { $set: { password: hashedPassword } });

    res.json({
      success: true,
      message: `Password for admin "${username}" updated successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/auth/users/:username (Super Admin only)
router.delete('/users/:username', protect, authorize('superadmin'), async (req, res) => {
  try {
    const username = req.params.username.toUpperCase();
    if (username === 'SUPERADMIN') {
      return res.status(403).json({ success: false, message: 'Cannot delete the super admin account.' });
    }
    await Users.remove({ username, role: 'admin' });
    res.json({ success: true, message: `Admin ${username} deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

