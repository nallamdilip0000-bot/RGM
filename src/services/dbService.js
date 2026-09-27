const os = require('os');
const fs = require('fs');
const path = require('path');

const {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} = require('../config/firebase');

// In-memory binary file buffer cache (fast retrieval for serverless & local)
const fileBufferCache = new Map();

// Local cache directory in OS temp directory (writable across all OS & serverless)
const tmpUploadDir = path.join(os.tmpdir(), 'project_tracker_uploads');
try {
  if (!fs.existsSync(tmpUploadDir)) {
    fs.mkdirSync(tmpUploadDir, { recursive: true });
  }
} catch (e) {
  // Ignore if unable
}

// In-memory cache & fallback layer
const memoryCache = {
  users: new Map(),
  faculty: new Map(),
  projects: new Map(),
  milestones: new Map(),
  tasks: new Map(),
  evaluations: new Map(),
  individual_evaluations: new Map(),
  notifications: new Map(),
  faculty_allocations: new Map(),
  project_documents: new Map(),
  project_document_data: new Map(),
  mentorship_attendance: new Map()
};

const { normalizeDepartment, normalizeYear, isDepartmentMatch, isYearMatch } = require('../utils/academicUtils');

let useFirestore = true;

/**
 * Generic Firestore CRUD Helper with automatic fallback
 */
const firestoreHelper = {
  async get(collName, id) {
    if (useFirestore) {
      try {
        const docRef = doc(db, collName, String(id));
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const item = { _id: snap.id, id: snap.id, ...snap.data() };
          memoryCache[collName].set(snap.id, item);
          return item;
        }
      } catch (err) {
        console.warn(`[Firestore Read Warning] ${collName}/${id}: ${err.message}. Using cache.`);
      }
    }
    return memoryCache[collName].get(String(id)) || null;
  },

  async list(collName, predicate = null) {
    let items = [];
    if (useFirestore) {
      try {
        const collRef = collection(db, collName);
        const snap = await getDocs(collRef);
        items = snap.docs.map(d => ({ _id: d.id, id: d.id, ...d.data() }));
        // Sync to cache
        items.forEach(i => memoryCache[collName].set(i.id, i));
      } catch (err) {
        console.warn(`[Firestore List Warning] ${collName}: ${err.message}. Using cache.`);
        items = Array.from(memoryCache[collName].values());
      }
    } else {
      items = Array.from(memoryCache[collName].values());
    }

    if (predicate) {
      return items.filter(predicate);
    }
    return items;
  },

  async create(collName, data, customId = null) {
    const id = customId || (data.id || (data._id || `id_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`));
    const cleanData = { ...data, _id: id, id, createdAt: data.createdAt || new Date().toISOString() };

    // Update memory cache immediately
    memoryCache[collName].set(id, cleanData);

    if (useFirestore) {
      try {
        const docRef = doc(db, collName, id);
        await setDoc(docRef, cleanData);
      } catch (err) {
        console.warn(`[Firestore Write Warning] ${collName}/${id}: ${err.message}. Data persisted in cache.`);
      }
    }

    return cleanData;
  },

  async update(collName, id, updateFields) {
    const current = await this.get(collName, id);
    if (!current) return null;

    const updated = { ...current, ...updateFields, updatedAt: new Date().toISOString() };
    memoryCache[collName].set(String(id), updated);

    if (useFirestore) {
      try {
        const docRef = doc(db, collName, String(id));
        await updateDoc(docRef, updateFields);
      } catch (err) {
        console.warn(`[Firestore Update Warning] ${collName}/${id}: ${err.message}. Cache updated.`);
      }
    }

    return updated;
  },

  async delete(collName, id) {
    memoryCache[collName].delete(String(id));
    if (useFirestore) {
      try {
        const docRef = doc(db, collName, String(id));
        await deleteDoc(docRef);
      } catch (err) {
        console.warn(`[Firestore Delete Warning] ${collName}/${id}: ${err.message}. Removed from cache.`);
      }
    }
    return true;
  }
};

// ==========================================
// 1. USERS (Students & Admin)
// ==========================================
const Users = {
  async findById(id) {
    return firestoreHelper.get('users', id);
  },
  async findOne(predicate) {
    const list = await firestoreHelper.list('users');
    return list.find(predicate) || null;
  },
  async findByEmail(email) {
    if (!email) return null;
    const lower = email.trim().toLowerCase();
    return this.findOne(u => u.email && u.email.toLowerCase() === lower);
  },
  async findByRegisterNumber(regNo) {
    if (!regNo) return null;
    const upper = regNo.trim().toUpperCase();
    return this.findOne(u => u.registerNumber && u.registerNumber.toUpperCase() === upper);
  },
  async create(userData) {
    return firestoreHelper.create('users', userData);
  },
  async update(id, data) {
    return firestoreHelper.update('users', id, data);
  },
  async listAll(predicate) {
    return firestoreHelper.list('users', predicate);
  },
  async delete(id) {
    return firestoreHelper.delete('users', id);
  },
  async count(predicate) {
    const items = await this.listAll(predicate);
    return items.length;
  }
};

