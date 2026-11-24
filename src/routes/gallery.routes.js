const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { Gallery } = require('../data/dbStore');
const { protect, authorize } = require('../middleware/auth');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/gallery');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initial default gallery items
const DEFAULT_GALLERY = [
  {
    title: 'Interactive Concept Teaching',
    category: 'Classroom',
    imageUrl: 'gallery-1.jpg',
    description: 'Experienced faculty delivering in-depth subject explanations with active student participation.',
    uploadedBy: 'Administration'
  },
  {
    title: 'Girls Campus Learning Environment',
    category: 'Classroom',
    imageUrl: 'gallery-2.jpg',
    description: 'Focused group discussions encouraging analytical thinking and question resolution.',
    uploadedBy: 'Administration'
  },
  {
    title: 'Problem Solving Workshops',
    category: 'Study Session',
    imageUrl: 'gallery-3.jpg',
    description: 'Daily problem-solving practice sessions reinforcing advanced competitive exam concepts.',
    uploadedBy: 'Administration'
  },
  {
    title: 'Personalized Doubt Clarification',
    category: 'Mentorship',
    imageUrl: 'gallery-4.jpg',
    description: 'Individual attention to ensure every student masters challenging formulas and derivations.',
    uploadedBy: 'Administration'
  },
  {
    title: 'Dynamic Student-Faculty Interaction',
    category: 'Classroom',
    imageUrl: 'gallery-5.jpg',
    description: 'Engaging classroom debates on foundational science concepts and application methods.',
    uploadedBy: 'Administration'
  },
  {
    title: 'Desk-to-Desk Evaluation',
    category: 'Mentorship',
    imageUrl: 'gallery-6.jpg',
    description: 'Continuous progress tracking, notebook verification, and personalized guidance for each learner.',
    uploadedBy: 'Administration'
  },
  {
    title: 'Supervised Study Hours',
    category: 'Study Session',
    imageUrl: 'gallery-7.jpg',
    description: 'Quiet, disciplined study atmosphere under constant faculty supervision to build stamina.',
    uploadedBy: 'Administration'
  }
];

// Seed default gallery items if empty
async function ensureGallerySeeded() {
  try {
    const count = await Gallery.find({});
    if (!count || count.length === 0) {
      for (const item of DEFAULT_GALLERY) {
        await Gallery.insert({
          ...item,
          createdAt: new Date().toISOString()
        });
      }
      console.log('✓ Seeded default gallery items.');
    }
  } catch (err) {
    console.error('Gallery seed check:', err.message);
  }
}
setTimeout(ensureGallerySeeded, 1000);

// @route   GET /api/gallery
// Returns all gallery images
router.get('/', async (req, res) => {
  try {
    let items = await Gallery.find({});
    if (!items || items.length === 0) {
      items = DEFAULT_GALLERY.map((g, idx) => ({ ...g, _id: `seed-${idx + 1}` }));
    }
    res.json({ success: true, count: items.length, gallery: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/gallery
// Supports single or multiple image uploads via base64 or imageUrl
router.post('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const user = req.user?.username || 'Admin';
    const itemsToSave = [];

    // Support array of uploads or single upload
    const payload = Array.isArray(req.body.images) ? req.body.images : [req.body];

    for (const item of payload) {
      let { title, category, description, imageBase64, filename, imageUrl } = item;
      if (!title) title = 'Campus Moment';
      if (!category) category = 'Classroom';

      let finalUrl = imageUrl;

      // Handle base64 upload
      if (imageBase64) {
        const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let ext = '.jpg';
        let buffer;
        if (matches && matches.length === 3) {
          const mime = matches[1];
          if (mime.includes('png')) ext = '.png';
          else if (mime.includes('webp')) ext = '.webp';
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(imageBase64, 'base64');
        }

        const safeName = `gallery_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
        const filePath = path.join(UPLOADS_DIR, safeName);
        fs.writeFileSync(filePath, buffer);
        finalUrl = `uploads/gallery/${safeName}`;
      }

      if (!finalUrl) {
        continue;
      }

      const doc = await Gallery.insert({
        title,
        category,
        imageUrl: finalUrl,
        description: description || '',
        uploadedBy: user,
        createdAt: new Date().toISOString()
      });

      itemsToSave.push(doc);
    }

    if (itemsToSave.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid image data provided.' });
    }

    res.status(201).json({
      success: true,
      message: `${itemsToSave.length} image(s) uploaded successfully to Gallery.`,
      items: itemsToSave
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/gallery/:id
// Admin / Superadmin deletes gallery item
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const rawId = req.params.id;
    const doc = await Gallery.findOne({ _id: rawId });

    if (!doc) {
      // Check if it's matching by id
      await Gallery.delete({ _id: rawId });
      return res.json({ success: true, message: 'Item removed from gallery.' });
    }

    // If file is in uploads directory, delete it
    if (doc.imageUrl && doc.imageUrl.startsWith('uploads/gallery/')) {
      const fullPath = path.join(__dirname, '../../public', doc.imageUrl);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) {}
      }
    }

    await Gallery.delete({ _id: rawId });
    res.json({ success: true, message: 'Gallery image deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
