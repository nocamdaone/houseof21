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

  /* Basement ambience: rumble, room air, the bulb's buzz, drips, pipes.  */
  function noiseBuffer(sec, kind) {
    var len = Math.floor(A.ctx.sampleRate * sec), buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate), ch = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; ch[i] = last * 3.5; } else ch[i] = w;
    }
    return buf;
  }
  function loopNoise(kind, filterType, freq, q, vol) {
    var src = A.ctx.createBufferSource(); src.buffer = noiseBuffer(3, kind); src.loop = true;
    var f = A.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 0.7;
    var g = A.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(A.amb); src.start();
    return g;
  }
  function makeReverb() {
    var len = Math.floor(A.ctx.sampleRate * 2.6), buf = A.ctx.createBuffer(2, len, A.ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var ch = buf.getChannelData(c);
      for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    var cv = A.ctx.createConvolver(); cv.buffer = buf;
    var g = A.ctx.createGain(); g.gain.value = 0.45;
    cv.connect(g); g.connect(A.master);
    return cv;
  }
  function startHum() {
    if (!A.ctx || A.hum) return;
    A.amb = A.ctx.createGain(); A.amb.gain.value = 1; A.amb.connect(A.master);
    A.verb = makeReverb();
    A.rumble = loopNoise('brown', 'lowpass', 160, 0.7, 0.16);
    loopNoise('white', 'bandpass', 900, 0.4, 0.006);
    // the bulb: mains buzz through a resonant filter
    var o1 = A.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    var o2 = A.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 120.5;
    var bf = A.ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 240; bf.Q.value = 3;
    var g2 = A.ctx.createGain(); g2.gain.value = 0.25;
    A.buzzG = A.ctx.createGain(); A.buzzG.gain.value = 0.012;
    o1.connect(bf); o2.connect(g2); g2.connect(bf); bf.connect(A.buzzG); A.buzzG.connect(A.amb);
    o1.start(); o2.start();
    A.hum = A.buzzG;
    scheduleAmbient();
  }
  function scheduleAmbient() {
    clearTimeout(A.ambT);
    A.ambT = setTimeout(function () {
      if (A.ctx && settings.sound && !document.hidden) {
        var r = Math.random();
        if (r < 0.62) drip(); else if (r < 0.85) knock(); else creak();
      }
      scheduleAmbient();
    }, 3500 + Math.random() * 9000);
  }
  function wet(node) { node.connect(A.master); if (A.verb) node.connect(A.verb); }
  function drip() {
    var t0 = A.ctx.currentTime, o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1300 + Math.random() * 700, t0);
    o.frequency.exponentialRampToValueAtTime(520, t0 + 0.07);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    o.connect(g); wet(g); o.start(t0); o.stop(t0 + 0.12);
  }
  function knock() {
    var n = 1 + ((Math.random() * 3) | 0);
    for (var i = 0; i < n; i++) {
      var t0 = A.ctx.currentTime + i * (0.18 + Math.random() * 0.1);
      var o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(95 + Math.random() * 40, t0); o.frequency.exponentialRampToValueAtTime(48, t0 + 0.25);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.connect(g); wet(g); o.start(t0); o.stop(t0 + 0.45);
    }
  }
  function creak(dur) {
    dur = dur || 0.9 + Math.random() * 0.8;
    var t0 = A.ctx.currentTime, o = A.ctx.createOscillator(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(180 + Math.random() * 80, t0);
    for (var i = 1; i < 8; i++) o.frequency.setValueAtTime(150 + Math.random() * 140, t0 + dur * i / 8);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 9;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); wet(g); o.start(t0); o.stop(t0 + dur + 0.05);
  }

  /** The bulb's buzz follows the light: crackles when it dips. */
  function buzz(level) {
    if (!A.ctx || !A.buzzG) return;
    var t = A.ctx.currentTime;
    A.buzzG.gain.cancelScheduledValues(t);
    A.buzzG.gain.setTargetAtTime(level < 0.95 ? 0.05 * (1 - level) + 0.002 : 0.012, t, 0.01);
    if (level < 0.7 && settings.sound) noise(0.04, 0.05 * (1 - level));
  }

  /** A monitor's flatline tone (fades on its own). */
  var flat = {};
  function flatline(who, on) {
    if (!A.ctx) return;
    if (flat[who]) { try { flat[who].g.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.05); flat[who].o.stop(A.ctx.currentTime + 0.3); } catch (e) { /* ignore */ } flat[who] = null; }
    if (!on || !settings.sound) return;
    var t0 = A.ctx.currentTime, o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sine'; o.frequency.value = who === 'player' ? 988 : 880;
    var v = who === 'player' ? 0.06 : 0.035;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.02);
    g.gain.setValueAtTime(v, t0 + 3.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.2);
    o.connect(g); g.connect(A.master); o.start(t0); o.stop(t0 + 4.3);
    flat[who] = { o: o, g: g };
  }

  /** Wet, filtered noise for the gore. */
  function squelch(dur, vol, delay) {
    if (!A.ctx || !settings.sound) return;
    var t0 = A.ctx.currentTime + (delay || 0);
    var src = A.ctx.createBufferSource(); src.buffer = noiseBuffer(dur, 'white');
    var f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    for (var i = 0; i < 10; i++) f.frequency.setValueAtTime(300 + Math.random() * 900, t0 + dur * i / 10);
    var g = A.ctx.createGain(); g.gain.setValueAtTime(vol || 0.2, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); wet(g); src.start(t0);
  }
  function boom(vol, delay, freq) {
    if (!A.ctx || !settings.sound) return;
    var t0 = A.ctx.currentTime + (delay || 0);
    var o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq || 90, t0); o.frequency.exponentialRampToValueAtTime(30, t0 + 0.5);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(g); wet(g); o.start(t0); o.stop(t0 + 0.65);
    var src = A.ctx.createBufferSource(); src.buffer = noiseBuffer(0.5, 'white');
    var f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t0); f.frequency.exponentialRampToValueAtTime(200, t0 + 0.4);
    var g2 = A.ctx.createGain(); g2.gain.setValueAtTime(vol * 0.9, t0); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    src.connect(f); f.connect(g2); wet(g2); src.start(t0);
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
    beep: function () { tone(988, 0.07, 'sine', 0.025); },
    crush: function () { boom(0.5, 0, 70); squelch(0.5, 0.35, 0.03); noise(0.3, 0.12, 0.02); knock(); },
    inject: function () { noise(0.6, 0.03); tone(2400, 0.5, 'sine', 0.01, 3000); },
    seize: function () { for (var i = 0; i < 14; i++) tone(70 + Math.random() * 40, 0.06, 'square', 0.05, 50, i * (0.08 + Math.random() * 0.1)); },
    rope: function () { creak(1.6); },
    snap: function () { noise(0.05, 0.35); boom(0.25, 0, 140); creak(2.4); },
    gunshot: function () { boom(0.7, 0, 160); noise(0.12, 0.5); squelch(0.3, 0.2, 0.05); },
    tear: function () { squelch(0.7, 0.3); noise(0.5, 0.08); },
    splat: function () { squelch(0.25, 0.25); },
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
    buzz: buzz,
    flatline: flatline,
    sfx: sfx,
    setSound: setSound,
    setFx: setFx,
    lowFx: lowFx,
    reduced: reduced
  };
})(window.H21 = window.H21 || {});