// ==========================================
// 2. FACULTY
// ==========================================
const Faculty = {
  async findById(id) {
    return firestoreHelper.get('faculty', id);
  },
  async findOne(predicate) {
    const list = await firestoreHelper.list('faculty');
    return list.find(predicate) || null;
  },
  async findByEmail(email) {
    if (!email) return null;
    const lower = email.trim().toLowerCase();
    return this.findOne(f => f.email && f.email.toLowerCase() === lower);
  },
  async findByFacultyId(facId) {
    if (!facId) return null;
    const upper = facId.trim().toUpperCase();
    return this.findOne(f => f.facultyId && f.facultyId.toUpperCase() === upper);
  },
  async create(facultyData) {
    return firestoreHelper.create('faculty', facultyData);
  },
  async update(id, data) {
    return firestoreHelper.update('faculty', id, data);
  },
  async delete(id) {
    return firestoreHelper.delete('faculty', id);
  },
  async listActive() {
    return firestoreHelper.list('faculty', f => f.isActive !== false);
  },
  async listAll() {
    return firestoreHelper.list('faculty');
  },
  async count(predicate) {
    const items = await firestoreHelper.list('faculty', predicate);
    return items.length;
  }
};

// ==========================================
// 3. PROJECTS
// ==========================================
const Projects = {
  async findById(id) {
    const project = await firestoreHelper.get('projects', id);
    if (!project) return null;
    return this.populate(project);
  },
  async create(projData) {
    return firestoreHelper.create('projects', projData);
  },
  async update(id, data) {
    return firestoreHelper.update('projects', id, data);
  },
  async delete(id) {
    return firestoreHelper.delete('projects', id);
  },
  async listAll(predicate) {
    const list = await firestoreHelper.list('projects', predicate);
    return Promise.all(list.map(p => this.populate(p)));
  },
  async count(predicate) {
    const items = await firestoreHelper.list('projects', predicate);
    return items.length;
  },
  // Populate teamLeader, teamMembers, faculty
  async populate(project) {
    if (!project) return null;
    const projId = project.id || project._id;
    const populated = {
      ...project,
      _id: projId,
      id: projId
    };

    // Populate teamLeaderId
    if (project.teamLeaderId) {
      const leaderId = project.teamLeaderId?._id || project.teamLeaderId?.id || project.teamLeaderId;
      const leader = await Users.findById(leaderId);
      if (leader) {
        populated.teamLeaderId = {
          ...leader,
          _id: leader.id || leader._id,
          id: leader.id || leader._id
        };
      }
    }

    // Populate facultyId
    if (project.facultyId) {
      const facId = project.facultyId?._id || project.facultyId?.id || project.facultyId;
      let fac = await Faculty.findById(facId);
      if (!fac && typeof facId === 'string') {
        fac = await Faculty.findByFacultyId(facId);
      }
      if (!fac && typeof facId === 'string') {
        fac = await Faculty.findOne(f => String(f.id) === facId || String(f._id) === facId || (f.facultyId && f.facultyId.toUpperCase() === facId.toUpperCase()));
      }
      if (fac) {
        populated.facultyId = {
          ...fac,
          _id: fac.id || fac._id,
          id: fac.id || fac._id
        };
      }
    }

    // Set canonical department and year for project
    populated.year = project.year || populated.teamLeaderId?.year || '3rd Year';
    populated.department = project.department || populated.teamLeaderId?.department || 'Computer Science & Engineering';

    // Populate teamMemberIds
    if (Array.isArray(project.teamMemberIds)) {
      populated.teamMemberIds = await Promise.all(
        project.teamMemberIds.map(async m => {
          if (m && typeof m === 'object' && m.name) {
            let email = m.email || '';
            let phone = m.phone || '';
            let realId = m._id || m.id || m.registerNumber;
            if ((!email || !phone) && m.registerNumber) {
              const u = await Users.findOne(usr => usr.registerNumber && usr.registerNumber.toUpperCase() === String(m.registerNumber).toUpperCase());
              if (u) {
                email = email || u.email || '';
                phone = phone || u.phone || '';
                realId = u.id || u._id || realId;
              }
            }
            return {
              _id: realId,
              id: realId,
              name: m.name,
              registerNumber: m.registerNumber || '',
              department: m.department || populated.department,
              year: m.year || populated.year,
              email,
              phone,
              isLeader: Boolean(m.isLeader)
            };
          }
          const user = await Users.findById(m?._id || m);
          if (user) {
            return {
              _id: user.id || user._id,
              id: user.id || user._id,
              name: user.name,
              registerNumber: user.registerNumber || '',
              department: user.department || populated.department,
              year: user.year || populated.year,
              email: user.email || '',
              phone: user.phone || '',
              isLeader: String(user.id || user._id) === String(populated.teamLeaderId?.id || populated.teamLeaderId?._id)
            };
          }
          return {
            _id: m,
            id: m,
            name: 'Student',
            registerNumber: '',
            department: populated.department,
            year: populated.year,
            isLeader: false
          };
        })
      );
    }

    return populated;
  }
};

