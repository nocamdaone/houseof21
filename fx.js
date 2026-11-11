/* ==========================================================================
   HOUSE OF 21 — fx.js
   Visual + audio effects: parallax, static interference, monitor glitches,
   procedural sound (Web Audio, no sound files). All effects degrade to
   nothing on reduced-motion or "LOW FX" mode for slower Chromebooks.
   ========================================================================== */
(function (H) {
  'use strict';

  var settings = { fx: 'full', sound: true };
  try {
    var raw = window.localStorage.getItem(H.CONFIG.settingsKey);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.fx === 'low' || parsed.fx === 'full') settings.fx = parsed.fx;
        if (typeof parsed.sound === 'boolean') settings.sound = parsed.sound;
      }
    }
  } catch (e) { /* storage blocked: use defaults */ }

  function saveSettings() {
    try { window.localStorage.setItem(H.CONFIG.settingsKey, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var narrowMQ = window.matchMedia ? window.matchMedia('(max-width: 980px), (max-height: 520px)') : null;
  function reduced() { return !!(reduceMQ && reduceMQ.matches); }
  function lowFx() { return settings.fx === 'low' || reduced(); }
  function stacked() { return !!(narrowMQ && narrowMQ.matches); }

  function applyBodyClasses() {
    document.body.classList.toggle('fx-low', lowFx());
    document.body.classList.toggle('fx-full', !lowFx());
  }

  /* ------------------------------------------------------------------ */
  /* Parallax                                                            */
  /* ------------------------------------------------------------------ */
  var P = { els: null, tx: 0, ty: 0, x: 0, y: 0, raf: 0, listeners: [] };

  function initParallax(els) {
    P.els = els;
    window.addEventListener('pointermove', function (ev) {
      var w = window.innerWidth || 1, h = window.innerHeight || 1;
      P.tx = (ev.clientX / w) * 2 - 1;
      P.ty = (ev.clientY / h) * 2 - 1;
      for (var i = 0; i < P.listeners.length; i++) P.listeners[i](P.tx, P.ty);
      if (!P.raf && !lowFx() && !stacked()) P.raf = requestAnimationFrame(stepParallax);
    }, { passive: true });
  }

  function onPointer(fn) { P.listeners.push(fn); }

  function stepParallax() {
    P.raf = 0;
    if (lowFx() || stacked()) { resetParallax(); return; }
    P.x += (P.tx - P.x) * 0.08;
    P.y += (P.ty - P.y) * 0.08;
    var e = P.els;
    if (e.bg) e.bg.style.transform = 'translate3d(' + (P.x * -6).toFixed(2) + 'px,' + (P.y * -4).toFixed(2) + 'px,0) scale(1.04)';
    if (e.frames) e.frames.style.transform = 'translate3d(' + (P.x * -12).toFixed(2) + 'px,' + (P.y * -7).toFixed(2) + 'px,0)';
    if (e.fg) e.fg.style.transform = 'translate3d(' + (P.x * -30).toFixed(2) + 'px,' + (P.y * -16).toFixed(2) + 'px,0) scale(1.06)';
    if (e.root) {
      e.root.style.setProperty('--sx', (P.x * 3).toFixed(2) + 'px');
      e.root.style.setProperty('--sy', (P.y * 2).toFixed(2) + 'px');
    }
    if (Math.abs(P.tx - P.x) > 0.002 || Math.abs(P.ty - P.y) > 0.002) P.raf = requestAnimationFrame(stepParallax);
  }

  function resetParallax() {
    var e = P.els;
    if (!e) return;
    ['bg', 'frames', 'fg'].forEach(function (k) { if (e[k]) e[k].style.transform = ''; });
    if (e.root) { e.root.style.setProperty('--sx', '0px'); e.root.style.setProperty('--sy', '0px'); }
  }

  /* ------------------------------------------------------------------ */
  /* Static interference                                                 */
  /* ------------------------------------------------------------------ */
  var S = { canvas: null, ctx: null, img: null, until: 0, raf: 0 };

  function initStatic(canvas) {
    S.canvas = canvas;
    canvas.width = 160; canvas.height = 100;
    S.ctx = canvas.getContext('2d');
    S.img = S.ctx.createImageData(160, 100);
  }

  function drawNoise() {
    var d = S.img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    S.ctx.putImageData(S.img, 0, 0);
  }

  function staticBurst(ms, strength) {
    if (!S.canvas) return;
    var op = Math.max(0.05, Math.min(0.6, strength || 0.25));
    if (lowFx()) op = Math.min(op, 0.12);
    S.canvas.style.opacity = String(op);
    S.until = Date.now() + (ms || 250);
    sfx('static');
    if (lowFx()) {
      drawNoise();
      setTimeout(function () { S.canvas.style.opacity = '0'; }, ms || 250);
      return;
    }
    if (!S.raf) S.raf = requestAnimationFrame(loopStatic);
  }

  function loopStatic() {
    S.raf = 0;
    if (Date.now() > S.until) { S.canvas.style.opacity = '0'; return; }
    drawNoise();
    S.raf = requestAnimationFrame(loopStatic);
  }

  /* Random monitor glitches */
  var glitchTimer = 0;
  function startAmbientGlitches(getMonitors, intensityFn) {
    function schedule() {
      var intensity = intensityFn ? intensityFn() : 0;
      var wait = 5000 + Math.random() * 9000 - intensity * 3500;
      glitchTimer = setTimeout(function () {
        if (!lowFx() && !document.hidden) {
          var mons = getMonitors();
          if (mons.length) glitch(mons[(Math.random() * mons.length) | 0], 160 + intensity * 200);
        }
        schedule();
      }, Math.max(1500, wait));
    }
    clearTimeout(glitchTimer);
    schedule();
  }

  function glitch(el, ms) {
    if (!el || lowFx()) return;
    el.classList.add('glitch');
    setTimeout(function () { el.classList.remove('glitch'); }, ms || 180);
  }

  /* ------------------------------------------------------------------ */
  /* Sound (procedural, starts only after a user gesture)                 */
  /* ------------------------------------------------------------------ */
  var A = { ctx: null, master: null, hum: null, lastType: 0 };

  function unlockAudio() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = settings.sound ? 0.9 : 0;
      A.master.connect(A.ctx.destination);
      startHum();
    } catch (e) { A.ctx = null; }
  }

  function startHum() {
    if (!A.ctx || A.hum) return;
    var g = A.ctx.createGain();
    g.gain.value = 0.018;
    var o1 = A.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    var o2 = A.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 110.4;
    var g2 = A.ctx.createGain(); g2.gain.value = 0.35;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(A.master);
    o1.start(); o2.start();
    A.hum = g;
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!A.ctx || !settings.sound) return;
    var t0 = A.ctx.currentTime + (delay || 0);
    var o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, delay) {
    if (!A.ctx || !settings.sound) return;
    var len = Math.max(1, Math.floor(A.ctx.sampleRate * dur));
    var buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    var ch = buf.getChannelData(0);
    for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = A.ctx.createBufferSource(); src.buffer = buf;
    var g = A.ctx.createGain(); g.gain.value = vol || 0.05;
    src.connect(g); g.connect(A.master);
    src.start(A.ctx.currentTime + (delay || 0));
  }

  var SOUNDS = {
    click: function () { tone(880, 0.04, 'square', 0.03); },
    deal: function () { noise(0.06, 0.07); tone(320, 0.06, 'triangle', 0.04, 180); },
    flip: function () { noise(0.1, 0.06); },
    item: function () { tone(620, 0.12, 'sine', 0.07, 1180); tone(1180, 0.08, 'sine', 0.04, 900, 0.12); },
    lose: function () { tone(140, 0.55, 'sawtooth', 0.09, 50); noise(0.4, 0.06); },
    hit: function () { tone(160, 0.25, 'square', 0.05, 90); },
    win: function () { tone(392, 0.16, 'triangle', 0.06); tone(523, 0.22, 'triangle', 0.06, null, 0.15); },
    bust: function () { tone(220, 0.35, 'square', 0.05, 70); },
    static: function () { noise(0.25, 0.035); },
    heart: function () { tone(62, 0.12, 'sine', 0.18); tone(58, 0.14, 'sine', 0.14, null, 0.2); },
    error: function () { tone(150, 0.12, 'square', 0.04); },
    type: function () {
      var now = Date.now();
      if (now - A.lastType < 45) return;
      A.lastType = now;
      tone(1900 + Math.random() * 400, 0.012, 'square', 0.008);
    }
  };

  function sfx(name) {
    if (!A.ctx || !settings.sound) return;
    try { if (SOUNDS[name]) SOUNDS[name](); } catch (e) { /* ignore audio errors */ }
  }

  function setSound(on) {
    settings.sound = !!on;
    if (A.master) A.master.gain.value = on ? 0.9 : 0;
    saveSettings();
  }

  function setFx(mode) {
    settings.fx = mode === 'low' ? 'low' : 'full';
    applyBodyClasses();
    if (lowFx()) resetParallax();
    saveSettings();
  }

  if (reduceMQ && reduceMQ.addEventListener) reduceMQ.addEventListener('change', applyBodyClasses);
  if (narrowMQ && narrowMQ.addEventListener) narrowMQ.addEventListener('change', function () { if (stacked()) resetParallax(); });

  H.FX = {
    settings: settings,
    applyBodyClasses: applyBodyClasses,
    initParallax: initParallax,
    onPointer: onPointer,
    initStatic: initStatic,
    staticBurst: staticBurst,
    glitch: glitch,
    startAmbientGlitches: startAmbientGlitches,
    unlockAudio: unlockAudio,
    sfx: sfx,
    setSound: setSound,
    setFx: setFx,
    lowFx: lowFx,
    reduced: reduced
  };
})(window.H21 = window.H21 || {});
