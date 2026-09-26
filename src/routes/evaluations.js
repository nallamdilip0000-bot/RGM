const express = require('express');
const router = express.Router();
const { Evaluations, IndividualEvaluations, Projects, Users } = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { notifyUser } = require('../services/notificationService');

// ==========================================
// 1. SAVE OR UPDATE PROJECT EVALUATION (Faculty only - Firebase)
// ==========================================
router.post('/', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const {
      projectId,
      projectWork,
      implementation,
      documentation,
      presentation,
      teamParticipation,
      feedback
    } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project ID is required.' });
    }

    const project = await Projects.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    if (req.user.role === 'faculty' && String(project.facultyId?.id || project.facultyId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You are not assigned to evaluate this project.' });
    }

    const pw = Number(projectWork) || 0;
    const imp = Number(implementation) || 0;
    const doc = Number(documentation) || 0;
    const pres = Number(presentation) || 0;
    const tp = Number(teamParticipation) || 0;

    if (pw < 0 || pw > 30) return res.status(400).json({ success: false, message: 'Project Work marks must be between 0 and 30.' });
    if (imp < 0 || imp > 25) return res.status(400).json({ success: false, message: 'Implementation marks must be between 0 and 25.' });
    if (doc < 0 || doc > 15) return res.status(400).json({ success: false, message: 'Documentation marks must be between 0 and 15.' });
    if (pres < 0 || pres > 20) return res.status(400).json({ success: false, message: 'Presentation marks must be between 0 and 20.' });
    if (tp < 0 || tp > 10) return res.status(400).json({ success: false, message: 'Team Participation marks must be between 0 and 10.' });

    const totalMarks = pw + imp + doc + pres + tp;

    const evaluation = await Evaluations.upsert(projectId, {
      facultyId: String(req.user.id),
      projectWork: pw,
      implementation: imp,
      documentation: doc,
      presentation: pres,
      teamParticipation: tp,
      totalMarks,
      feedback: feedback || '',
      evaluatedAt: new Date().toISOString()
    });

    if (project.status !== 'Completed') {
      await Projects.update(project.id, { status: 'Completed' });
    }

    // Evaluations are strictly confidential to faculty & administration (no student notification)

    res.json({
      success: true,
      message: 'Project evaluation saved successfully in Firebase.',
      data: evaluation
    });
  } catch (err) {
    console.error('Evaluation Save Error:', err);
    res.status(500).json({ success: false, message: 'Failed to save evaluation.', error: err.message });
  }
});

// ==========================================
// 2. GET PROJECT EVALUATION (Faculty & Admin only)
// ==========================================
router.get('/:projectId', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const evaluation = await Evaluations.findByProject(req.params.projectId);
    res.json({
      success: true,
      data: evaluation || null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load evaluation.', error: err.message });
  }
});

// ==========================================
// 3. SAVE INDIVIDUAL STUDENT EVALUATIONS (Faculty only)
// ==========================================
router.post('/individual', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const { projectId, evaluations } = req.body;
    if (!projectId || !Array.isArray(evaluations)) {
      return res.status(400).json({ success: false, message: 'Project ID and evaluations array are required.' });
    }

    const project = await Projects.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    if (req.user.role === 'faculty' && String(project.facultyId?.id || project.facultyId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const savedRecords = [];
    for (const item of evaluations) {
      const { studentId, marks, feedback } = item;
      const score = Number(marks);
      if (score < 0 || score > 100) {
        return res.status(400).json({ success: false, message: `Marks for student must be between 0 and 100. Received: ${score}` });
      }

      const updated = await IndividualEvaluations.upsert(projectId, studentId, {
        facultyId: String(req.user.id),
        marks: score,
        feedback: feedback ? feedback.trim() : '',
        evaluatedAt: new Date().toISOString()
      });
      savedRecords.push(updated);
    }

    res.json({
      success: true,
      message: 'Individual student evaluations saved successfully in Firebase.',
      data: savedRecords
    });
  } catch (err) {
    console.error('Individual Evaluation Error:', err);
    res.status(500).json({ success: false, message: 'Failed to save individual evaluations.', error: err.message });
  }
});

// ==========================================
// 4. GET INDIVIDUAL EVALUATIONS (Faculty & Admin only)
// ==========================================
router.get('/individual/:projectId', verifyToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const allEvals = await IndividualEvaluations.findByProject(projectId);
    res.json({
      success: true,
      data: allEvals
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve individual evaluations.', error: err.message });
  }
});

module.exports = router;