// ==========================================
// 4. MILESTONES
// ==========================================
const Milestones = {
  async findById(id) {
    return firestoreHelper.get('milestones', id);
  },
  async findByProject(projectId) {
    return firestoreHelper.list('milestones', m => String(m.projectId) === String(projectId));
  },
  async listAll(predicate = null) {
    return firestoreHelper.list('milestones', predicate);
  },
  async create(data) {
    return firestoreHelper.create('milestones', data);
  },
  async update(id, data) {
    return firestoreHelper.update('milestones', id, data);
  },
  async delete(id) {
    return firestoreHelper.delete('milestones', id);
  },
  async deleteByProject(projectId) {
    const items = await this.findByProject(projectId);
    for (const item of items) {
      await this.delete(item.id);
    }
  }
};

// ==========================================
// 5. TASKS
// ==========================================
const Tasks = {
  async findById(id) {
    const task = await firestoreHelper.get('tasks', id);
    if (!task) return null;
    return this.populate(task);
  },
  async findByProject(projectId) {
    const list = await firestoreHelper.list('tasks', t => String(t.projectId) === String(projectId));
    return Promise.all(list.map(t => this.populate(t)));
  },
  async findByMilestone(milestoneId) {
    return firestoreHelper.list('tasks', t => String(t.milestoneId) === String(milestoneId));
  },
  async listAll(predicate = null) {
    const list = await firestoreHelper.list('tasks', predicate);
    return Promise.all(list.map(t => this.populate(t)));
  },
  async create(data) {
    return firestoreHelper.create('tasks', data);
  },
  async update(id, data) {
    return firestoreHelper.update('tasks', id, data);
  },
  async delete(id) {
    return firestoreHelper.delete('tasks', id);
  },
  async deleteByProject(projectId) {
    const items = await this.findByProject(projectId);
    for (const item of items) {
      await this.delete(item.id);
    }
  },
  async count(predicate) {
    const list = await firestoreHelper.list('tasks', predicate);
    return list.length;
  },
  async populate(task) {
    if (!task) return null;
    const populated = { ...task };
    const project = task.projectId ? await firestoreHelper.get('projects', task.projectId) : null;
    const projectMembers = (project?.teamMemberIds || []).map(m => (typeof m === 'object' && m !== null ? m : { _id: m, id: m }));

    const resolveMember = async (raw) => {
      if (!raw) return null;
      if (typeof raw === 'object' && raw.name) {
        return {
          _id: raw._id || raw.id || raw.registerNumber,
          id: raw.id || raw._id || raw.registerNumber,
          name: raw.name,
          registerNumber: raw.registerNumber || '',
          email: raw.email || '',
          phone: raw.phone || ''
        };
      }
      const rawId = String(raw._id || raw.id || raw);
      const user = await Users.findById(rawId);
      if (user) {
        return {
          _id: user.id || user._id,
          id: user.id || user._id,
          name: user.name,
          registerNumber: user.registerNumber || '',
          email: user.email || '',
          phone: user.phone || ''
        };
      }
      const m = projectMembers.find(pm => String(pm._id || pm.id || pm.registerNumber) === rawId);
      if (m && m.name) {
        return {
          _id: m._id || m.id || m.registerNumber,
          id: m.id || m._id || m.registerNumber,
          name: m.name,
          registerNumber: m.registerNumber || '',
          email: m.email || '',
          phone: m.phone || ''
        };
      }
      return { _id: rawId, id: rawId, name: 'Team Member', registerNumber: '' };
    };

    if (task.isGroupTask || task.assignedTo === 'ALL' || task.assignedTo === 'group') {
      populated.isGroupTask = true;
      populated.assignedMembers = (await Promise.all(projectMembers.map(resolveMember))).filter(Boolean);
      populated.assignedTo = {
        name: 'Entire Team (Group Task)',
        isGroup: true,
        membersCount: projectMembers.length
      };
    } else if (Array.isArray(task.assignedTo) || Array.isArray(task.assignedMembers) || Array.isArray(task.assignedMemberIds)) {
      const rawList = Array.isArray(task.assignedMembers) && task.assignedMembers.length > 0
        ? task.assignedMembers
        : (Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedMemberIds || []);

      const resolvedList = (await Promise.all(rawList.map(resolveMember))).filter(Boolean);
      populated.assignedMembers = resolvedList;
      if (resolvedList.length === 1) {
        populated.assignedTo = resolvedList[0];
      } else if (resolvedList.length > 1) {
        populated.assignedTo = {
          name: resolvedList.map(m => m.name).join(', '),
          members: resolvedList,
          isMultiple: true
        };
      } else {
        populated.assignedTo = { name: 'Unassigned', registerNumber: '' };
      }
    } else if (task.assignedTo) {
      const single = await resolveMember(task.assignedTo);
      populated.assignedTo = single || { name: 'Unassigned', registerNumber: '' };
      populated.assignedMembers = single ? [single] : [];
    } else {
      populated.assignedTo = { name: 'Unassigned', registerNumber: '' };
      populated.assignedMembers = [];
    }

    if (task.milestoneId) {
      const ms = await Milestones.findById(task.milestoneId?._id || task.milestoneId);
      if (ms) populated.milestoneId = ms;
    }
    return populated;
  }
};

