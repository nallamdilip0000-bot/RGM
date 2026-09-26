/**
 * Theme & UI Initialization Utility
 * Manages modern clean UI state and accessibility
 */

document.addEventListener('DOMContentLoaded', () => {
  // Remove any obsolete theme canvases if present
  const oldCanvas = document.querySelector('.pastel-waves-canvas');
  if (oldCanvas) {
    oldCanvas.remove();
  }
});
