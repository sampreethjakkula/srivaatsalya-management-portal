const express = require('express');
const router = express.Router();
const { Fees, Students } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/fees
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const list = await Fees.find({});
    const feeMap = {};
    list.forEach(f => {
      feeMap[f.studentId] = {
        total: f.total || 0,
        paid: f.paid || 0,
        history: f.history || []
      };
    });
    res.json({ success: true, count: list.length, fees: feeMap, list });
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

    let fee = await Fees.findOne({ studentId });
    if (!fee) {
      fee = await Fees.insert({
        studentId,
        total: 100000,
        paid: 0,
        history: [],
        updatedAt: new Date().toISOString()
      });
    }

    res.json({ success: true, fee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/fees/payment
router.post('/payment', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { studentId, total, paid, addPayment, receiptNo, notes } = req.body;
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId is required.' });

    const cleanId = studentId.trim().toUpperCase();
    let fee = await Fees.findOne({ studentId: cleanId });

    if (!fee) {
      fee = { studentId: cleanId, total: Number(total) || 100000, paid: 0, history: [] };
    }

    if (total !== undefined) fee.total = Number(total);

    if (addPayment && Number(addPayment) > 0) {
      fee.paid = (fee.paid || 0) + Number(addPayment);
      if (!fee.history) fee.history = [];
      fee.history.push({
        amount: Number(addPayment),
        date: new Date().toISOString().split('T')[0],
        receiptNo: receiptNo || `REC-${Date.now().toString().slice(-6)}`,
        notes: notes || 'Fee Installment'
      });
    } else if (paid !== undefined) {
      fee.paid = Number(paid);
    }

    fee.updatedAt = new Date().toISOString();
    await Fees.update({ studentId: cleanId }, { $set: fee }, { upsert: true });
    const updatedFee = await Fees.findOne({ studentId: cleanId });

    res.json({ success: true, message: 'Fee updated successfully.', fee: updatedFee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
