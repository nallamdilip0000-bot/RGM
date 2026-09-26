const express = require('express');
const router = express.Router();
const {
  Users,
  Faculty,
  Projects,
  Evaluations,
  Notifications,
  FacultyAllocations
} = require('../services/dbService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { normalizeDepartment, normalizeYear, isDepartmentMatch, isYearMatch } = require('../utils/academicUtils');

router.use(verifyToken, requireRole('admin'));

// ==========================================
// 1. ADMIN DASHBOARD SYSTEM STATISTICS (Firebase)
// ==========================================
router.get('/stats', async (req, res) => {
  try {
    const totalStudents = await Users.count(u => u.role === 'student');
    const totalFaculty = await Faculty.count();
    const totalProjects = await Projects.count();
    const activeProjects = await Projects.count(p => ['Approved', 'In Progress'].includes(p.status));
    const completedProjects = await Projects.count(p => p.status === 'Completed');

    const allEvaluations = await Evaluations.listAll();
    const evaluatedProjectIds = allEvaluations.map(e => String(e.projectId));
    const pendingEvaluations = await Projects.count(p => !evaluatedProjectIds.includes(String(p.id)) && p.status !== 'Rejected');

    res.json({
      success: true,
      data: {
        totalStudents,
        totalFaculty,
        totalProjects,
        activeProjects,
        completedProjects,
        pendingEvaluations
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve stats.', error: err.message });
  }
});

// ==========================================
// 2. GET ALL STUDENTS
// ==========================================
router.get('/students', async (req, res) => {
  try {
    const students = await Users.listAll(u => u.role === 'student');
    const clean = students.map(({ password, ...rest }) => rest);
    res.json({
      success: true,
      data: clean
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch students.', error: err.message });
  }
});

// ==========================================
// 3. TOGGLE STUDENT ACTIVE / DEACTIVATE
// ==========================================
router.put('/students/:id/status', async (req, res) => {
  try {
    const student = await Users.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const newActive = student.isActive === false ? true : false;
    const updated = await Users.update(student.id, { isActive: newActive });

    res.json({
      success: true,
      message: `Student account ${newActive ? 'activated' : 'deactivated'} successfully in Firebase.`,
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update student status.', error: err.message });
  }
});

// ==========================================
// 4. GET SYSTEM REPORTS & ANALYTICS
// ==========================================
router.get('/reports', async (req, res) => {
  try {
    const projects = await Projects.listAll();
    const evaluations = await Evaluations.listAll();
    const allStudents = await Users.listAll(u => u.role === 'student');

    // Department breakdown
    const deptCounts = {};
    allStudents.forEach(s => {
      const dept = s.department || 'Unassigned';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });
    const deptDistribution = Object.entries(deptCounts).map(([_id, count]) => ({ _id, count }));

    // Domain breakdown
    const domainCounts = {};
    projects.forEach(p => {
      const d = p.domain || 'General';
      domainCounts[d] = (domainCounts[d] || 0) + 1;
    });
    const domainDistribution = Object.entries(domainCounts).map(([_id, count]) => ({ _id, count }));

    res.json({
      success: true,
      data: {
        projects,
        evaluations,
        deptDistribution,
        domainDistribution
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to generate reports.', error: err.message });
  }
});

// ==========================================
// 5. GET NOTIFICATION AUDIT LOGS
// ==========================================
router.get('/notifications/logs', async (req, res) => {
  try {
    const logs = await Notifications.listAllLogs(100);
    res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch notification logs.', error: err.message });
  }
});

// ==========================================
// 6. FACULTY ALLOCATIONS: GET ALL
// ==========================================
router.get('/faculty-allocations', async (req, res) => {
  try {
    const { department, year, active } = req.query;
    let list = await FacultyAllocations.listAll();

    if (department) {
      list = list.filter(a => isDepartmentMatch(a.department, department));
    }
    if (year) {
      list = list.filter(a => isYearMatch(a.year, year));
    }
    if (active !== undefined && active !== '') {
      const boolActive = active === 'true' || active === true;
      list = list.filter(a => a.active === boolActive);
    }

    list.sort((a, b) => {
      const d = (a.department || '').localeCompare(b.department || '');
      if (d !== 0) return d;
      const y = (a.year || '').localeCompare(b.year || '');
      if (y !== 0) return y;
      return (a.faculty?.name || '').localeCompare(b.faculty?.name || '');
    });

    res.json({
      success: true,
      count: list.length,
      data: list
    });
  } catch (err) {
    console.error('Fetch Allocations Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch faculty allocations.', error: err.message });
  }
});

// ==========================================
// 7. FACULTY ALLOCATIONS: CREATE ALLOCATION(S)
// ==========================================
router.post('/faculty-allocations', async (req, res) => {
  try {
    const { department, year, facultyIds, facultyId } = req.body;

    if (!department || !year) {
      return res.status(400).json({
        success: false,
        message: 'Department and Year are required for faculty allocation.'
      });
    }

    const idsToAllocate = [];
    if (Array.isArray(facultyIds) && facultyIds.length > 0) {
      idsToAllocate.push(...facultyIds);
    } else if (facultyId) {
      idsToAllocate.push(facultyId);
    }

    if (idsToAllocate.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one faculty member to allocate.'
      });
    }

    const results = [];
    const skipped = [];
    const normDept = normalizeDepartment(department);
    const normYr = normalizeYear(year);

    for (const rawId of idsToAllocate) {
      let fac = await Faculty.findById(rawId);
      if (!fac) fac = await Faculty.findByFacultyId(rawId);
      if (!fac) {
        skipped.push({ id: rawId, reason: 'Faculty record not found' });
        continue;
      }

      const canonicalFacId = fac.id || fac._id;
      const existing = await FacultyAllocations.findByFacultyDeptYear(canonicalFacId, normDept, normYr);

      if (existing) {
        if (existing.active === false) {
          const reactivated = await FacultyAllocations.update(existing.id, {
            active: true,
            allocatedBy: req.user.id || 'admin'
          });
          const populated = await FacultyAllocations.populate(reactivated);
          results.push({ ...populated, status: 'reactivated' });
        } else {
          skipped.push({ id: rawId, name: fac.name, reason: 'Already allocated to this Department and Year' });
        }
      } else {
        const created = await FacultyAllocations.create({
          facultyId: canonicalFacId,
          department: normDept,
          year: normYr,
          active: true,
          allocatedBy: req.user.id || 'admin'
        });
        const populated = await FacultyAllocations.populate(created);
        results.push({ ...populated, status: 'created' });
      }
    }

    res.status(201).json({
      success: true,
      message: `Successfully processed ${results.length} faculty allocation(s).${skipped.length > 0 ? ` (${skipped.length} duplicate/skipped)` : ''}`,
      allocatedCount: results.length,
      skippedCount: skipped.length,
      data: results,
      skipped
    });
  } catch (err) {
    console.error('Create Allocation Error:', err);
    res.status(500).json({ success: false, message: 'Failed to create faculty allocation.', error: err.message });
  }
});

// ==========================================
// 8. FACULTY ALLOCATIONS: UPDATE ALLOCATION
// ==========================================
router.put('/faculty-allocations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { department, year, active } = req.body;

    const existing = await FacultyAllocations.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Faculty allocation record not found.' });
    }

    const updates = {};
    if (active !== undefined) updates.active = Boolean(active);
    if (department) updates.department = normalizeDepartment(department);
    if (year) updates.year = normalizeYear(year);

    if (updates.department || updates.year) {
      const checkDept = updates.department || existing.department;
      const checkYr = updates.year || existing.year;
      const facId = existing.facultyId;
      const duplicate = await FacultyAllocations.findByFacultyDeptYear(facId, checkDept, checkYr);
      if (duplicate && String(duplicate.id) !== String(id)) {
        return res.status(400).json({
          success: false,
          message: 'An allocation for this faculty in the selected Department and Year already exists.'
        });
      }
    }

    const updated = await FacultyAllocations.update(id, updates);
    const populated = await FacultyAllocations.populate(updated);

    res.json({
      success: true,
      message: 'Faculty allocation updated successfully.',
      data: populated
    });
  } catch (err) {
    console.error('Update Allocation Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update faculty allocation.', error: err.message });
  }
});

// ==========================================
// 9. FACULTY ALLOCATIONS: REMOVE / DEACTIVATE
// ==========================================
router.delete('/faculty-allocations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await FacultyAllocations.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Faculty allocation not found.' });
    }

    // Set active = false as per Requirement 9
    const updated = await FacultyAllocations.update(id, { active: false });

    res.json({
      success: true,
      message: `Faculty allocation for ${existing.faculty?.name || 'faculty'} has been removed (deactivated).`,
      data: updated
    });
  } catch (err) {
    console.error('Remove Allocation Error:', err);
    res.status(500).json({ success: false, message: 'Failed to remove faculty allocation.', error: err.message });
  }
});

module.exports = router;
