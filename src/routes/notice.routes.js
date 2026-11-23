const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Notices } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');
const { normalizeCampus, getCampusRegex } = require('../utils/campus');

// @route   GET /api/notices
router.get('/', async (req, res) => {
  try {
    const { type, campus } = req.query;
    let query = {};
    if (type && type !== 'all') query.type = type;
    if (campus && campus !== 'All Campuses') {
      const cRegex = getCampusRegex(campus);
      query.$or = [{ campus: 'All Campuses' }, { campus: cRegex ? { $regex: cRegex } : campus }];
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
        senderName: n.senderName || finalSender,
        senderRole: n.senderRole || (finalSender === 'Administrator' ? 'superadmin' : 'admin'),
        originalSenderName: n.originalSenderName,
        originalSenderRole: n.originalSenderRole,
        forwardedBy: n.forwardedBy,
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
    const { title, content, desc, type, campus, target, priority } = req.body;
    const bodyText = (content || desc || '').trim();
    if (!title || !bodyText) {
      return res.status(400).json({ success: false, message: 'Title and content/description are required.' });
    }
    // Determine sender details based on logged in user
    const senderName = req.user.name || req.user.username;
    const senderRole = req.user.role; // 'admin' or 'superadmin'
    const noticeCampus = senderRole === 'superadmin'
      ? (campus && campus !== 'All Campuses' ? normalizeCampus(campus) : 'All Campuses')
      : normalizeCampus(req.user.campus);
    const noticeTarget = target || (noticeCampus === 'All Campuses' ? 'All Students' : noticeCampus);
    const notice = await Notices.insert({
      title: title.trim(),
      content: bodyText,
      desc: bodyText,
      type: type || 'global',
      campus: noticeCampus,
      target: noticeTarget,
      priority: priority || 'Normal',
      postedBy: req.user.username,
      sender: senderRole === 'superadmin' ? 'Administrator' : 'Campus Admin',
      senderName,
      senderRole,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    });
    res.status(201).json({ success: true, message: 'Notice posted successfully.', notice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/notices/:id/forward
router.post('/:id/forward', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const original = await Notices.findOne({ _id: req.params.id });
    if (!original) {
      return res.status(404).json({ success: false, message: 'Original notice not found.' });
    }
    // Only admins (not superadmin) can forward notices that are not themselves from superadmin unless they are superadmin
    if (req.user.role === 'admin') {
      if (original.senderRole === 'superadmin') {
        return res.status(403).json({ success: false, message: 'Admins cannot forward Administrator notices.' });
      }
      // Ensure admin is allowed to forward (any admin can forward admin notices)
    }
    const senderName = req.user.name || req.user.username;
    const senderRole = req.user.role; // 'admin' or 'superadmin'
    const forwardNotice = await Notices.insert({
      title: original.title,
      content: original.content,
      desc: original.desc,
      type: original.type,
      campus: original.campus,
      target: original.target,
      priority: original.priority,
      postedBy: req.user.username,
      sender: senderRole === 'superadmin' ? 'Administrator' : 'Campus Admin',
      senderName,
      senderRole,
      originalSenderName: original.senderName || original.sender,
      originalSenderRole: original.senderRole || (original.sender === 'Administrator' ? 'superadmin' : 'admin'),
      forwardedBy: req.user.username,
      date: new Date().toISOString().split('T')[0]
    });
    res.status(201).json({ success: true, message: 'Notice forwarded successfully.', notice: forwardNotice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const rawId = req.params.id ? decodeURIComponent(req.params.id).trim() : '';
    let notice = null;

    if (rawId) {
      if (mongoose.Types.ObjectId.isValid(rawId)) {
        notice = await Notices.findOne({ _id: rawId }).catch(() => null);
      }
      if (!notice) {
        notice = await Notices.findOne({ _id: rawId }).catch(() => null);
      }
      if (!notice) {
        notice = await Notices.findOne({ title: rawId }).catch(() => null);
      }
    }

    if (!notice) {
      // Idempotent delete: if notice is already gone from DB, report success so clients can purge cached ghost notice
      return res.json({ success: true, message: 'Notice already removed or not found.' });
    }

    // Super Admin can delete any notice (both Administrator directives and Campus Admin notices).
    // Campus Admin can only delete notices they created and cannot delete Administrator notices.
    if (req.user.role !== 'superadmin') {
      const isOwner = notice.postedBy && String(notice.postedBy).toUpperCase() === String(req.user.username).toUpperCase();
      // Block deletion of Administrator notices
      if (notice.senderRole === 'superadmin' || notice.sender === 'Administrator') {
        return res.status(403).json({ success: false, message: 'Admins cannot delete notices created by Administrator.' });
      }
      // Allow deletion only if the admin is the owner
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Admins can delete only notices they created.' });
      }
    }

    if (notice._id) {
      await Notices.remove({ _id: notice._id });
    }
    res.json({ success: true, message: 'Notice removed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
