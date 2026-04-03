// Page transition helper
window.navigateTo = function(url) {
  document.body.classList.add('page-exit');
  setTimeout(() => { window.location.href = url; }, 380);
};

// Animate in on load
window.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('page-enter');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('page-enter');
    });
  });
});