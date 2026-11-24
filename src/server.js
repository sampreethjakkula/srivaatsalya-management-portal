const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const connectDB = require('./config/db');
require('./data/dbStore'); // Initialize embedded/persistent document database

// Route imports
const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/student.routes');
const feeRoutes = require('./routes/fee.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const noticeRoutes = require('./routes/notice.routes');
const admissionRoutes = require('./routes/admission.routes');
const galleryRoutes = require('./routes/gallery.routes');

const app = express();

// Database Connection
connectDB();

// 1. Performance: Compression for high load (gzip/brotli)
app.use(compression());

// 2. Security Headers (configured to allow inline scripts/styles for existing frontend)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// 3. CORS & Body Parsers
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Request Logging (minimal in production for high speed)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// 5. Static File Serving with Caching for High Load
const publicPath = path.join(__dirname, '../public');
app.use(
  express.static(publicPath, {
    maxAge: '1d', // Cache images and static assets
    setHeaders: (res, filePath) => {
      // Keep HTML files uncached so dynamic updates load instantly
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);

// 6. API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/users', authRoutes); // alias for admin management
app.use('/api/students', studentRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/gallery', galleryRoutes);

// Achievements API (persisted in MongoDB Atlas via unified store)
const { Notices } = require('./data/dbStore');
const { protect: authProtect, authorize: authAuthorize } = require('./middleware/auth');
app.get('/api/achievements', async (req, res) => {
  try {
    const list = await Notices.find({ type: 'achievement' });
    const achievements = (list || []).map(a => ({ id: a._id, title: a.title, description: a.desc || a.content }));
    res.json({ success: true, count: achievements.length, achievements });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});
app.post('/api/achievements', authProtect, authAuthorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !description) return res.status(400).json({ success: false, message: 'Title and description required' });
    const ach = await Notices.insert({
      title, content: description, desc: description, type: 'achievement',
      postedBy: req.user.username, sender: req.user.name || req.user.username,
      senderName: req.user.name || req.user.username,
      senderRole: req.user.role || 'admin',
      date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString()
    });
    res.status(201).json({ success: true, achievement: { id: ach._id, title: ach.title, description: ach.desc } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});
// DELETE achievement — admin and superadmin only
app.delete('/api/achievements/:id', authProtect, authAuthorize('admin', 'superadmin'), async (req, res) => {
  try {
    const rawId = req.params.id;
    const decodedId = decodeURIComponent(rawId).trim();
    const mongoose = require('mongoose');
    const NoticeModel = require('./models/Notice');

    let deleted = false;
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(decodedId)) {
        deleted = await NoticeModel.findByIdAndDelete(decodedId);
      }
      if (!deleted) {
        // Fallback: match by title or content
        deleted = await NoticeModel.findOneAndDelete({
          $and: [
            { type: 'achievement' },
            {
              $or: [
                { title: decodedId },
                { title: rawId }
              ]
            }
          ]
        });
      }
    } else {
      await Notices.remove({
        $or: [
          { _id: decodedId },
          { _id: rawId },
          { title: decodedId }
        ]
      });
      deleted = true;
    }

    res.json({ success: true, message: 'Achievement deleted.', deleted: !!deleted });
  } catch(e) {
    console.error('Delete achievement error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// Health check endpoint for load balancers
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Fallback to index.html for root or unmatched routes
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` [SERVER RUNNING] http://localhost:${PORT}`);
  console.log(` [ENVIRONMENT]    ${process.env.NODE_ENV || 'development'}`);
  console.log(` [STATIC ASSETS]  Serving all 38 images and HTML from /public`);
  console.log(`====================================================`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated.');
  });
});

module.exports = app;
