const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const {
  Projects,
  Users,
  Faculty,
  ProjectDocuments
} = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { notifyUser } = require('../services/notificationService');
const { generateProfessionalEmailTemplate } = require('../services/emailService');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../public/uploads/documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${baseName}_${uniqueSuffix}${ext}`);
  }
});

// File Filter for Academic Project Files
const fileFilter = (req, file, cb) => {
  const allowedExts = [
    '.pdf', '.doc', '.docx', '.ppt', '.pptx',
    '.zip', '.rar', '.7z', '.tar', '.gz',
    '.txt', '.png', '.jpg', '.jpeg', '.csv', '.xlsx', '.xls'
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} is not allowed. Supported formats: PDF, DOC/DOCX, PPT/PPTX, ZIP/RAR, TXT, Excel, Images.`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  }
});

// ==========================================
// 1. UPLOAD DOCUMENT (Research Paper, PPT, Report, Synopsis, Code)
// ==========================================
router.post('/upload', verifyToken, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Please select a file to upload.' });
      }

      const {
        projectId,
        category,
        title,
        description,
        submissionType,
        memberId,
        memberName,
        memberRegNo
      } = req.body;

      if (!projectId) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(400).json({ success: false, message: 'Project ID is required.' });
      }

      const project = await Projects.findById(projectId);
      if (!project) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }

      // Verify user has access to this project
      const userId = String(req.user.id);
      const isLeader = String(project.teamLeaderId?.id || project.teamLeaderId?._id || project.teamLeaderId) === userId;
      const isMember = Array.isArray(project.teamMemberIds) && project.teamMemberIds.some(m => String(m?.id || m?._id || m) === userId);
      const isAssignedFaculty = String(project.facultyId?.id || project.facultyId?._id || project.facultyId) === userId;
      const isAdmin = req.user.role === 'admin';

      if (!isLeader && !isMember && !isAssignedFaculty && !isAdmin) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(403).json({ success: false, message: 'Unauthorized. You are not a member of this project.' });
      }

      const isIndividual = submissionType === 'Individual';
      const effectiveSubmissionType = isIndividual ? 'Individual' : 'Team';
      const effectiveMemberName = memberName ? memberName.trim() : (req.user.name || 'Student');
      const effectiveMemberRegNo = memberRegNo ? memberRegNo.trim().toUpperCase() : (req.user.registerNumber || '');
      const effectiveMemberId = memberId || req.user.id;

      const submissionScope = isIndividual
        ? `Individual (${effectiveMemberName}${effectiveMemberRegNo ? ` - ${effectiveMemberRegNo}` : ''})`
        : 'Entire Team';

      const docCategory = category || 'Project Report';
      const docTitle = (title && title.trim()) ? title.trim() : req.file.originalname;
      const fileUrl = `/uploads/documents/${req.file.filename}`;
      const relativePath = path.relative(path.join(__dirname, '../../public'), req.file.path).replace(/\\/g, '/');

      // Resolve Faculty ID from project
      const rawFacId = project.facultyId?.id || project.facultyId?._id || project.facultyId;
      let faculty = await Faculty.findById(rawFacId);
      if (!faculty) faculty = await Faculty.findByFacultyId(rawFacId);

      const docRecord = await ProjectDocuments.create({
        projectId: project.id,
        projectName: project.projectName,
        projectDomain: project.domain || '',
        category: docCategory,
        title: docTitle,
        description: description ? description.trim() : '',
        submissionType: effectiveSubmissionType,
        submissionScope: submissionScope,
        individualMember: isIndividual ? {
          id: effectiveMemberId,
          name: effectiveMemberName,
          registerNumber: effectiveMemberRegNo
        } : null,
        originalName: req.file.originalname,
        fileName: req.file.filename,
        fileUrl: fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`,
        filePath: relativePath,
        fileSize: req.file.size,
        mimetype: req.file.mimetype,
        uploadedBy: {
          id: req.user.id,
          name: req.user.name || 'Student',
          role: req.user.role || 'student',
          registerNumber: req.user.registerNumber || ''
        },
        facultyId: faculty ? (faculty.id || faculty._id) : rawFacId,
        createdAt: new Date().toISOString()
      });

      // If uploaded by a student, notify the assigned Faculty Guide immediately
      if (req.user.role === 'student' && faculty) {
        const studentName = req.user.name || 'Student';
        const studentRegNo = req.user.registerNumber ? ` (${req.user.registerNumber})` : '';
        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const facultyPortalUrl = `${appUrl}/faculty/index.html?tab=tabDocuments&projectId=${project.id}`;

        const notifTitle = `📄 New Document Uploaded: "${docTitle}" (${effectiveSubmissionType})`;
        const notifMessage = `${studentName}${studentRegNo} uploaded a new ${docCategory} [${submissionScope}]: "${docTitle}" for project "${project.projectName}".`;

        const emailHtml = generateProfessionalEmailTemplate({
          headerTitle: 'Academic Faculty Mentorship Portal',
          headerSubtitle: 'New Project Deliverable / Document Submission',
          recipientName: `Prof. ${faculty.name}`,
          badgeText: `${docCategory} (${effectiveSubmissionType})`,
          badgeColor: effectiveSubmissionType === 'Team' ? '#059669' : '#7c3aed',
          badgeBg: effectiveSubmissionType === 'Team' ? '#ecfdf5' : '#f5f3ff',
          title: `📄 New ${docCategory} Uploaded: "${project.projectName}"`,
          summaryText: `${studentName}${studentRegNo} has uploaded a new ${docCategory.toLowerCase()} for ${submissionScope}.`,
          details: [
            { label: 'Project Name', value: project.projectName, highlight: true },
            { label: 'Document Title', value: docTitle },
            { label: 'Category', value: docCategory },
            { label: 'Submission Type', value: submissionScope, highlight: true },
            { label: 'Uploaded By', value: `${studentName}${studentRegNo}` },
            { label: 'File Name', value: req.file.originalname },
            { label: 'File Size', value: `${(req.file.size / (1024 * 1024)).toFixed(2)} MB` },
            { label: 'Submission Time', value: new Date().toLocaleString('en-GB') }
          ],
          actionSteps: [
            'Log into the Faculty Portal to inspect and download the student submission.',
            'Review the document content to ensure alignment with milestone objectives.',
            'Discuss feedback with the student team during your regular project review sessions.'
          ],
          buttonText: 'View Submissions in Faculty Portal',
          buttonUrl: facultyPortalUrl,
          alertType: 'info'
        });

        await notifyUser({
          userId: faculty.id || faculty._id,
          userModel: 'Faculty',
          userRole: 'faculty',
          userEmail: faculty.email,
          userName: faculty.name,
          userPhone: faculty.phone,
          preferences: faculty.notificationPreferences || { inApp: true, email: true },
          projectId: project.id,
          type: `DOCUMENT_UPLOADED_${docRecord.id}_${Date.now()}`,
          title: notifTitle,
          message: notifMessage,
          emailHtml,
          isDirectAction: true,
          force: true
        });
      }

      res.status(201).json({
        success: true,
        message: `${docCategory} uploaded successfully.`,
        data: docRecord
      });
    } catch (error) {
      console.error('Document Upload Handler Error:', error);
      res.status(500).json({ success: false, message: 'Failed to process document upload.', error: error.message });
    }
  });
});

// ==========================================
// 2. GET DOCUMENTS FOR A SPECIFIC PROJECT
// ==========================================
router.get('/project/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Projects.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const docs = await ProjectDocuments.findByProject(projectId);
    res.json({
      success: true,
      data: docs
    });
  } catch (err) {
    console.error('Fetch Project Documents Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch project documents.', error: err.message });
  }
});

// ==========================================
// 3. GET ALL DOCUMENTS FOR FACULTY'S ASSIGNED PROJECTS
// ==========================================
router.get('/faculty', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const facultyId = String(req.user.id);
    let docs = [];

    if (req.user.role === 'admin') {
      docs = await ProjectDocuments.listAll();
    } else {
      const assignedProjects = await Projects.listAll(p =>
        String(p.facultyId?.id || p.facultyId?._id || p.facultyId) === facultyId
      );
      const projectIds = new Set(assignedProjects.map(p => String(p.id)));

      docs = await ProjectDocuments.listAll(d =>
        String(d.facultyId) === facultyId || projectIds.has(String(d.projectId))
      );
    }

    res.json({
      success: true,
      data: docs
    });
  } catch (err) {
    console.error('Fetch Faculty Documents Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch submissions.', error: err.message });
  }
});

// ==========================================
// 4. DELETE DOCUMENT (Uploader, Project Leader, Assigned Faculty, or Admin)
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const doc = await ProjectDocuments.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const userId = String(req.user.id);
    const isUploader = String(doc.uploadedBy?.id) === userId;
    const isFaculty = req.user.role === 'faculty' && String(doc.facultyId) === userId;
    const isAdmin = req.user.role === 'admin';

    let isLeader = false;
    const project = await Projects.findById(doc.projectId);
    if (project) {
      isLeader = String(project.teamLeaderId?.id || project.teamLeaderId?._id || project.teamLeaderId) === userId;
    }

    if (!isUploader && !isLeader && !isFaculty && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this document.' });
    }

    // Attempt to remove physical file from disk
    if (doc.fileName) {
      const filePath = path.join(uploadDir, doc.fileName);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Could not remove file from disk:', e.message);
        }
      }
    }

    await ProjectDocuments.delete(doc.id || doc._id);

    res.json({
      success: true,
      message: 'Document deleted successfully.'
    });
  } catch (err) {
    console.error('Delete Document Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete document.', error: err.message });
  }
});

module.exports = router;