// ==========================================
// 6. EVALUATIONS (Rubric 100 Marks Max)
// ==========================================
const Evaluations = {
  async findByProject(projectId) {
    const list = await firestoreHelper.list('evaluations', e => String(e.projectId) === String(projectId));
    return list[0] || null;
  },
  async upsert(projectId, data) {
    const existing = await this.findByProject(projectId);
    if (existing) {
      return firestoreHelper.update('evaluations', existing.id, data);
    } else {
      return firestoreHelper.create('evaluations', { ...data, projectId });
    }
  },
  async listAll() {
    return firestoreHelper.list('evaluations');
  },
  async deleteByProject(projectId) {
    const existing = await this.findByProject(projectId);
    if (existing) await firestoreHelper.delete('evaluations', existing.id);
  }
};

// ==========================================
// 7. INDIVIDUAL EVALUATIONS
// ==========================================
const IndividualEvaluations = {
  async findByProject(projectId) {
    const list = await firestoreHelper.list('individual_evaluations', e => String(e.projectId) === String(projectId));
    return Promise.all(list.map(async item => {
      const populated = { ...item };
      if (item.studentId) {
        const s = await Users.findById(item.studentId?._id || item.studentId);
        if (s) populated.studentId = s;
      }
      return populated;
    }));
  },
  async findByProjectAndStudent(projectId, studentId) {
    const list = await firestoreHelper.list('individual_evaluations', e =>
      String(e.projectId) === String(projectId) &&
      String(e.studentId?._id || e.studentId) === String(studentId)
    );
    if (list.length === 0) return null;
    const item = list[0];
    const s = await Users.findById(item.studentId?._id || item.studentId);
    return { ...item, studentId: s || item.studentId };
  },
  async upsert(projectId, studentId, data) {
    const existing = await this.findByProjectAndStudent(projectId, studentId);
    if (existing) {
      return firestoreHelper.update('individual_evaluations', existing.id, data);
    } else {
      return firestoreHelper.create('individual_evaluations', { ...data, projectId, studentId });
    }
  }
};

