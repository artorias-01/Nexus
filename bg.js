// Animated particle grid background + scanning shine line
(function() {
  const canvas = document.createElement('canvas');
  canvas.id = 'bgCanvas';
  canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.65;';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let W, H, particles;
  let scanY = 0;
  const scanSpeed = 0.5;

  function getAccent() {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#ffffff';
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
    const n = parseInt(hex, 16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function initParticles() {
    particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.5 + 0.4
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const accent = getAccent();
    let rgb = [255,255,255];
    try { if (accent.startsWith('#')) rgb = hexToRgb(accent); } catch(e) {}
    const [r,g,b] = rgb;

    // Connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 140) {
          ctx.beginPath();
          ctx.strokeStyle = accent;
          ctx.globalAlpha = (1 - dist / 140) * 0.35;
          ctx.lineWidth = 0.6;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Particles
    particles.forEach(p => {
      ctx.beginPath();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = accent;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    });

    // Scanning shine line
    scanY += scanSpeed;
    if (scanY > H + 100) scanY = -100;

    // Soft glow band
    const grad = ctx.createLinearGradient(0, scanY - 70, 0, scanY + 70);
    grad.addColorStop(0,   `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},0.03)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.12)`);
    grad.addColorStop(0.6, `rgba(${r},${g},${b},0.03)`);
    grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, scanY - 70, W, 140);

    // Sharp bright center line with glow
    ctx.beginPath();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 0.9;
    ctx.shadowColor = `rgb(${r},${g},${b})`;
    ctx.shadowBlur = 10;
    ctx.moveTo(0, scanY);
    ctx.lineTo(W, scanY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    requestAnimationFrame(draw);
  }

  resize();
  initParticles();
  draw();
  window.addEventListener('resize', () => { resize(); initParticles(); });
})();