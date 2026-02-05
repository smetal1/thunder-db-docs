/**
 * ThunderDB — 3D Isometric Pixel Block Lightning Animation
 * Creates an animated lightning bolt made of LEGO-style 3D blocks
 */
(function () {
  'use strict';

  // ── Only run on homepage ──────────────────────────────
  var hero = document.querySelector('.td-cover-block');
  if (!hero) return;

  // ── Config ────────────────────────────────────────────
  var W  = 20;   // half-width of isometric tile
  var H  = 10;   // quarter-height of isometric tile
  var D  = 16;   // depth (vertical thickness) of each block
  var BW = W * 2; // full block width  = 40
  var BH = H * 2 + D; // full block height = 36

  // Lightning bolt: [row, col, stackHeight]
  var BOLT = [
    [0, 5, 1], [0, 6, 1],
    [1, 4, 1], [1, 5, 2],
    [2, 3, 1], [2, 4, 2], [2, 5, 1],
    [3, 1, 1], [3, 2, 1], [3, 3, 2], [3, 4, 3], [3, 5, 2], [3, 6, 1], [3, 7, 1],
    [4, 4, 1], [4, 5, 2], [4, 6, 1],
    [5, 3, 1], [5, 4, 2],
    [6, 2, 1], [6, 3, 1],
    [7, 1, 1], [7, 2, 1],
  ];

  // Color palettes per stack height
  var PALETTES = [
    { top: '#FF8833', left: '#A83800', right: '#D45200' },
    { top: '#FFAA33', left: '#C05500', right: '#FF6B00' },
    { top: '#FFD044', left: '#D48800', right: '#FFAA00' },
  ];

  // ── Compute scene offset to center bolt ───────────────
  var minX = Infinity, maxX = -Infinity;
  var minY = Infinity, maxY = -Infinity;
  BOLT.forEach(function (b) {
    var r = b[0], c = b[1], sh = b[2];
    for (var z = 0; z < sh; z++) {
      var sx = (c - r) * W;
      var sy = (c + r) * H - z * D;
      if (sx < minX) minX = sx;
      if (sx + BW > maxX) maxX = sx + BW;
      if (sy < minY) minY = sy;
      if (sy + BH > maxY) maxY = sy + BH;
    }
  });
  var boltW = maxX - minX;
  var boltH = maxY - minY;
  var sceneW = Math.max(boltW + 60, 320);
  var sceneH = Math.max(boltH + 60, 280);
  var offX = (sceneW - boltW) / 2 - minX;
  var offY = (sceneH - boltH) / 2 - minY;

  // ── Build DOM ─────────────────────────────────────────
  var wrapper = document.createElement('div');
  wrapper.className = 'thunder-anim';
  wrapper.setAttribute('aria-hidden', 'true');

  var scene = document.createElement('div');
  scene.className = 'thunder-anim__scene';
  scene.style.width  = sceneW + 'px';
  scene.style.height = sceneH + 'px';
  wrapper.appendChild(scene);

  // Glow
  var glow = document.createElement('div');
  glow.className = 'thunder-anim__glow';
  scene.appendChild(glow);

  // Build blocks
  var idx = 0;
  BOLT.forEach(function (b) {
    var r = b[0], c = b[1], sh = b[2];
    for (var z = 0; z < sh; z++) {
      makeBlock(r, c, z, sh, idx);
      idx++;
    }
  });

  // Flash overlay
  var flash = document.createElement('div');
  flash.className = 'thunder-anim__flash';
  wrapper.appendChild(flash);

  // Particles
  for (var i = 0; i < 16; i++) makeParticle();

  hero.style.position = hero.style.position || 'relative';
  hero.appendChild(wrapper);

  // ── Flash loop ────────────────────────────────────────
  function doFlash() {
    flash.classList.add('is-active');
    glow.classList.add('is-flash');
    setTimeout(function () {
      flash.classList.remove('is-active');
      glow.classList.remove('is-flash');
    }, 200);
  }
  setTimeout(doFlash, idx * 55 + 600);
  setInterval(doFlash, 4500 + Math.random() * 2000);

  // ── Block builder ─────────────────────────────────────
  function makeBlock(row, col, z, maxH, index) {
    var x = (col - row) * W + offX;
    var y = (col + row) * H - z * D + offY;
    var pal = PALETTES[Math.min(z, PALETTES.length - 1)];

    var el = document.createElement('div');
    el.className = 'pxblock';
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.zIndex = (row * 10 + col + z * 100);
    el.style.animationDelay = (index * 0.05) + 's';

    // Faces
    var top   = document.createElement('div');
    top.className = 'pxblock__top';
    top.style.background = pal.top;

    var left  = document.createElement('div');
    left.className = 'pxblock__left';
    left.style.background = pal.left;

    var right = document.createElement('div');
    right.className = 'pxblock__right';
    right.style.background = pal.right;

    el.appendChild(top);
    el.appendChild(left);
    el.appendChild(right);

    // LEGO stud on top-most block
    if (z === maxH - 1) {
      var stud = document.createElement('div');
      stud.className = 'pxblock__stud';
      var sc = adjustClr(pal.top, 18);
      stud.style.background = 'radial-gradient(ellipse at 40% 35%, ' + sc + ', ' + pal.top + ')';
      stud.style.boxShadow  = 'inset 0 1px 0 ' + sc + ', inset 0 -1px 2px ' + adjustClr(pal.top, -25);
      el.appendChild(stud);
    }

    scene.appendChild(el);
  }

  // ── Particle builder ──────────────────────────────────
  function makeParticle() {
    var el = document.createElement('div');
    el.className = 'thunder-anim__particle';
    var sz = 3 + Math.random() * 6;
    el.style.width  = sz + 'px';
    el.style.height = sz + 'px';
    el.style.left   = (Math.random() * sceneW) + 'px';
    el.style.top    = (20 + Math.random() * (sceneH - 40)) + 'px';
    el.style.animationDuration = (2.5 + Math.random() * 3) + 's';
    el.style.animationDelay    = (Math.random() * 5) + 's';
    el.style.background = Math.random() > 0.5 ? '#FF6B00' : '#FFAA00';
    scene.appendChild(el);
  }

  // ── Color helper ──────────────────────────────────────
  function adjustClr(hex, pct) {
    var n = parseInt(hex.replace('#', ''), 16);
    var r = Math.min(255, Math.max(0, (n >> 16)       + Math.round(2.55 * pct)));
    var g = Math.min(255, Math.max(0, ((n >> 8) & 255) + Math.round(2.55 * pct)));
    var b = Math.min(255, Math.max(0, (n & 255)        + Math.round(2.55 * pct)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ── Feature card entrance animation ───────────────────
  var cards = document.querySelectorAll('.feature-card');
  if (cards.length && 'IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    cards.forEach(function (card, i) {
      card.classList.add('anim-ready');
      card.style.transitionDelay = (i * 0.1) + 's';
      obs.observe(card);
    });
  }
})();
