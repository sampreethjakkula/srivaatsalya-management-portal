const express = require('express');
const router = express.Router();
const { Admissions } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');
const { buildCampusCondition, normalizeCampus, isSameCampus } = require('../utils/campus');

// @route   POST /api/admissions (Public)
router.post('/', async (req, res) => {
  try {
    const { studentName, dob, gender, fatherName, motherName, phone, email, course, campus, previousSchool, tenthMarks, address } = req.body;
    if (!studentName || !phone) {
      return res.status(400).json({ success: false, message: 'Student Name and Phone Number are required.' });
    }

    const application = await Admissions.insert({
      studentName: studentName.trim(),
      dob: dob || '',
      gender: gender || '',
      fatherName: fatherName || '',
      motherName: motherName || '',
      phone: phone.trim(),
      email: email ? email.trim() : '',
      course: course || 'General',
      campus: campus ? normalizeCampus(campus) : 'Sri Vaibhav Campus Day Scholar',
      previousSchool: previousSchool || '',
      tenthMarks: tenthMarks || '',
      address: address || '',
      status: 'Pending',
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted! Our counseling team will contact you soon.',
      id: application._id || application.id
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/admissions (Admin & Super Admin only)
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { campus } = req.query;
    const campusCondition = buildCampusCondition(req.user, campus);
    const list = await Admissions.find(campusCondition);
    res.json({ success: true, count: list.length, applications: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/admissions/:id/status
router.put('/:id/status', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { status } = req.body;
    const app = await Admissions.findOne({ _id: req.params.id });
    if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

    if (req.user.role === 'admin' && !isSameCampus(app.campus, req.user.campus)) {
      return res.status(403).json({ success: false, message: 'Access Denied: Application belongs to another campus.' });
    }

    await Admissions.update({ _id: req.params.id }, { $set: { status } });
    res.json({ success: true, message: `Status updated to ${status}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