// ==========================================
// 8. NOTIFICATIONS
// ==========================================
const Notifications = {
  async findForUser(userId, userEmail = null, userRole = null, userRegNo = null) {
    const cleanUserId = userId && String(userId) !== 'undefined' && String(userId) !== 'null' ? String(userId).trim() : null;
    const cleanEmail = userEmail && String(userEmail) !== 'undefined' && String(userEmail) !== 'null' ? String(userEmail).trim().toLowerCase() : null;
    const cleanRole = userRole || 'student';
    const cleanRegNo = userRegNo && String(userRegNo) !== 'undefined' && String(userRegNo) !== 'null' ? String(userRegNo).trim().toUpperCase() : null;

    // If user is student, fetch authorized projects and member placeholder IDs to guarantee 100% project & student isolation
    let studentAllowedProjectIds = null;
    const studentMemberIds = new Set();

    // If user is faculty, fetch projects assigned to this faculty guide
    let facultyAssignedProjectIds = null;

    if (cleanRole === 'student') {
      studentAllowedProjectIds = new Set();
      const allProjects = await firestoreHelper.list('projects');

      for (const p of allProjects) {
        const pId = String(p.id || p._id);
        const leaderId = String(p.teamLeaderId?.id || p.teamLeaderId?._id || p.teamLeaderId || '');
        const leaderEmail = (p.teamLeaderId?.email || '').trim().toLowerCase();
        const leaderReg = (p.teamLeaderId?.registerNumber || '').trim().toUpperCase();

        const isLeader = (cleanUserId && leaderId === cleanUserId) ||
                         (cleanEmail && leaderEmail && leaderEmail === cleanEmail) ||
                         (cleanRegNo && leaderReg && leaderReg === cleanRegNo);

        let isMember = false;
        const rawMembers = Array.isArray(p.teamMemberIds) && p.teamMemberIds.length > 0
          ? p.teamMemberIds
          : (Array.isArray(p.teamMembers) ? p.teamMembers : []);

        for (const m of rawMembers) {
          if (!m) continue;
          const mId = String(m.id || m._id || '');
          const mEmail = (m.email || '').trim().toLowerCase();
          const mReg = (m.registerNumber || '').trim().toUpperCase();

          const matchesThisStudent = (cleanUserId && mId && mId === cleanUserId) ||
                                     (cleanEmail && mEmail && mEmail === cleanEmail) ||
                                     (cleanRegNo && mReg && mReg === cleanRegNo);

          if (matchesThisStudent) {
            isMember = true;
            if (mId) studentMemberIds.add(mId);
          }
        }

        if (isLeader || isMember) {
          studentAllowedProjectIds.add(pId);
        }
      }
    } else if (cleanRole === 'faculty') {
      facultyAssignedProjectIds = new Set();
      const allProjects = await firestoreHelper.list('projects');

      for (const p of allProjects) {
        const pId = String(p.id || p._id);
        const f = p.facultyId;
        const facObjId = f ? String(f.id || f._id || (typeof f === 'string' ? f : '')).trim() : '';
        const facCode = f && f.facultyId ? String(f.facultyId).trim().toUpperCase() : (typeof f === 'string' ? f.trim().toUpperCase() : '');
        const facEmail = f && f.email ? String(f.email).trim().toLowerCase() : (p.facultyEmail ? String(p.facultyEmail).trim().toLowerCase() : '');

        const matchesThisFaculty =
          (cleanUserId && facObjId && facObjId === cleanUserId) ||
          (cleanEmail && facEmail && facEmail === cleanEmail) ||
          (cleanRegNo && facCode && facCode === cleanRegNo) ||
          (cleanUserId && facCode && facCode === cleanUserId);

        if (matchesThisFaculty) {
          facultyAssignedProjectIds.add(pId);
        }
      }
    }

    const list = await firestoreHelper.list('notifications', n => {
      if (n.channel !== 'in-app') return false;

      // Role isolation: students should not receive faculty/admin notifications
      if (cleanRole === 'student') {
        if (n.userRole && n.userRole !== 'student') return false;

        // Project boundary isolation: if tied to a project, student MUST belong to that project
        if (n.projectId && studentAllowedProjectIds && !studentAllowedProjectIds.has(String(n.projectId))) {
          return false;
        }
      } else if (cleanRole === 'faculty') {
        if (n.userRole && n.userRole !== 'faculty') return false;

        // Faculty project boundary isolation:
        // A faculty member MUST NEVER receive notifications from another faculty's projects!
        if (n.projectId && facultyAssignedProjectIds && !facultyAssignedProjectIds.has(String(n.projectId))) {
          return false;
        }
      }

      // Strict user matching
      const targetUserId = n.userId && String(n.userId) !== 'undefined' && String(n.userId) !== 'null' ? String(n.userId).trim() : null;
      const targetEmail = n.recipientEmail && String(n.recipientEmail) !== 'undefined' && String(n.recipientEmail) !== 'null' ? String(n.recipientEmail).trim().toLowerCase() : null;

      const idMatch = Boolean(cleanUserId && targetUserId && targetUserId === cleanUserId);
      const emailMatch = Boolean(cleanEmail && targetEmail && targetEmail === cleanEmail);
      const regMatch = Boolean(cleanRegNo && targetUserId && targetUserId.toUpperCase() === cleanRegNo);
      const memberIdMatch = Boolean(targetUserId && studentMemberIds.has(targetUserId));

      return idMatch || emailMatch || regMatch || memberIdMatch;
    });

    // Sort by latest first
    const sorted = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Deduplicate in-memory to prevent double notifications in website bell
    const unique = [];
    const seen = new Set();

    for (const item of sorted) {
      const dedupeKey = `${item.type || ''}_${item.title || ''}_${item.message || ''}_${item.taskId || ''}_${item.projectId || ''}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        unique.push(item);
      }
    }

    return unique;
  },
  async listAll(predicate = null) {
    return firestoreHelper.list('notifications', predicate);
  },
  async findOne(predicate) {
    const list = await firestoreHelper.list('notifications');
    return list.find(predicate) || null;
  },
  async create(data) {
    return firestoreHelper.create('notifications', data);
  },
  async markRead(id) {
    return firestoreHelper.update('notifications', id, { read: true });
  },
  async markAllRead(userId, userEmail = null, userRole = null, userRegNo = null) {
    const userNotifs = await this.findForUser(userId, userEmail, userRole, userRegNo);
    for (const n of userNotifs) {
      if (!n.read) await this.markRead(n.id || n._id);
    }
    return true;
  },
  async clearAll(userId, userEmail = null, userRole = null, userRegNo = null) {
    const userNotifs = await this.findForUser(userId, userEmail, userRole, userRegNo);
    for (const n of userNotifs) {
      await this.delete(n.id || n._id);
    }
    return true;
  },
  async delete(id) {
    return firestoreHelper.delete('notifications', id);
  },
  async countSentEmailsToday(email, sinceDate) {
    if (!email) return 0;
    const cleanEmail = String(email).trim().toLowerCase();
    const list = await firestoreHelper.list('notifications', n => {
      if (n.channel !== 'email') return false;
      if (!['sent', 'simulated'].includes(n.status)) return false;
      const targetEmail = (n.recipientEmail || '').trim().toLowerCase();
      if (targetEmail !== cleanEmail) return false;
      const created = new Date(n.createdAt);
      return created >= sinceDate;
    });
    return list.length;
  },
  async countSentDeadlineEmailsToday(email, sinceDate) {
    if (!email) return 0;
    const cleanEmail = String(email).trim().toLowerCase();
    const list = await firestoreHelper.list('notifications', n => {
      if (n.channel !== 'email') return false;
      if (!['sent', 'simulated'].includes(n.status)) return false;
      const targetEmail = (n.recipientEmail || '').trim().toLowerCase();
      if (targetEmail !== cleanEmail) return false;
      const isDeadline = Boolean(n.isDeadlineReminder) ||
        (n.type && (n.type.includes('REMINDER') || n.type.includes('OVERDUE') || n.type.includes('DEADLINE')));
      if (!isDeadline) return false;
      const created = new Date(n.createdAt);
      return created >= sinceDate;
    });
    return list.length;
  },
  async getLastSentEmailTime(email) {
    if (!email) return null;
    const cleanEmail = String(email).trim().toLowerCase();
    const list = await firestoreHelper.list('notifications', n => {
      if (n.channel !== 'email') return false;
      if (!['sent', 'simulated'].includes(n.status)) return false;
      const targetEmail = (n.recipientEmail || '').trim().toLowerCase();
      return targetEmail === cleanEmail;
    });
    if (list.length === 0) return null;
    const sorted = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return new Date(sorted[0].createdAt);
  },
  async listAllLogs(limit = 100) {
    const list = await firestoreHelper.list('notifications');
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
  }
};

// ==========================================
// 9. FACULTY ALLOCATIONS (Department + Year)
// ==========================================
const FacultyAllocations = {
  async findById(id) {
    const item = await firestoreHelper.get('faculty_allocations', id);
    if (!item) return null;
    return this.populate(item);
  },
  async findOne(predicate) {
    const list = await firestoreHelper.list('faculty_allocations');
    const found = list.find(predicate);
    return found ? this.populate(found) : null;
  },
  async listAll(predicate = null) {
    const list = await firestoreHelper.list('faculty_allocations', predicate);
    return Promise.all(list.map(item => this.populate(item)));
  },
  async findByFacultyDeptYear(facultyId, department, year) {
    const list = await firestoreHelper.list('faculty_allocations');
    const fId = String(facultyId);
    const found = list.find(a =>
      (String(a.facultyId) === fId || String(a.facultyId?._id || a.facultyId?.id) === fId) &&
      isDepartmentMatch(a.department, department) &&
      isYearMatch(a.year, year)
    );
    return found ? this.populate(found) : null;
  },
  async findActiveAllocatedFaculty(department, year) {
    const list = await firestoreHelper.list('faculty_allocations', a =>
      a.active !== false &&
      isDepartmentMatch(a.department, department) &&
      isYearMatch(a.year, year)
    );
    const populated = await Promise.all(list.map(a => this.populate(a)));
    const map = new Map();
    for (const alloc of populated) {
      if (alloc.faculty && alloc.faculty.isActive !== false) {
        map.set(String(alloc.faculty.id || alloc.faculty._id), alloc.faculty);
      }
    }
    return Array.from(map.values());
  },
  async create(data) {
    const normDept = normalizeDepartment(data.department);
    const normYr = normalizeYear(data.year);
    return firestoreHelper.create('faculty_allocations', {
      ...data,
      department: normDept,
      year: normYr,
      active: data.active !== undefined ? data.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  },
  async update(id, data) {
    const updateData = { ...data, updatedAt: new Date().toISOString() };
    if (data.department) updateData.department = normalizeDepartment(data.department);
    if (data.year) updateData.year = normalizeYear(data.year);
    return firestoreHelper.update('faculty_allocations', id, updateData);
  },
  async delete(id) {
    return firestoreHelper.delete('faculty_allocations', id);
  },
  async populate(allocation) {
    if (!allocation) return null;
    const populated = { ...allocation };
    const rawFacId = String(allocation.facultyId?._id || allocation.facultyId?.id || allocation.facultyId);

    let fac = await Faculty.findById(rawFacId);
    if (!fac) {
      fac = await Faculty.findByFacultyId(rawFacId);
    }
    if (!fac) {
      fac = await Faculty.findOne(f => String(f.id) === rawFacId || String(f._id) === rawFacId || String(f.facultyId) === rawFacId);
    }

    if (fac) {
      populated.faculty = {
        _id: fac.id || fac._id,
        id: fac.id || fac._id,
        facultyId: fac.facultyId,
        name: fac.name,
        email: fac.email,
        department: fac.department,
        designation: fac.designation,
        phone: fac.phone,
        isActive: fac.isActive
      };
    } else {
      populated.faculty = {
        _id: rawFacId,
        id: rawFacId,
        facultyId: rawFacId,
        name: 'Faculty Member',
        email: '',
        department: allocation.department,
        designation: 'Faculty',
        isActive: true
      };
    }
    return populated;
  }
};

// ==========================================
// 10. PROJECT DOCUMENTS (Research paper, PPT, Report, etc.)
// ==========================================
const ProjectDocuments = {
  async findById(id) {
    return firestoreHelper.get('project_documents', id);
  },
  async findByProject(projectId) {
    const list = await firestoreHelper.list('project_documents', d => String(d.projectId) === String(projectId));
    return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  },
  async findByFaculty(facultyId) {
    const list = await firestoreHelper.list('project_documents', d => String(d.facultyId) === String(facultyId));
    return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  },
  async listAll(predicate) {
    const list = await firestoreHelper.list('project_documents', predicate);
    return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  },
  async create(data) {
    return firestoreHelper.create('project_documents', {
      ...data,
      createdAt: data.createdAt || new Date().toISOString()
    });
  },

  /**
   * Save binary file payload in Firestore (chunked if large) + RAM cache + OS tmp cache
   */
  async saveFile(docId, buffer, metadata = {}) {
    try {
      const cleanId = String(docId);
      if (!buffer || !Buffer.isBuffer(buffer)) return false;

      // 1. RAM buffer cache for instantaneous retrieval
      fileBufferCache.set(cleanId, buffer);

      // 2. OS tmp disk cache (works locally and within warm serverless instance)
      try {
        const tmpPath = path.join(tmpUploadDir, `${cleanId}_${metadata.fileName || 'file'}`);
        fs.writeFileSync(tmpPath, buffer);
      } catch (e) {
        // Disk write fallback ignore
      }

      // 3. Persistent Firestore storage (supports files up to 20MB via base64 chunking)
      if (useFirestore) {
        const base64Data = buffer.toString('base64');
        const CHUNK_SIZE = 600 * 1024; // 600KB base64 chunk (~450KB raw data)
        const totalLen = base64Data.length;

        if (totalLen <= CHUNK_SIZE) {
          // Single document storage
          const fileDocRef = doc(db, 'project_document_data', cleanId);
          await setDoc(fileDocRef, {
            docId: cleanId,
            data: base64Data,
            isChunked: false,
            totalChunks: 1,
            size: buffer.length,
            mimetype: metadata.mimetype || 'application/octet-stream',
            originalName: metadata.originalName || '',
            fileName: metadata.fileName || '',
            createdAt: new Date().toISOString()
          });
        } else {
          // Chunked multi-document storage
          const totalChunks = Math.ceil(totalLen / CHUNK_SIZE);
          for (let i = 0; i < totalChunks; i++) {
            const chunkStr = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const chunkRef = doc(db, 'project_document_data', `${cleanId}_chunk_${i}`);
            await setDoc(chunkRef, {
              docId: cleanId,
              chunkIndex: i,
              data: chunkStr,
              totalChunks
            });
          }
          // Header record
          const headerRef = doc(db, 'project_document_data', cleanId);
          await setDoc(headerRef, {
            docId: cleanId,
            isChunked: true,
            totalChunks,
            size: buffer.length,
            mimetype: metadata.mimetype || 'application/octet-stream',
            originalName: metadata.originalName || '',
            fileName: metadata.fileName || '',
            createdAt: new Date().toISOString()
          });
        }
      }
      return true;
    } catch (err) {
      console.error(`[ProjectDocuments.saveFile Error] ${docId}:`, err.message);
      return false;
    }
  },

  /**
   * Retrieve binary file payload from RAM -> OS tmp disk -> Firestore chunks
   */
  async getFile(docId) {
    try {
      const cleanId = String(docId);

      // 1. Check RAM buffer cache
      if (fileBufferCache.has(cleanId)) {
        return fileBufferCache.get(cleanId);
      }

      // 2. Check OS tmp disk cache
      try {
        if (fs.existsSync(tmpUploadDir)) {
          const files = fs.readdirSync(tmpUploadDir);
          const match = files.find(f => f.startsWith(`${cleanId}_`));
          if (match) {
            const buf = fs.readFileSync(path.join(tmpUploadDir, match));
            fileBufferCache.set(cleanId, buf);
            return buf;
          }
        }
      } catch (e) {
        // Disk read error ignore
      }

      // 3. Check public/uploads/documents (if running on local persistent machine)
      try {
        const publicUploads = path.join(__dirname, '../../public/uploads/documents');
        if (fs.existsSync(publicUploads)) {
          const docRecord = await this.findById(cleanId);
          if (docRecord && docRecord.fileName) {
            const localPath = path.join(publicUploads, docRecord.fileName);
            if (fs.existsSync(localPath)) {
              const buf = fs.readFileSync(localPath);
              fileBufferCache.set(cleanId, buf);
              return buf;
            }
          }
        }
      } catch (e) {
        // Local path check ignore
      }

      // 4. Retrieve from Firestore document data
      if (useFirestore) {
        const headerRef = doc(db, 'project_document_data', cleanId);
        const headerSnap = await getDoc(headerRef);
        if (headerSnap.exists()) {
          const headerData = headerSnap.data();
          if (!headerData.isChunked && headerData.data) {
            const buf = Buffer.from(headerData.data, 'base64');
            fileBufferCache.set(cleanId, buf);
            return buf;
          } else if (headerData.isChunked && headerData.totalChunks) {
            const totalChunks = headerData.totalChunks;
            let fullBase64 = '';
            for (let i = 0; i < totalChunks; i++) {
              const chunkRef = doc(db, 'project_document_data', `${cleanId}_chunk_${i}`);
              const chunkSnap = await getDoc(chunkRef);
              if (chunkSnap.exists()) {
                fullBase64 += (chunkSnap.data().data || '');
              }
            }
            if (fullBase64) {
              const buf = Buffer.from(fullBase64, 'base64');
              fileBufferCache.set(cleanId, buf);
              return buf;
            }
          }
        }
      }
      return null;
    } catch (err) {
      console.error(`[ProjectDocuments.getFile Error] ${docId}:`, err.message);
      return null;
    }
  },

  /**
   * Delete binary file data from memory, disk, and Firestore
   */
  async deleteFile(docId) {
    try {
      const cleanId = String(docId);
      fileBufferCache.delete(cleanId);

      // Delete from tmp
      try {
        if (fs.existsSync(tmpUploadDir)) {
          const files = fs.readdirSync(tmpUploadDir);
          files.filter(f => f.startsWith(`${cleanId}_`)).forEach(f => {
            try { fs.unlinkSync(path.join(tmpUploadDir, f)); } catch (e) {}
          });
        }
      } catch (e) {}

      // Delete from Firestore
      if (useFirestore) {
        const headerRef = doc(db, 'project_document_data', cleanId);
        const headerSnap = await getDoc(headerRef);
        if (headerSnap.exists()) {
          const data = headerSnap.data();
          if (data.isChunked && data.totalChunks) {
            for (let i = 0; i < data.totalChunks; i++) {
              try {
                await deleteDoc(doc(db, 'project_document_data', `${cleanId}_chunk_${i}`));
              } catch (e) {}
            }
          }
          await deleteDoc(headerRef);
        }
      }
      return true;
    } catch (err) {
      console.warn(`[ProjectDocuments.deleteFile Warning] ${docId}:`, err.message);
      return false;
    }
  },

  async delete(id) {
    await this.deleteFile(id);
    return firestoreHelper.delete('project_documents', id);
  },

  async deleteByProject(projectId) {
    const list = await this.findByProject(projectId);
    for (const d of list) {
      await this.delete(d.id || d._id);
    }
  }
};

const MentorshipAttendance = {
  async findById(id) {
    return firestoreHelper.get('mentorship_attendance', id);
  },
  async findByProject(projectId) {
    const list = await firestoreHelper.list('mentorship_attendance', d => String(d.projectId) === String(projectId));
    return list.sort((a, b) => new Date(b.meetingDate || b.createdAt || 0) - new Date(a.meetingDate || a.createdAt || 0));
  },
  async findByFaculty(facultyId) {
    const list = await firestoreHelper.list('mentorship_attendance', d => String(d.facultyId) === String(facultyId));
    return list.sort((a, b) => new Date(b.meetingDate || b.createdAt || 0) - new Date(a.meetingDate || a.createdAt || 0));
  },
  async listAll(predicate) {
    const list = await firestoreHelper.list('mentorship_attendance', predicate);
    return list.sort((a, b) => new Date(b.meetingDate || b.createdAt || 0) - new Date(a.meetingDate || a.createdAt || 0));
  },
  async create(data) {
    return firestoreHelper.create('mentorship_attendance', {
      ...data,
      createdAt: data.createdAt || new Date().toISOString()
    });
  },
  async update(id, data) {
    return firestoreHelper.update('mentorship_attendance', id, data);
  },
  async delete(id) {
    return firestoreHelper.delete('mentorship_attendance', id);
  },
  async deleteByProject(projectId) {
    const list = await this.findByProject(projectId);
    for (const d of list) {
      await this.delete(d.id || d._id);
    }
  }
};

module.exports = {
  Users,
  Faculty,
  Projects,
  Milestones,
  Tasks,
  Evaluations,
  IndividualEvaluations,
  Notifications,
  FacultyAllocations,
  ProjectDocuments,
  MentorshipAttendance
};


