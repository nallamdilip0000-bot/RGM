const { Projects, Milestones, Tasks } = require('./dbService');

/**
 * Recalculate and synchronize progress for a project and its milestones
 * Handles:
 * - Milestones with individual tasks (progress = completed tasks / total tasks)
 * - Milestones marked complete directly (progress = 100%)
 * - Project overall progress as the weighted average of milestone progress or project tasks
 * 
 * @param {string} projectId
 * @param {string} [specificMilestoneId]
 * @returns {Promise<{ projectProgress: number, totalMilestones: number, totalTasks: number }>}
 */
async function recalculateProgress(projectId, specificMilestoneId = null) {
  if (!projectId) return { projectProgress: 0, totalMilestones: 0, totalTasks: 0 };

  try {
    const projIdStr = String(projectId);
    const project = await Projects.findById(projIdStr);
    if (!project) return { projectProgress: 0, totalMilestones: 0, totalTasks: 0 };

    // 1. Fetch all milestones and tasks for this project
    const milestones = await Milestones.findByProject(projIdStr);
    const tasks = await Tasks.findByProject(projIdStr);

    // 2. Compute/update progress for each milestone
    const milestoneProgressList = [];

    for (const m of milestones) {
      const mIdStr = String(m.id || m._id);
      // Tasks under this milestone
      const mTasks = tasks.filter(t => {
        const tMId = t.milestoneId?.id || t.milestoneId?._id || t.milestoneId;
        return String(tMId) === mIdStr;
      });

      let mProgress = 0;
      let mStatus = m.status || 'Not Started';

      if (mTasks.length > 0) {
        const completedTasks = mTasks.filter(t => t.status === 'Completed').length;
        mProgress = Math.round((completedTasks / mTasks.length) * 100);

        if (mProgress === 100) {
          mStatus = 'Completed';
        } else if (mProgress > 0 && mStatus === 'Not Started') {
          mStatus = 'In Progress';
        }
      } else {
        // Milestone has no sub-tasks: check status and manual progress
        if (mStatus === 'Completed') {
          mProgress = 100;
        } else if (m.progress !== undefined && Number(m.progress) > 0) {
          mProgress = Math.min(100, Math.max(0, Number(m.progress)));
          if (mProgress === 100) {
            mStatus = 'Completed';
          } else if (mStatus === 'Not Started') {
            mStatus = 'In Progress';
          }
        } else {
          mProgress = 0;
        }
      }

      // If milestone progress or status changed in DB, update it
      if (m.progress !== mProgress || m.status !== mStatus) {
        await Milestones.update(mIdStr, { progress: mProgress, status: mStatus });
      }

      milestoneProgressList.push(mProgress);
    }

    // 3. Compute overall Project Progress
    let projectProgress = 0;

    if (milestones.length > 0) {
      const sum = milestoneProgressList.reduce((acc, val) => acc + val, 0);
      projectProgress = Math.round(sum / milestones.length);
    } else if (tasks.length > 0) {
      const completedTasks = tasks.filter(t => t.status === 'Completed').length;
      projectProgress = Math.round((completedTasks / tasks.length) * 100);
    } else {
      projectProgress = project.progress || 0;
    }

    projectProgress = Math.min(100, Math.max(0, projectProgress));

    // Update project progress in DB
    const projUpdates = { progress: projectProgress };
    if (projectProgress > 0 && project.status === 'Approved') {
      projUpdates.status = 'In Progress';
    }

    await Projects.update(projIdStr, projUpdates);

    return { projectProgress, totalMilestones: milestones.length, totalTasks: tasks.length };
  } catch (err) {
    console.error(`[recalculateProgress] Error for project ${projectId}:`, err);
    return { projectProgress: 0, error: err.message };
  }
}

module.exports = {
  recalculateProgress
};
