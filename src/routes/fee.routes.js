const express = require('express');
const router = express.Router();
const { Fees, Students } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');
const { buildCampusCondition, isSameCampus } = require('../utils/campus');

// Helper: normalize a fee doc to always expose total/paid/history
// (works for both Mongoose schema fields AND legacy NeDB field names)
function normalizeFee(f) {
  if (!f) return { total: 0, paid: 0, due: 0, status: 'Pending', history: [] };
  const total   = Number(f.totalFee   ?? f.total   ?? 0);
  const paid    = Number(f.paidAmount  ?? f.paid    ?? 0);
  const due     = Number(f.dueAmount  ?? Math.max(0, total - paid));
  const status  = f.status || (paid === 0 ? 'Pending' : paid >= total ? 'Paid' : 'Partial');
  const history = f.paymentHistory ?? f.history ?? [];
  return { ...f, total, paid, due, dueAmount: due, totalFee: total, paidAmount: paid, status, history, paymentHistory: history };
}

// @route   GET /api/fees
// Returns a feeMap keyed by studentId with normalized fields
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { campus } = req.query;
    let allowedStudentIds = null;

    // Filter fees based on campus access
    if (req.user.role === 'admin') {
      const campusCondition = buildCampusCondition(req.user);
      const campusStudents = await Students.find(campusCondition);
      allowedStudentIds = new Set(campusStudents.map(s => s.id));
    } else if (req.user.role === 'superadmin' && campus && campus !== 'All Campuses' && campus !== 'All') {
      const campusCondition = buildCampusCondition(req.user, campus);
      const campusStudents = await Students.find(campusCondition);
      allowedStudentIds = new Set(campusStudents.map(s => s.id));
    }

    const list = await Fees.find({});
    const filteredList = allowedStudentIds ? list.filter(f => allowedStudentIds.has(f.studentId)) : list;

    const feeMap = {};
    filteredList.forEach(f => {
      const n = normalizeFee(f);
      feeMap[f.studentId] = {
        total:   n.total,
        paid:    n.paid,
        due:     n.due,
        status:  n.status,
        history: n.history
      };
    });
    res.json({ success: true, count: filteredList.length, fees: feeMap, list: filteredList });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/fees/student/:id
router.get('/student/:id', protect, async (req, res) => {
  try {
    const studentId = req.params.id.trim().toUpperCase();
    if (req.user.role === 'student' && req.user.studentId !== studentId) {
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot access another student fee.' });
    }

    if (req.user.role === 'admin') {
      const student = await Students.findOne({ id: studentId });
      if (student && !isSameCampus(student.campus, req.user.campus)) {
        return res.status(403).json({ success: false, message: 'Access Denied: Student belongs to another campus.' });
      }
    }

    let fee = await Fees.findOne({ studentId });
    if (!fee) {
      // Create a new record using correct Mongoose schema field names
      fee = await Fees.insert({
        studentId,
        totalFee:       100000,
        paidAmount:     0,
        dueAmount:      100000,
        status:         'Pending',
        paymentHistory: [],
        updatedAt:      new Date().toISOString()
      });
    }

    res.json({ success: true, fee: normalizeFee(fee) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/fees/payment
// Body: { studentId, total, paid, addPayment, receiptNo, notes }
router.post('/payment', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { studentId, total, paid, addPayment, receiptNo, notes } = req.body;
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId is required.' });

    const cleanId = studentId.trim().toUpperCase();

    // Verify campus ownership if regular admin
    if (req.user.role === 'admin') {
      const student = await Students.findOne({ id: cleanId });
      if (student && !isSameCampus(student.campus, req.user.campus)) {
        return res.status(403).json({ success: false, message: 'Access Denied: You cannot record payments for students of another campus.' });
      }
    }

    let fee = await Fees.findOne({ studentId: cleanId });

    // Normalize existing doc or create a base object
    let current = fee ? normalizeFee(fee) : {
      studentId: cleanId,
      total: Number(total) || 100000,
      paid: 0,
      history: []
    };

    // Update total fee if provided
    const newTotal = total !== undefined ? Number(total) : current.total;

    // Update paid amount
    let newPaid = current.paid;
    let newHistory = Array.isArray(current.history) ? [...current.history] : [];

    if (addPayment && Number(addPayment) > 0) {
      newPaid = current.paid + Number(addPayment);
      newHistory.push({
        amount:      Number(addPayment),
        date:        new Date().toISOString().split('T')[0],
        receiptNo:   receiptNo || `REC-${Date.now().toString().slice(-6)}`,
        notes:       notes || 'Fee Installment',
        collectedBy: req.user.username || req.user.name || 'Admin',
        adminCampus: req.user.campus || ''
      });
    } else if (paid !== undefined) {
      newPaid = Number(paid);
    }

    const newDue    = Math.max(0, newTotal - newPaid);
    const newStatus = newPaid === 0 ? 'Pending' : newPaid >= newTotal ? 'Paid' : 'Partial';

    // Build update using CORRECT Mongoose schema field names
    const updateFields = {
      totalFee:       newTotal,
      paidAmount:     newPaid,
      dueAmount:      newDue,
      status:         newStatus,
      paymentHistory: newHistory,
      updatedAt:      new Date().toISOString()
    };

    await Fees.update({ studentId: cleanId }, { $set: updateFields }, { upsert: true });
    const updatedFee = await Fees.findOne({ studentId: cleanId });

    res.json({
      success: true,
      message: 'Fee updated successfully.',
      fee: normalizeFee(updatedFee)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/fees/admin-collections
// Returns fee collection breakdown by admin, scoped by campus
router.get('/admin-collections', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { campus } = req.query;

    // Build allowed student set based on campus access
    let allowedStudentIds = null;
    if (req.user.role === 'admin') {
      const campusCondition = buildCampusCondition(req.user);
      const campusStudents = await Students.find(campusCondition);
      allowedStudentIds = new Set(campusStudents.map(s => s.id));
    } else if (campus && campus !== 'All Campuses' && campus !== 'All') {
      const campusCondition = buildCampusCondition(req.user, campus);
      const campusStudents = await Students.find(campusCondition);
      allowedStudentIds = new Set(campusStudents.map(s => s.id));
    }

    const allFees = await Fees.find({});
    const adminMap = {};

    for (const fee of allFees) {
      if (allowedStudentIds && !allowedStudentIds.has(fee.studentId)) continue;
      const history = fee.paymentHistory || fee.history || [];
      for (const payment of history) {
        const collector = payment.collectedBy || 'Unknown Admin';
        const adminCampus = payment.adminCampus || '';
        if (!adminMap[collector]) {
          adminMap[collector] = {
            adminName:    collector,
            adminCampus:  adminCampus,
            transactions: 0,
            totalAmount:  0,
            payments:     []
          };
        }
        const payDate = payment.date ? new Date(payment.date).toLocaleDateString('en-IN') : 'N/A';
        // Find student name
        const student = await Students.findOne({ id: fee.studentId });
        adminMap[collector].transactions++;
        adminMap[collector].totalAmount += Number(payment.amount) || 0;
        adminMap[collector].payments.push({
          date:        payDate,
          studentId:   fee.studentId,
          studentName: student ? student.name : fee.studentId,
          amount:      Number(payment.amount) || 0
        });
      }
    }

    const list = Object.values(adminMap).sort((a, b) => b.totalAmount - a.totalAmount);
    res.json({ success: true, admins: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
