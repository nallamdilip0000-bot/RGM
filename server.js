require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('./src/config/firebase');
const seedFirebaseData = require('./src/utils/seed');
const { runDeadlineChecker } = require('./src/services/deadlineChecker');

const app = express();

// Security & Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Dynamic fallback handler for project documents
app.get('/uploads/documents/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const { ProjectDocuments } = require('./src/services/dbService');
    const allDocs = await ProjectDocuments.listAll();
    const doc = allDocs.find(d => d.fileName === filename);
    if (doc) {
      const fileBuffer = await ProjectDocuments.getFile(doc.id || doc._id);
      if (fileBuffer) {
        res.setHeader('Content-Type', doc.mimetype || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName || doc.fileName)}"`);
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.end(fileBuffer);
      }
    }
    next();
  } catch (e) {
    next();
  }
});

// API Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/faculty', require('./src/routes/faculty'));
app.use('/api/projects', require('./src/routes/projects'));
app.use('/api/milestones', require('./src/routes/milestones'));
app.use('/api/tasks', require('./src/routes/tasks'));
app.use('/api/evaluations', require('./src/routes/evaluations'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/student', require('./src/routes/student'));
app.use('/api/documents', require('./src/routes/documents'));
app.use('/api/attendance', require('./src/routes/attendance'));
app.use('/api/cron', require('./src/routes/cron'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Personal Project Milestone Tracker',
    database: 'Firebase Firestore',
    projectId: process.env.FIREBASE_PROJECT_ID || 'project-tracer-dcbcc',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Fallback for HTML5 client-side navigation
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API Route Not Found' });
  }
  next();
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  seedFirebaseData().then(() => {
    // 1. Initial deadline check on server start (evaluates current daily slot)
    setTimeout(() => {
      runDeadlineChecker()
        .then(res => console.log(`[DeadlineChecker] Initial check completed for Slot ${res?.slot?.slot || 1} (${res?.slot?.name || 'Active Slot'}).`))
        .catch(err => console.error('[DeadlineChecker] Initial check error:', err.message));
    }, 5000);

    // 2. Periodic check every 10 minutes to auto-execute whichever of the 4 daily slots is active
    setInterval(() => {
      runDeadlineChecker().catch(err => console.error('[DeadlineChecker] Scheduled check error:', err.message));
    }, 10 * 60 * 1000);

    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🔥 Personal Project Milestone Tracker (Firebase Firestore)`);
      console.log(`📍 Web URL: http://localhost:${PORT}`);
      console.log(`👨‍🎓 Student Portal: http://localhost:${PORT}/student/`);
      console.log(`👨‍🏫 Faculty Portal: http://localhost:${PORT}/faculty/`);
      console.log(`🛠️ Admin Portal:   http://localhost:${PORT}/admin/`);
      console.log(`📅 4 Daily Deadline Slots: 08:00 AM, 12:00 PM, 04:00 PM, 08:00 PM`);
      console.log(`📧 Team Leader Task Assignment: Instant unthrottled emails`);
      console.log(`=======================================================`);
    });
  }).catch(err => {
    console.error('Startup error:', err);
  });
}

module.exports = app;
