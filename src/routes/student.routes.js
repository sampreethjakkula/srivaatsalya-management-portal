const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Users, Students, Fees } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/students
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { campus, course, year, search } = req.query;
    let query = {};
    if (campus && campus !== 'All Campuses') query.campus = campus;
    if (course && course !== 'All') query.course = course;
    if (year && year !== 'All') query.year = year;

    let students = await Students.find(query);

    if (search) {
      const q = search.toLowerCase();
      students = students.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.id && s.id.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
      );
    }

    res.json({ success: true, count: students.length, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/students/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const reqStudentId = req.params.id.trim().toUpperCase();
    if (req.user.role === 'student' && req.user.studentId !== reqStudentId) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only view your own student record.' });
    }
    const student = await Students.findOne({ id: reqStudentId });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/students
router.post('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { id, name, course, year, campus, dob, gender, father, mother, phone, school, transport, att, pass } = req.body;
    if (!id || !name) return res.status(400).json({ success: false, message: 'Student ID and Name are required.' });

    const cleanId = String(id).trim().toUpperCase();
    const existing = await Students.findOne({ id: cleanId });
    if (existing) return res.status(400).json({ success: false, message: `Student ID '${cleanId}' already exists.` });

    const studentPassword = pass || 'pass123';

    const newStudent = await Students.insert({
      id: cleanId,
      name: name.trim(),
      course: course || 'BiPC - NEET',
      year: year || '1st Year',
      campus: campus || req.user.campus || 'Day Scholar',
      dob: dob || 'Not Provided',
      gender: gender || 'Not Provided',
      father: father || 'Not Provided',
      mother: mother || 'Not Provided',
      phone: phone || 'Not Provided',
      school: school || 'Not Provided',
      transport: Boolean(transport),
      att: att !== undefined ? Number(att) : 95,
      pass: studentPassword,
      results: [],
      createdAt: new Date().toISOString()
    });

    // Create login account for student
    const existingUser = await Users.findOne({ username: cleanId });
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(studentPassword, 10);
      await Users.insert({
        username: cleanId,
        password: hashedPassword,
        role: 'student',
        name: name.trim(),
        campus: newStudent.campus,
        studentId: cleanId,
        createdAt: new Date().toISOString()
      });
    }

    // Create fee profile
    const existingFee = await Fees.findOne({ studentId: cleanId });
    if (!existingFee) {
      await Fees.insert({
        studentId: cleanId,
        total: 100000,
        paid: 0,
        history: [],
        updatedAt: new Date().toISOString()
      });
    }

    res.status(201).json({ success: true, message: 'Student added successfully.', student: newStudent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/students/:id
router.put('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const studentId = req.params.id.trim().toUpperCase();
    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.id;

    const student = await Students.findOne({ id: studentId });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    await Students.update({ id: studentId }, { $set: updateData });
    const updatedStudent = await Students.findOne({ id: studentId });

    if (updateData.pass) {
      const hashed = await bcrypt.hash(updateData.pass, 10);
      await Users.update({ username: studentId }, { $set: { password: hashed } });
    }

    res.json({ success: true, message: 'Student updated successfully.', student: updatedStudent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/students/:id
router.delete('/:id', protect, authorize('superadmin'), async (req, res) => {
  try {
    const studentId = req.params.id.trim().toUpperCase();
    await Students.remove({ id: studentId });
    await Users.remove({ username: studentId });
    await Fees.remove({ studentId: studentId });
    res.json({ success: true, message: `Student ${studentId} removed.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
