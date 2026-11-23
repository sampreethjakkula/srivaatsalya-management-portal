const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Users, Students, Fees, Attendance } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');
const { buildCampusCondition, normalizeCampus, isSameCampus } = require('../utils/campus');

// @route   GET /api/students
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { campus, course, year, search } = req.query;
    let query = {};

    // Apply strict campus condition (Regular admin is locked to token campus; Superadmin can filter or see all)
    const campusCondition = buildCampusCondition(req.user, campus);
    Object.assign(query, campusCondition);

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

    // Enforce campus ownership for regular admin
    if (req.user.role === 'admin') {
      if (!isSameCampus(student.campus, req.user.campus)) {
        return res.status(403).json({ success: false, message: 'Access Denied: Student belongs to another campus.' });
      }
    }

    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/students/bulk (Batch import from Excel/CSV)
router.post('/bulk', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { students: rawStudents } = req.body;
    if (!Array.isArray(rawStudents) || rawStudents.length === 0) {
      return res.status(400).json({ success: false, message: 'Array of students is required.' });
    }

    let createdCount = 0;
    const defaultHashedPass = await bcrypt.hash('pass123', 10);

    for (const s of rawStudents) {
      if (!s.id || !s.name) continue;
      const cleanId = String(s.id).trim().toUpperCase();
      const studentPassword = s.pass || 'pass123';

      // Campus enforcement: Regular admins can ONLY import into their assigned campus!
      const assignedCampus = req.user.role === 'superadmin'
        ? normalizeCampus(s.campus || 'Day Scholar')
        : normalizeCampus(req.user.campus);

      const cleanCourse = s.course ? String(s.course).trim().replace(/\bAP\s+EAPCET\b/gi, 'EAPCET').replace(/\beapset\b/gi, 'EAPCET') : 'BiPC - NEET';
      const studentDoc = {
        id: cleanId,
        name: String(s.name).trim(),
        course: cleanCourse,
        year: s.year || '1st Year',
        campus: assignedCampus,
        dob: s.dob || 'Not Provided',
        gender: s.gender || 'Not Provided',
        father: s.father || 'Not Provided',
        mother: s.mother || 'Not Provided',
        phone: s.phone || 'Not Provided',
        school: s.school || 'Not Provided',
        transport: Boolean(s.transport),
        att: s.att !== undefined ? Number(s.att) : 95,
        pass: studentPassword,
        results: Array.isArray(s.results) ? s.results : [],
        updatedAt: new Date().toISOString()
      };

      // 1. Insert or update Student
      const existingStudent = await Students.findOne({ id: cleanId });
      if (existingStudent) {
        // If regular admin, ensure existing student also belongs to their campus
        if (req.user.role === 'admin' && !isSameCampus(existingStudent.campus, req.user.campus)) {
          continue; // skip overwriting other campus student
        }
        await Students.update({ id: cleanId }, { $set: studentDoc });
      } else {
        studentDoc.createdAt = new Date().toISOString();
        await Students.insert(studentDoc);
      }

      // 2. Ensure Login Account (User) exists and can authenticate
      const userDoc = await Users.findOne({ username: cleanId });
      if (!userDoc) {
        const hashedPassword = studentPassword === 'pass123' ? defaultHashedPass : await bcrypt.hash(studentPassword, 10);
        await Users.insert({
          username: cleanId,
          password: hashedPassword,
          role: 'student',
          name: studentDoc.name,
          campus: studentDoc.campus,
          studentId: cleanId,
          createdAt: new Date().toISOString()
        });
      } else {
        // Ensure student has a valid hashed password
        if (s.pass && s.pass !== 'pass123') {
          const updatedHashed = await bcrypt.hash(s.pass, 10);
          await Users.update({ username: cleanId }, { $set: { password: updatedHashed } });
        }
      }

      // 3. Ensure Fee profile exists
      const feeDoc = await Fees.findOne({ studentId: cleanId });
      if (!feeDoc) {
        await Fees.insert({
          studentId: cleanId,
          total: 100000,
          paid: 0,
          history: [],
          updatedAt: new Date().toISOString()
        });
      }

      createdCount++;
    }

    res.json({
      success: true,
      count: createdCount,
      message: `Successfully processed ${createdCount} students and created their login credentials.`
    });
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

    const rawDob = (dob || '').trim();
    let cleanDob = rawDob;
    // Normalize DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
    const dmyMatch = rawDob.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmyMatch) {
      cleanDob = `${dmyMatch[3]}-${String(dmyMatch[2]).padStart(2, '0')}-${String(dmyMatch[1]).padStart(2, '0')}`;
    }

    const cleanCourse = course ? String(course).trim().replace(/\bAP\s+EAPCET\b/gi, 'EAPCET').replace(/\beapset\b/gi, 'EAPCET') : 'BiPC - NEET';

    // Campus enforcement: Regular admins can ONLY create students in their assigned campus!
    const assignedCampus = req.user.role === 'superadmin'
      ? normalizeCampus(campus || 'Day Scholar')
      : normalizeCampus(req.user.campus);

    const newStudent = await Students.insert({
      id: cleanId,
      name: name.trim(),
      course: cleanCourse,
      year: year || '1st Year',
      campus: assignedCampus,
      dob: cleanDob || 'Not Provided',
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

    if (updateData.dob) {
      const rawDob = String(updateData.dob).trim();
      const dmyMatch = rawDob.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (dmyMatch) {
        updateData.dob = `${dmyMatch[3]}-${String(dmyMatch[2]).padStart(2, '0')}-${String(dmyMatch[1]).padStart(2, '0')}`;
      }
    }

    if (updateData.course) {
      updateData.course = String(updateData.course).trim().replace(/\bAP\s+EAPCET\b/gi, 'EAPCET').replace(/\beapset\b/gi, 'EAPCET');
    }

    const student = await Students.findOne({ id: studentId });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    // Enforce campus ownership: regular admin cannot edit students from another campus
    if (req.user.role === 'admin') {
      if (!isSameCampus(student.campus, req.user.campus)) {
        return res.status(403).json({ success: false, message: 'Access Denied: You cannot modify students from another campus.' });
      }
      // Regular admin cannot alter the student's campus
      delete updateData.campus;
    } else if (updateData.campus) {
      updateData.campus = normalizeCampus(updateData.campus);
    }

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

// @route   POST /api/students/bulk-results (Bulk Exam Results Upload)
router.post('/bulk-results', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { results: rawResults } = req.body;
    if (!Array.isArray(rawResults) || rawResults.length === 0) {
      return res.status(400).json({ success: false, message: 'Array of results is required.' });
    }

    let savedCount = 0;
    const errors = [];

    for (const r of rawResults) {
      const { studentId, studentName, date, examName, marks } = r;
      if (!studentId || !examName || marks === undefined || marks === null) {
        errors.push({ studentId, reason: 'Missing required fields (studentId, examName, marks).' });
        continue;
      }
      const cleanId = String(studentId).trim().toUpperCase();
      const student = await Students.findOne({ id: cleanId });
      if (!student) {
        errors.push({ studentId: cleanId, reason: 'Student not found.' });
        continue;
      }
      // Validate student name if provided
      if (studentName && student.name && student.name.trim().toLowerCase() !== String(studentName).trim().toLowerCase()) {
        errors.push({ studentId: cleanId, reason: `Name mismatch: expected "${student.name}", got "${studentName}".` });
        continue;
      }
      // Campus enforcement for regular admin
      if (req.user.role === 'admin' && !isSameCampus(student.campus, req.user.campus)) {
        errors.push({ studentId: cleanId, reason: 'Access Denied: Student belongs to another campus.' });
        continue;
      }
      // Validate marks
      const numericMarks = Number(marks);
      if (isNaN(numericMarks)) {
        errors.push({ studentId: cleanId, reason: `Marks "${marks}" is not a valid number.` });
        continue;
      }

      const resultEntry = {
        exam:     String(examName).trim(),
        test:     String(examName).trim(),
        examName: String(examName).trim(),
        marks:    numericMarks,
        score:    numericMarks,
        date:     date || new Date().toISOString().split('T')[0],
        addedAt:  new Date().toISOString()
      };

      const existing = student.results || [];
      const updatedResults = [...existing, resultEntry];
      await Students.update({ id: cleanId }, { $set: { results: updatedResults } });
      savedCount++;
    }

    res.json({
      success: true,
      saved:   savedCount,
      errors:  errors,
      message: `Saved ${savedCount} result(s). ${errors.length} skipped.`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/students/:id
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const studentId = req.params.id.trim().toUpperCase();
    const student = await Students.findOne({ id: studentId });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    // Enforce campus ownership for regular admin
    if (req.user.role === 'admin') {
      if (!isSameCampus(student.campus, req.user.campus)) {
        return res.status(403).json({ success: false, message: 'Access Denied: You cannot delete students from another campus.' });
      }
    }

    await Students.remove({ id: studentId });
    await Users.remove({ username: studentId });
    await Fees.remove({ studentId: studentId });
    await Attendance.remove({ studentId: studentId });
    res.json({ success: true, message: `Student ${studentId} removed.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
