/* ==========================================================================
   HOUSE OF 21 — scene.js
   The basement: a 1366 x 768 stage scaled to the window, four photographed
   TVs with the game drawn onto their glass, a hanging bulb that swings with
   the mouse and flickers, darkness outside its light, parallax, cables,
   heart monitors, the close-up view and the hand cursor.
   Classic script, ES2017. Everything degrades in LOW FX mode.
   ========================================================================== */
(function (H) {
  'use strict';

  var ART = H.ART, FX = H.FX;
  var $ = function (id) { return document.getElementById(id); };
  var SW = 1366, SH = 768;

  /* Where each TV image sits on the stage (x, y, display width) and the size
     its screen content is laid out at before it is bent onto the glass. */
  var TV = {
    l: { x: 30, y: 150, w: 440, vw: 340, vh: 386, depth: 0.85 },
    m: { x: 503, y: 72, w: 360, vw: 340, vh: 322, depth: 1 },
    b: { x: 458, y: 404, w: 450, vw: 330, vh: 206, depth: 1 },
    r: { x: 880, y: 136, w: 460, vw: 380, vh: 345, depth: 0.85 }
  };
  var PIVOT = { x: 683, y: -260 };       // where the bulb's cord is fixed
  var BULB_SCALE = 0.55;
  var GLASS_Y = 50;                       // stage y of the glowing glass at rest

  var S = {
    scale: 1, mx: 0, my: 0, px: 0, py: 0, tpx: 0, tpy: 0,
    theta: 0, omega: 0, lastMouseX: null, lastT: 0,
    light: 1, flick: null, nextFlick: 0, dread: 0,
    ecg: {}, zoomKey: null, zoomHome: null, raf: 0, started: false, low: false
  };

  /* ------------------------------------------------------------------ */
  /* Projective transform: a w x h box onto four corner points           */
  /* ------------------------------------------------------------------ */
  function quadMatrix(w, h, q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var a, b, c, d, e, f, g, hh;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
      a = x1 - x0; b = x3 - x0; c = x0; d = y1 - y0; e = y3 - y0; f = y0; g = 0; hh = 0;
    } else {
      var den = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / den;
      hh = (dx1 * dy3 - dx3 * dy1) / den;
      a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3; c = x0;
      d = y1 - y0 + g * y1; e = y3 - y0 + hh * y3; f = y0;
    }
    a /= w; d /= w; g /= w; b /= h; e /= h; hh /= h;
    return 'matrix3d(' + [a, d, 0, g, b, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1].map(function (n) { return +n.toFixed(8); }).join(',') + ')';
  }

  function placeTVs() {
    Object.keys(TV).forEach(function (k) {
      var t = TV[k], art = ART.tv[k], s = t.w / art.w;
      t.s = s; t.h = art.h * s;
      var img = $('tvImg' + k.toUpperCase());
      img.style.left = t.x + 'px'; img.style.top = t.y + 'px';
      img.style.width = t.w + 'px'; img.style.height = t.h + 'px';
      var quad = art.quad.map(function (p) { return [t.x + p[0] * s, t.y + p[1] * s]; });
      var scr = $('scr' + k.toUpperCase());
      scr.style.width = t.vw + 'px'; scr.style.height = t.vh + 'px';
      scr.style.transform = quadMatrix(t.vw, t.vh, quad);
      var content = scr.querySelector('.scr-content');
      if (content) { content.style.width = t.vw + 'px'; content.style.height = t.vh + 'px'; }
      t.quad = quad;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Fit the stage to the window                                         */
  /* ------------------------------------------------------------------ */
  function fit() {
    var w = window.innerWidth || SW, h = window.innerHeight || SH;
    S.scale = Math.min(w / SW, h / SH);
    var st = $('stage');
    st.style.transform = 'translate(' + ((w - SW * S.scale) / 2).toFixed(1) + 'px,' + ((h - SH * S.scale) / 2).toFixed(1) + 'px) scale(' + S.scale.toFixed(4) + ')';
    if (S.zoomKey) sizeZoom();
  }

  /* ------------------------------------------------------------------ */
  /* Fisheye map: red = sideways pull, green = vertical pull              */
  /* ------------------------------------------------------------------ */
  function buildFisheye() {
    var n = 96, cv = document.createElement('canvas');
    cv.width = n; cv.height = n;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1;
        var r2 = u * u + v * v;
        // sample further out toward the edges: the middle bulges toward you
        var k = 0.5 * r2;
        var i = (y * n + x) * 4;
        d[i] = Math.max(0, Math.min(255, Math.round(128 + 127 * u * k)));
        d[i + 1] = Math.max(0, Math.min(255, Math.round(128 + 127 * v * k)));
        d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    var fe = $('fishMap');
    var url = cv.toDataURL('image/png');
    fe.setAttribute('href', url);
    fe.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
  }

  /* ------------------------------------------------------------------ */
  /* Cables: shaded, gritty rubber, drawn once                           */
  /* ------------------------------------------------------------------ */
  function cable(ctx, pts, w, tone) {
    function path() {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 6) ctx.bezierCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(0, w * 0.35); path(); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = w * 1.25; ctx.stroke(); ctx.restore();
    path(); ctx.strokeStyle = '#040404'; ctx.lineWidth = w; ctx.stroke();
    path(); ctx.strokeStyle = tone || '#1a1a1a'; ctx.lineWidth = w * 0.55; ctx.stroke();
    ctx.save(); ctx.translate(0, -w * 0.18); path(); ctx.strokeStyle = 'rgba(150,150,150,0.22)'; ctx.lineWidth = Math.max(1, w * 0.14); ctx.stroke(); ctx.restore();
  }
  function grit(ctx) {
    var w = ctx.canvas.width, h = ctx.canvas.height;
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      var n = (Math.random() - 0.5) * 26;
      d[i] = Math.max(0, d[i] + n); d[i + 1] = Math.max(0, d[i + 1] + n); d[i + 2] = Math.max(0, d[i + 2] + n);
    }
    ctx.putImageData(img, 0, 0);
  }
  function drawWires() {
    var b = $('wiresBack').getContext('2d'), f = $('wiresFront').getContext('2d');
    // behind the TVs: down from the ceiling and into the wall
    cable(b, [140, -20, 150, 60, 210, 120, 250, 175], 9);
    cable(b, [60, -20, 40, 140, 120, 220, 170, 250], 7, '#141414');
    cable(b, [1230, -20, 1250, 80, 1180, 110, 1120, 160], 9);
    cable(b, [1320, -20, 1300, 160, 1260, 200, 1230, 230], 7, '#151515');
    cable(b, [600, -20, 590, 40, 560, 60, 560, 100], 6);
    cable(b, [770, -20, 790, 30, 820, 70, 812, 100], 6, '#141414');
    cable(b, [470, 360, 480, 420, 440, 440, 470, 520], 8);
    cable(b, [880, 330, 860, 400, 920, 430, 900, 520], 8, '#141414');
    cable(b, [300, 560, 330, 640, 420, 600, 470, 650], 10);
    cable(b, [1060, 520, 1010, 600, 940, 580, 905, 650], 10, '#151515');
    grit(b);
    // in front: drooping bundles in the corners and coils on the floor
    cable(f, [-30, 30, 120, 160, 250, 40, 380, 10], 13);
    cable(f, [-30, 70, 90, 210, 210, 120, 330, -10], 10, '#161616');
    cable(f, [1396, 50, 1260, 170, 1140, 40, 1020, -10], 13);
    cable(f, [1396, 100, 1290, 220, 1180, 110, 1080, -10], 10, '#161616');
    cable(f, [-30, 700, 120, 650, 210, 790, 380, 730, 470, 700, 520, 760, 560, 800], 15);
    cable(f, [-30, 740, 160, 700, 260, 760, 330, 800], 11, '#151515');
    cable(f, [1396, 690, 1250, 650, 1180, 790, 1000, 730, 920, 710, 880, 770, 850, 800], 15);
    cable(f, [1396, 735, 1220, 705, 1120, 760, 1060, 800], 11, '#151515');
    grit(f);
  }

  /* ------------------------------------------------------------------ */
  /* Heart monitors                                                      */
  /* ------------------------------------------------------------------ */
  var BPM = [0, 138, 104, 76, 64, 56];
  function Ecg(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.w = canvas.width; this.h = canvas.height;
    this.x = 0; this.lastY = this.h / 2; this.t = 0;
    this.lives = 3; this.max = 3; this.dead = false; this.flatAt = 0;
    this.ctx.fillStyle = '#050505'; this.ctx.fillRect(0, 0, this.w, this.h);
    this.grid(0, this.w);
  }
  Ecg.prototype.grid = function (x0, x1) {
    var ctx = this.ctx;
    ctx.fillStyle = '#050505'; ctx.fillRect(x0, 0, x1 - x0, this.h);
    ctx.fillStyle = 'rgba(220,215,205,0.08)';
    for (var x = Math.ceil(x0 / 8) * 8; x < x1; x += 8) ctx.fillRect(x, 0, 1, this.h);
    for (var y = 4; y < this.h; y += 8) ctx.fillRect(x0, y, x1 - x0, 1);
  };
  Ecg.prototype.set = function (lives, max) {
    if (lives > 0 && this.dead) { this.dead = false; }
    this.lives = lives; this.max = max || 3;
    if (lives <= 0 && !this.dead) { this.dead = true; this.flatAt = Date.now(); }
  };
  Ecg.prototype.wave = function (p) {   // p = seconds into the beat
    var g = function (c, wd, a) { return a * Math.exp(-((p - c) * (p - c)) / (2 * wd * wd)); };
    return g(0.08, 0.025, 0.12) - g(0.17, 0.01, 0.14) + g(0.2, 0.012, 1) - g(0.23, 0.012, 0.32) + g(0.42, 0.045, 0.24);
  };
  Ecg.prototype.step = function (dt) {
    var speed = this.w / 2.6;
    var bpm = this.dead ? 0 : BPM[Math.max(1, Math.min(5, this.lives))] || 80;
    var beat = bpm ? 60 / bpm : 1;
    var nx = this.x + speed * dt;
    var ctx = this.ctx, mid = this.h * 0.58, amp = this.h * 0.46;
    // erase a little ahead of the trace
    var ahead = 10;
    if (nx + ahead <= this.w) this.grid(this.x + 1, Math.min(this.w, nx + ahead));
    else { this.grid(this.x + 1, this.w); this.grid(0, (nx + ahead) - this.w); }
    var steps = Math.max(1, Math.ceil((nx - this.x) / 1.5));
    ctx.lineWidth = 1.6; ctx.strokeStyle = this.dead ? '#8c8c8c' : '#e3241f';
    ctx.beginPath();
    var px = this.x, py = this.lastY;
    ctx.moveTo(px, py);
    for (var i = 1; i <= steps; i++) {
      var x = this.x + (nx - this.x) * i / steps;
      this.t += dt / steps;
      var y = this.dead ? mid + (Math.random() - 0.5) * 0.8 : mid - this.wave(this.t % beat) * amp;
      if (x >= this.w) { ctx.stroke(); ctx.beginPath(); x -= this.w; px = x; ctx.moveTo(x, y); }
      ctx.lineTo(x, y);
      px = x; py = y;
      if (!this.dead && this.onBeat && Math.abs((this.t % beat) - 0.2) < dt / steps) this.onBeat();
    }
    ctx.stroke();
    this.x = nx >= this.w ? nx - this.w : nx;
    this.lastY = py;
  };

  function setLives(who, lives, max) {
    var e = S.ecg[who];
    if (!e) return;
    var wasDead = e.dead;
    e.set(lives, max);
    if (e.dead && !wasDead) FX.flatline(who, true);
    if (!e.dead && wasDead) FX.flatline(who, false);
  }

  /* ------------------------------------------------------------------ */
  /* Bulb: pendulum, light, flicker                                     */
  /* ------------------------------------------------------------------ */
  var rig, darkness, blackout, glow, beam, bulbImg, L;
  function setupBulb() {
    rig = $('bulbRig'); darkness = $('darkness'); blackout = $('blackout');
    glow = $('bulbGlow'); beam = $('beam'); bulbImg = $('bulbImg');
    var bi = ART.img.bulb, gx = ART.bulbGlass.x, gy = ART.bulbGlass.y;
    L = GLASS_Y - PIVOT.y;
    var w = bi[0] * BULB_SCALE, h = bi[1] * BULB_SCALE;
    rig.style.left = PIVOT.x + 'px'; rig.style.top = PIVOT.y + 'px';
    bulbImg.style.width = w + 'px'; bulbImg.style.height = h + 'px';
    bulbImg.style.left = (-gx * BULB_SCALE) + 'px';
    bulbImg.style.top = (L - gy * BULB_SCALE) + 'px';
    rig.querySelector('.bulb-cord').style.height = (L - gy * BULB_SCALE + 2) + 'px';
    glow.style.top = L + 'px'; beam.style.top = L + 'px';
  }

  function scheduleFlicker(now) {
    var d = S.dread;
    S.nextFlick = now + (2600 + Math.random() * 7000) * (1 - d * 0.55);
  }
  function startFlicker(now) {
    var r = Math.random(), seq;
    if (r < 0.12 + S.dread * 0.1) seq = [[0.05, 90], [0.9, 60], [0.04, 260], [0.7, 50], [0.1, 80], [1, 0]];   // nearly dies
    else if (r < 0.5) seq = [[0.5, 60], [1, 90], [0.35, 50], [1, 0]];                                             // stutter
    else seq = [[0.62, 70], [1, 0]];                                                                              // dip
    S.flick = { seq: seq, i: 0, until: now + seq[0][1] };
    S.light = seq[0][0];
  }
  function stepFlicker(now) {
    if (!S.flick) {
      if (now > S.nextFlick) { startFlicker(now); FX.buzz(S.light); }
      return;
    }
    if (now >= S.flick.until) {
      S.flick.i += 1;
      var st = S.flick.seq[S.flick.i];
      if (!st || st[1] === 0) { S.light = 1; S.flick = null; scheduleFlicker(now); FX.buzz(1); return; }
      S.light = st[0]; S.flick.until = now + st[1];
      FX.buzz(S.light);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Main loop: parallax, swing, light, monitors                         */
  /* ------------------------------------------------------------------ */
  var layers = {};
  function loop(t) {
    S.raf = requestAnimationFrame(loop);
    var now = Date.now();
    var dt = S.lastT ? Math.min(0.05, (t - S.lastT) / 1000) : 0.016;
    S.lastT = t;
    var low = FX.lowFx();

    // parallax ease
    if (!low) { S.px += (S.tpx - S.px) * 0.07; S.py += (S.tpy - S.py) * 0.07; }
    else { S.px = 0; S.py = 0; }
    var px = S.px, py = S.py;
    layers.bg.style.transform = 'translate3d(' + (px * -7).toFixed(2) + 'px,' + (py * -5).toFixed(2) + 'px,0) scale(1.03)';
    var fr = 'translate3d(' + (px * -15).toFixed(2) + 'px,' + (py * -9).toFixed(2) + 'px,0)';
    layers.frames.style.transform = fr;
    layers.screens.style.transform = fr;
    layers.fg.style.transform = 'translate3d(' + (px * -34).toFixed(2) + 'px,' + (py * -18).toFixed(2) + 'px,0) scale(1.05)';

    // pendulum
    if (!low) {
      var w0 = 8.2;
      S.omega += (-w0 * Math.sin(S.theta) - 0.55 * S.omega) * dt;
      S.omega += Math.sin(now / 1900) * 0.0009;             // a draught
      S.theta += S.omega * dt;
      S.theta = Math.max(-0.35, Math.min(0.35, S.theta));
    } else { S.theta = 0; S.omega = 0; }
    var bx = PIVOT.x + Math.sin(S.theta) * L, by = PIVOT.y + Math.cos(S.theta) * L;
    var rpx = px * -22, rpy = py * -12;
    rig.style.transform = 'translate3d(' + rpx.toFixed(2) + 'px,' + rpy.toFixed(2) + 'px,0) rotate(' + (-S.theta * 57.2958).toFixed(3) + 'deg)';
    rig.style.transformOrigin = '0 0';

    // light
    if (!low) stepFlicker(now); else S.light = 1;
    var lit = S.light;
    darkness.style.transform = 'translate3d(' + (bx + rpx - 1366).toFixed(1) + 'px,' + (by + rpy - 768 + 300).toFixed(1) + 'px,0)';
    blackout.style.opacity = ((1 - lit) * 0.88).toFixed(3);
    glow.style.opacity = (0.25 + 0.75 * lit).toFixed(3);
    beam.style.opacity = (0.6 * lit).toFixed(3);
    bulbImg.style.filter = lit < 0.95 ? 'brightness(' + (0.35 + 0.65 * lit).toFixed(2) + ')' : '';

    // heart monitors
    Object.keys(S.ecg).forEach(function (k) { S.ecg[k].step(dt); });
  }

  function onPointerMove(ev) {
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    S.tpx = (ev.clientX / w) * 2 - 1;
    S.tpy = (ev.clientY / h) * 2 - 1;
    if (S.lastMouseX !== null) {
      var dx = ev.clientX - S.lastMouseX;
      S.omega -= dx * 0.00042 / Math.max(0.5, S.scale);
    }
    S.lastMouseX = ev.clientX;
  }

  /* ------------------------------------------------------------------ */
  /* Close-up view                                                       */
  /* ------------------------------------------------------------------ */
  function sizeZoom() {
    var t = TV[S.zoomKey], box = $('zoomScreen');
    var maxW = Math.min(window.innerWidth * 0.9, 1100), maxH = window.innerHeight * 0.82;
    var k = Math.min(maxW / t.vw, maxH / t.vh);
    box.style.width = Math.round(t.vw * k) + 'px';
    box.style.height = Math.round(t.vh * k) + 'px';
    var c = box.firstChild;
    if (c) c.style.transform = 'scale(' + k.toFixed(4) + ')';
  }
  function zoom(key, cinematic) {
    if (S.zoomKey === key) return;
    if (S.zoomKey) unzoom();
    var scr = $('scr' + key.toUpperCase());
    var content = scr.querySelector('.scr-content');
    if (!content) return;
    S.zoomKey = key; S.zoomHome = scr;
    scr.classList.add('zoomed-away');
    $('zoomScreen').appendChild(content);
    $('zoom').hidden = false;
    document.body.classList.add('zooming');
    document.body.classList.toggle('cinematic', !!cinematic);
    sizeZoom();
    FX.sfx('static'); FX.staticBurst(140, 0.15);
    setTimeout(function () { try { $('zoomClose').focus(); } catch (e) { /* ignore */ } }, 30);
  }
  function unzoom() {
    if (!S.zoomKey) return;
    var content = $('zoomScreen').firstChild;
    if (content) { content.style.transform = ''; S.zoomHome.insertBefore(content, S.zoomHome.firstChild); }
    S.zoomHome.classList.remove('zoomed-away');
    S.zoomKey = null; S.zoomHome = null;
    $('zoom').hidden = true;
    document.body.classList.remove('zooming', 'cinematic');
  }
  function zoomed() { return S.zoomKey; }

  /* A click on a TV body, or on a screen where nothing is clickable, opens it up close. */
  function wireZoomClicks() {
    function interactive(t) {
      return t.closest && t.closest('button, a, input, [data-uid], [data-tip], .card, .slot, .cmd, .key, .ffa-cell, .log-list');
    }
    $('layerScreens').addEventListener('click', function (ev) {
      if (interactive(ev.target)) return;
      var s = ev.target.closest && ev.target.closest('.scr');
      if (s) zoom(s.getAttribute('data-tv'));
    });
    $('layerFrames').addEventListener('click', function (ev) {
      var k = ev.target.getAttribute && ev.target.getAttribute('data-tv');
      if (k) zoom(k);
    });
    $('zoomClose').addEventListener('click', function () { FX.sfx('click'); unzoom(); });
    $('zoomBack').addEventListener('click', unzoom);
  }

  /* ------------------------------------------------------------------ */
  /* Hand cursor: open, and a fist while the button is down              */
  /* ------------------------------------------------------------------ */
  function wireCursor() {
    var body = document.body;
    window.addEventListener('pointerdown', function (ev) { if (ev.pointerType !== 'touch') body.classList.add('grabbing'); }, true);
    window.addEventListener('pointerup', function () { body.classList.remove('grabbing'); }, true);
    window.addEventListener('blur', function () { body.classList.remove('grabbing'); });
  }

  /* ------------------------------------------------------------------ */
  /* Screen gore                                                         */
  /* ------------------------------------------------------------------ */
  function splatter(kind) {
    var el = $('splatter');
    if (!el) return;
    var n = document.createElement('img');
    var pick = ['blood-1', 'blood-2', 'blood-3'][(Math.random() * 3) | 0];
    n.src = kind === 'drips' ? ART.src.drips : ART.src[pick];
    n.className = 'spl ' + (kind === 'drips' ? 'spl-drips' : 'spl-blob');
    if (kind !== 'drips') {
      n.style.left = (8 + Math.random() * 70).toFixed(1) + '%';
      n.style.top = (6 + Math.random() * 60).toFixed(1) + '%';
      n.style.transform = 'translate(-50%,-50%) rotate(' + ((Math.random() * 360) | 0) + 'deg)';
    }
    el.appendChild(n);
    return n;
  }
  function clearSplatter() { var el = $('splatter'); if (el) el.innerHTML = ''; }

  function setDread(d) { S.dread = Math.max(0, Math.min(1, d || 0)); }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */
  function init() {
    if (S.started) return;
    S.started = true;
    layers = { bg: $('layerBg'), frames: $('layerFrames'), screens: $('layerScreens'), fg: $('layerFg') };
    placeTVs();
    setupBulb();
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    try { buildFisheye(); } catch (e) { /* the screens stay flat */ }
    try { drawWires(); } catch (e) { /* no cables */ }
    S.ecg.player = new Ecg($('ecgMe'));
    S.ecg.opp = new Ecg($('ecgOpp'));
    S.ecg.player.onBeat = function () { if (S.ecg.player.lives <= 1) FX.sfx('beep'); };
    wireZoomClicks();
    wireCursor();
    scheduleFlicker(Date.now());
    S.raf = requestAnimationFrame(loop);
  }

  H.Scene = {
    init: init,
    setLives: setLives,
    zoom: zoom,
    unzoom: unzoom,
    zoomed: zoomed,
    splatter: splatter,
    clearSplatter: clearSplatter,
    setDread: setDread,
    flicker: function () { startFlicker(Date.now()); },
    TV: TV,
    _t: { quadMatrix: quadMatrix, S: S }
  };
})(window.H21 = window.H21 || {});
