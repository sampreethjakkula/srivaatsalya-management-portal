const express = require('express');
const router = express.Router();
const { Notices } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/notices
router.get('/', async (req, res) => {
  try {
    const { type, campus } = req.query;
    let query = {};
    if (type) query.type = type;
    if (campus && campus !== 'All Campuses') {
      query.$or = [{ campus: 'All Campuses' }, { campus }];
    }

    const notices = await Notices.find(query);
    res.json({ success: true, count: notices.length, notices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/notices
router.post('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { title, content, type, campus } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required.' });
    }

    const notice = await Notices.insert({
      title: title.trim(),
      content: content.trim(),
      type: type || 'global',
      campus: campus || req.user.campus || 'All Campuses',
      postedBy: req.user.username,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    });

    res.status(201).json({ success: true, message: 'Notice posted successfully.', notice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/notices/:id
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    await Notices.remove({ _id: req.params.id });
    res.json({ success: true, message: 'Notice removed.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
