const express = require('express');
const router = express.Router();
const { Notices } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/notices
router.get('/', async (req, res) => {
  try {
    const { type, campus } = req.query;
    let query = {};
    if (type && type !== 'all') query.type = type;
    if (campus && campus !== 'All Campuses') {
      query.$or = [{ campus: 'All Campuses' }, { campus }];
    }

    const rawNotices = await Notices.find(query);

    // Track all directive titles originally issued by the Administrator
    const adminDirectiveTitles = new Set(
      rawNotices
        .filter(n => (n.postedBy === 'SUPERADMIN' || n.sender === 'Administrator') && n.target === 'Campus Admins')
        .map(n => (n.title || '').trim().toLowerCase())
    );

    const notices = (rawNotices || []).map(n => {
      let finalSender = n.sender;

      // 1. If originated from Administrator, posted by SUPERADMIN, or forwarded from an Administrator directive
      if (n.postedBy === 'SUPERADMIN' || n.sender === 'Administrator' || (n.title && adminDirectiveTitles.has(n.title.trim().toLowerCase()))) {
        finalSender = 'Administrator';
      } else if (n.type === 'admin' || n.postedBy === 'ADMIN' || n.sender === 'Campus Admin') {
        // 2. If published directly by Campus Admin
        finalSender = 'Campus Admin';
      } else {
        finalSender = finalSender || n.postedBy || 'Administrator';
      }

      return {
        ...n,
        desc: n.desc || n.content || '',
        content: n.content || n.desc || '',
        sender: finalSender,
        postedBy: n.postedBy || finalSender,
        target: n.target || n.campus || 'All Students',
        campus: n.campus || n.target || 'All Campuses',
        priority: n.priority || 'Normal',
        date: n.date || (n.createdAt ? new Date(n.createdAt).toLocaleDateString() : new Date().toLocaleDateString())
      };
    });
    res.json({ success: true, count: notices.length, notices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/notices
router.post('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { title, content, desc, type, campus, target, priority, sender } = req.body;
    const bodyText = (content || desc || '').trim();
    if (!title || !bodyText) {
      return res.status(400).json({ success: false, message: 'Title and content/description are required.' });
    }

    const noticeSender = sender || (req.user.role === 'superadmin' ? 'Administrator' : 'Campus Admin');
    const noticeCampus = campus || req.user.campus || 'All Campuses';
    const noticeTarget = target || noticeCampus || 'All Students';

    const notice = await Notices.insert({
      title: title.trim(),
      content: bodyText,
      desc: bodyText,
      type: type || 'global',
      campus: noticeCampus,
      target: noticeTarget,
      priority: priority || 'Normal',
      postedBy: req.user.username,
      sender: noticeSender,
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
