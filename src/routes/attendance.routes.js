const express = require('express');
const router = express.Router();
const { Attendance, Students } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');
const { buildCampusCondition, normalizeCampus, isSameCampus } = require('../utils/campus');

// @route   GET /api/attendance
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { date, campus } = req.query;
    let query = {};
    if (date) query.date = date;

    const campusCondition = buildCampusCondition(req.user, campus);
    Object.assign(query, campusCondition);

    const records = await Attendance.find(query);
    res.json({ success: true, count: records.length, records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/attendance/student/:id
router.get('/student/:id', protect, async (req, res) => {
  try {
    const studentId = req.params.id.trim().toUpperCase();
    if (req.user.role === 'student' && req.user.studentId !== studentId) {
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot view another student attendance.' });
    }

    const student = await Students.findOne({ id: studentId });
    if (req.user.role === 'admin' && student) {
      if (!isSameCampus(student.campus, req.user.campus)) {
        return res.status(403).json({ success: false, message: 'Access Denied: Student belongs to another campus.' });
      }
    }

    const records = await Attendance.find({ studentId });

    res.json({
      success: true,
      studentId,
      attendancePercentage: student ? student.att : 95,
      records
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/attendance/mark
router.post('/mark', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { studentId, date, status, remarks, records } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const adminCampus = req.user.role === 'admin' ? normalizeCampus(req.user.campus) : null;

    // Batch marking
    if (Array.isArray(records) && records.length > 0) {
      for (const rec of records) {
        const sId = String(rec.studentId).trim().toUpperCase();
        if (req.user.role === 'admin') {
          const student = await Students.findOne({ id: sId });
          if (student && !isSameCampus(student.campus, req.user.campus)) {
            continue; // Skip marking students outside admin's campus
          }
        }

        const markCampus = adminCampus || normalizeCampus(rec.campus || 'Day Scholar');
        await Attendance.update(
          { studentId: sId, date: targetDate },
          {
            $set: {
              studentId: sId,
              date: targetDate,
              status: rec.status || 'Present',
              remarks: rec.remarks || '',
              campus: markCampus,
              markedBy: req.user.username,
              updatedAt: new Date().toISOString()
            }
          },
          { upsert: true }
        );
        if (rec.att !== undefined) {
          await Students.update({ id: sId }, { $set: { att: Number(rec.att) } });
        }
      }
      return res.json({ success: true, message: `Marked attendance for ${records.length} students on ${targetDate}.` });
    }

    // Single student
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId is required.' });

    const cleanId = String(studentId).trim().toUpperCase();
    if (req.user.role === 'admin') {
      const student = await Students.findOne({ id: cleanId });
      if (student && !isSameCampus(student.campus, req.user.campus)) {
        return res.status(403).json({ success: false, message: 'Access Denied: You cannot mark attendance for a student of another campus.' });
      }
    }

    const markCampus = adminCampus || normalizeCampus(req.body.campus || 'Day Scholar');
    await Attendance.update(
      { studentId: cleanId, date: targetDate },
      {
        $set: {
          studentId: cleanId,
          date: targetDate,
          status: status || 'Present',
          remarks: remarks || '',
          campus: markCampus,
          markedBy: req.user.username,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    if (req.body.att !== undefined) {
      await Students.update({ id: cleanId }, { $set: { att: Number(req.body.att) } });
    }

    res.json({ success: true, message: `Attendance marked for ${cleanId}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
