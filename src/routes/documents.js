const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
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

// Optional local uploads directory for local development
const uploadDir = path.join(__dirname, '../../public/uploads/documents');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (e) {
  // Ignore in read-only / serverless environment
}

// Multer in-memory storage (guarantees cross-platform support: Vercel, AWS, Mobile, PC)
const storage = multer.memoryStorage();

// File Filter for Academic Project Files
const fileFilter = (req, file, cb) => {
  const allowedExts = [
    '.pdf', '.doc', '.docx', '.ppt', '.pptx',
    '.zip', '.rar', '.7z', '.tar', '.gz',
    '.txt', '.png', '.jpg', '.jpeg', '.csv', '.xlsx', '.xls'
  ];
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext || 'unknown'} is not allowed. Supported formats: PDF, DOC/DOCX, PPT/PPTX, ZIP/RAR, TXT, Excel, Images.`));
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
      if (!req.file || !req.file.buffer) {
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
        return res.status(400).json({ success: false, message: 'Project ID is required.' });
      }

      const project = await Projects.findById(projectId);
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }

      // Verify user has access to this project
      const userId = String(req.user.id);
      const isLeader = String(project.teamLeaderId?.id || project.teamLeaderId?._id || project.teamLeaderId) === userId;
      const isMember = Array.isArray(project.teamMemberIds) && project.teamMemberIds.some(m => String(m?.id || m?._id || m) === userId);
      const isAssignedFaculty = String(project.facultyId?.id || project.facultyId?._id || project.facultyId) === userId;
      const isAdmin = req.user.role === 'admin';

      if (!isLeader && !isMember && !isAssignedFaculty && !isAdmin) {
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

      const ext = path.extname(req.file.originalname || '');
      const baseName = path.basename(req.file.originalname || 'document', ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const generatedFileName = `${baseName}_${uniqueSuffix}${ext}`;
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const fileUrl = `/api/documents/raw/${docId}`;

      // Resolve Faculty ID from project
      const rawFacId = project.facultyId?.id || project.facultyId?._id || project.facultyId;
      let faculty = await Faculty.findById(rawFacId);
      if (!faculty) faculty = await Faculty.findByFacultyId(rawFacId);

      // Save document metadata
      const docRecord = await ProjectDocuments.create({
        id: docId,
        _id: docId,
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
        fileName: generatedFileName,
        fileUrl: fileUrl,
        fileSize: req.file.size || req.file.buffer.length,
        mimetype: req.file.mimetype || 'application/octet-stream',
        uploadedBy: {
          id: req.user.id,
          name: req.user.name || 'Student',
          role: req.user.role || 'student',
          registerNumber: req.user.registerNumber || ''
        },
        facultyId: faculty ? (faculty.id || faculty._id) : rawFacId,
        createdAt: new Date().toISOString()
      });

      // Persist binary file data in Firestore / cache
      await ProjectDocuments.saveFile(docRecord.id, req.file.buffer, {
        fileName: generatedFileName,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype
      });

      // Optionally write to local disk if running locally and folder is writable
      try {
        if (fs.existsSync(uploadDir)) {
          fs.writeFileSync(path.join(uploadDir, generatedFileName), req.file.buffer);
        }
      } catch (e) {
        // Ignore read-only errors
      }

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
            { label: 'File Size', value: `${((req.file.size || req.file.buffer.length) / (1024 * 1024)).toFixed(2)} MB` },
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

    if (req.user.role === 'student') {
      const studentId = String(req.user.id);
      const studentReg = (req.user.registerNumber || '').toUpperCase();
      const studentEmail = (req.user.email || '').toLowerCase();
      const leaderId = String(project.teamLeaderId?.id || project.teamLeaderId?._id || project.teamLeaderId);
      const memberIds = Array.isArray(project.teamMemberIds)
        ? project.teamMemberIds.map(m => String(m?.id || m?._id || m))
        : [];
      const memberRegs = Array.isArray(project.teamMemberIds)
        ? project.teamMemberIds.map(m => String(m?.registerNumber || '').toUpperCase())
        : [];
      const memberEmails = Array.isArray(project.teamMemberIds)
        ? project.teamMemberIds.map(m => String(m?.email || '').toLowerCase())
        : [];
      const isEnrolled = leaderId === studentId || memberIds.includes(studentId) ||
        (studentReg && memberRegs.includes(studentReg)) ||
        (studentEmail && memberEmails.includes(studentEmail));
      if (!isEnrolled) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not belong to this project.' });
      }
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

    const allProjects = await Projects.listAll();
    const existingProjectMap = new Map();
    allProjects.forEach(p => {
      existingProjectMap.set(String(p.id), p);
      if (p._id) existingProjectMap.set(String(p._id), p);
    });

    if (req.user.role === 'admin') {
      docs = await ProjectDocuments.listAll(d => existingProjectMap.has(String(d.projectId)));
    } else {
      const assignedProjects = allProjects.filter(p =>
        String(p.facultyId?.id || p.facultyId?._id || p.facultyId) === facultyId
      );
      const assignedProjectIds = new Set(assignedProjects.map(p => String(p.id)));

      // ONLY return documents for projects that currently exist and are assigned to this faculty
      docs = await ProjectDocuments.listAll(d => assignedProjectIds.has(String(d.projectId)));
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
// 4. SERVE / PREVIEW / DOWNLOAD RAW DOCUMENT
// ==========================================
router.get('/raw/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let doc = await ProjectDocuments.findById(id);
    if (!doc) {
      const allDocs = await ProjectDocuments.listAll();
      doc = allDocs.find(d => d.fileName === id || d.id === id || d._id === id);
    }

    if (!doc) {
      return res.status(404).send('Document record not found.');
    }

    const fileBuffer = await ProjectDocuments.getFile(doc.id || doc._id);
    if (!fileBuffer) {
      return res.status(404).send('File content not found or expired.');
    }

    const filename = doc.originalName || doc.fileName || 'document';
    const isDownload = req.query.download === '1' || req.query.download === 'true';
    const disposition = isDownload ? 'attachment' : 'inline';

    res.setHeader('Content-Type', doc.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(fileBuffer);
  } catch (err) {
    console.error('Serve Document Raw Error:', err);
    res.status(500).send('Error retrieving file: ' + err.message);
  }
});

// Download endpoint alias
router.get('/download/:id', async (req, res) => {
  req.query.download = '1';
  return router.handle({ ...req, url: `/raw/${req.params.id}?download=1` }, res);
});

// ==========================================
// 5. DELETE DOCUMENT (Uploader, Project Leader, Assigned Faculty, or Admin)
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

    // Delete both metadata and stored file data
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
