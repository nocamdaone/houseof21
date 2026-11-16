/* ==========================================================================
   HOUSE OF 21 — music.js
   Original music, generated live: old ballroom records heard through a
   basement wall. Each opponent has their own piece; it plays through a
   worn-record chain (wow and flutter, muffled top end, crackle, a long
   echo) that warps further and starts skipping as the danger rises.

   Players can also load their own music files for any slot. Those stay in
   this browser (IndexedDB) and are never uploaded anywhere.

   Music.play(id)  Music.stop(fade)  Music.setTension(0..1)  Music.setOn(bool)
   ========================================================================== */
(function (H) {
  'use strict';

  var FX = H.FX;
  var KEY = 'house21.music.v1';
  var SLOTS = [
    ['title', 'Title screen'], ['dennis', 'Dennis'], ['cassie', 'Cassie'], ['bryan', 'Bryan'],
    ['elaine', 'Elaine'], ['jack', 'Jack'], ['conductor', 'The Conductor'], ['online', 'Multiplayer']
  ];

  /* ---------------------------- the pieces ---------------------------- */
  // chord: [semitones above the key, type]
  var TRACKS = {
    title: {
      key: 51, bpm: 64, beats: 3, seed: 3,
      prog: [[0, 'maj7'], [9, 'm7'], [5, 'm7'], [10, '7'], [0, 'maj7'], [8, 'maj7'], [5, 'm7'], [7, '7']],
      parts: ['waltzPad', 'bassOne', 'melody'], melody: { inst: 'piano', oct: 5, density: 0.42 }
    },
    dennis: {
      key: 48, bpm: 70, beats: 3, seed: 11,
      prog: [[0, 'm'], [8, 'maj'], [5, 'm'], [7, '7'], [0, 'm'], [3, 'maj'], [8, 'maj7'], [7, '7']],
      parts: ['arp', 'softPad', 'bassOne'], arp: { inst: 'musicbox', oct: 5 }, warp: 1.6
    },
    cassie: {
      key: 55, bpm: 92, beats: 3, seed: 21,
      prog: [[0, 'maj'], [5, 'maj'], [7, '7'], [0, 'maj'], [0, 'maj'], [8, 'maj'], [7, '7'], [0, 'maj']],
      parts: ['oompah', 'melody'], melody: { inst: 'piano', oct: 5, density: 0.55 }, warp: 1.2
    },
    bryan: {
      key: 56, bpm: 92, beats: 4, seed: 31, swing: 0.32,
      prog: [[0, 'maj7'], [9, '7'], [2, 'm7'], [7, '7'], [5, 'm7'], [10, '7'], [0, 'maj7'], [7, '7']],
      parts: ['walk', 'brush', 'comp', 'melody'], melody: { inst: 'vibes', oct: 5, density: 0.5 }
    },
    elaine: {
      key: 50, bpm: 78, beats: 4, seed: 41,
      prog: [[0, 'm'], [7, '7'], [0, 'm'], [10, 'maj'], [5, 'm'], [7, '7'], [8, 'maj7'], [7, '7']],
      parts: ['habanera', 'softPad', 'melody'], melody: { inst: 'piano', oct: 4, density: 0.38 }
    },
    jack: {
      key: 47, bpm: 54, beats: 4, seed: 51,
      prog: [[0, 'm'], [8, 'maj'], [1, 'dim7'], [7, '7'], [0, 'm'], [5, 'm6'], [6, 'dim7'], [7, '7']],
      parts: ['drone', 'octaves', 'stab'], warp: 1.3
    },
    conductor: {
      key: 38, bpm: 40, beats: 4, seed: 61,
      prog: [[0, 'm9'], [1, 'maj7'], [0, 'm9'], [6, 'dim7']],
      parts: ['organ', 'drone', 'melody'], melody: { inst: 'musicbox', oct: 6, density: 0.18 }, warp: 2.2
    },
    online: {
      key: 53, bpm: 68, beats: 3, seed: 71,
      prog: [[0, 'm'], [5, 'm'], [10, '7'], [3, 'maj7'], [8, 'maj7'], [1, 'maj7'], [7, '7'], [7, '7']],
      parts: ['waltzPad', 'bassOne', 'melody'], melody: { inst: 'vibes', oct: 5, density: 0.4 }
    }
  };
  var CHORD = {
    maj: [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10],
    m6: [0, 3, 7, 9], dim7: [0, 3, 6, 9], m9: [0, 3, 7, 10, 14]
  };

  var M = {
    ready: false, c: null, out: null, bus: null, cur: null, want: null, tension: 0,
    on: true, timer: 0, user: {}, db: null
  };

  function loadPrefs() {
    try { var p = JSON.parse(localStorage.getItem(KEY) || '{}'); if (typeof p.on === 'boolean') M.on = p.on; } catch (e) { /* defaults */ }
  }
  function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify({ on: M.on })); } catch (e) { /* fine */ } }

  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* --------------------------- the record chain --------------------------- */
  function ensure() {
    if (M.ready) return true;
    var A = FX.audio && FX.audio();
    if (!A || !A.ctx || !A.master) return false;
    var c = M.c = A.ctx;
    M.out = c.createGain(); M.out.gain.value = M.on ? 0.5 : 0; M.out.connect(A.master);
    M.bus = c.createGain();
    // wow and flutter: a short delay line whose length wobbles
    var dl = c.createDelay(0.1); dl.delayTime.value = 0.025;
    var wow = c.createOscillator(); wow.frequency.value = 0.45;
    var flut = c.createOscillator(); flut.frequency.value = 6.2;
    M.wowG = c.createGain(); M.wowG.gain.value = 0.0016;
    var flG = c.createGain(); flG.gain.value = 0.00018;
    wow.connect(M.wowG); M.wowG.connect(dl.delayTime); flut.connect(flG); flG.connect(dl.delayTime);
    wow.start(); flut.start();
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    M.lp = c.createBiquadFilter(); M.lp.type = 'lowpass'; M.lp.frequency.value = 3000; M.lp.Q.value = 0.9;
    var sat = c.createWaveShaper(), curve = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) { var x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.6); }
    sat.curve = curve;
    M.bus.connect(dl); dl.connect(hp); hp.connect(M.lp); M.lp.connect(sat); sat.connect(M.out);
    // the room: a long, dark echo
    var len = Math.floor(c.sampleRate * 3.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch);
      for (var j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 3);
    }
    var cv = c.createConvolver(); cv.buffer = ir;
    var wet = c.createGain(); wet.gain.value = 0.55;
    sat.connect(cv); cv.connect(wet); wet.connect(M.out);
    // crackle and hiss
    var clen = c.sampleRate * 4, cb = c.createBuffer(1, clen, c.sampleRate), cd = cb.getChannelData(0), lastH = 0;
    for (var k = 0; k < clen; k++) {
      lastH = lastH * 0.97 + (Math.random() * 2 - 1) * 0.03;
      cd[k] = lastH * 0.6 + (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0);
    }
    var cs = c.createBufferSource(); cs.buffer = cb; cs.loop = true;
    var cf = c.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 900;
    M.crackle = c.createGain(); M.crackle.gain.value = 0;
    cs.connect(cf); cf.connect(M.crackle); M.crackle.connect(M.out); cs.start();
    M.ready = true;
    return true;
  }

  /* ------------------------------ instruments ------------------------------ */
  function env(g, t, a, peak, d, sus, rel, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    if (sus) { g.gain.setValueAtTime(peak, end); g.gain.exponentialRampToValueAtTime(0.0001, end + rel); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f, t, stop, dest, gain, detune) {
    var o = M.c.createOscillator(), g = M.c.createGain();
    o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
    g.gain.value = gain; o.connect(g); g.connect(dest); o.start(t); o.stop(stop);
    return o;
  }
  function note(dest, t, midi, dur, inst, vel) {
    var c = M.c, f = hz(midi), g = c.createGain(), v = (vel || 0.6);
    g.connect(dest);
    switch (inst) {
      case 'piano':
        env(g, t, 0.006, 0.16 * v, 1.6 + dur, false);
        osc('triangle', f, t, t + 2.4 + dur, g, 1); osc('sine', f * 2, t, t + 1.2, g, 0.25); osc('sine', f * 3.01, t, t + 0.4, g, 0.08);
        break;
      case 'vibes':
        env(g, t, 0.01, 0.13 * v, 1.9, false);
        osc('sine', f, t, t + 2.2, g, 1); osc('sine', f * 4, t, t + 0.5, g, 0.07);
        break;
      case 'musicbox':
        env(g, t, 0.003, 0.11 * v, 1.1, false);
        osc('sine', f * 2, t, t + 1.3, g, 1); osc('sine', f * 6.02, t, t + 0.35, g, 0.18);
        break;
      case 'pad':
        env(g, t, 0.5, 0.05 * v, 0, true, 0.9, t + dur);
        var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 760; lp.connect(g);
        osc('sawtooth', f, t, t + dur + 1, lp, 1, -8); osc('sawtooth', f, t, t + dur + 1, lp, 1, 8);
        break;
      case 'organ':
        env(g, t, 0.12, 0.07 * v, 0, true, 0.6, t + dur);
        osc('sine', f, t, t + dur + 0.7, g, 1); osc('sine', f * 2, t, t + dur + 0.7, g, 0.45); osc('sine', f * 3, t, t + dur + 0.7, g, 0.22);
        break;
      case 'bass':
        env(g, t, 0.01, 0.2 * v, 0.55, false);
        osc('triangle', f, t, t + 0.7, g, 1); osc('sine', f, t, t + 0.7, g, 0.6);
        break;
      case 'brush':
        var src = c.createBufferSource(), n = c.sampleRate * 0.14, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        src.buffer = b;
        var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 0.8;
        g.gain.value = 0.05 * v; src.connect(bp); bp.connect(g); src.start(t);
        break;
      case 'thump':
        env(g, t, 0.005, 0.22 * v, 0.3, false);
        var o2 = c.createOscillator(); o2.frequency.setValueAtTime(70, t); o2.frequency.exponentialRampToValueAtTime(38, t + 0.25);
        o2.connect(g); o2.start(t); o2.stop(t + 0.35);
        break;
    }
  }
  function chordNotes(root, type, low) {
    var iv = CHORD[type] || CHORD.maj;
    return iv.map(function (x) { var m = root + x; while (m < low) m += 12; while (m >= low + 12) m -= 12; return m; }).sort(function (a, b) { return a - b; });
  }

  /* ------------------------------ patterns ------------------------------ */
  var P = {
    waltzPad: function (s) { if (s.step === 0) s.chord(55).forEach(function (m) { note(s.g, s.t, m, s.bar, 'pad', 0.8); }); },
    softPad: function (s) { if (s.step === 0) s.chord(53).forEach(function (m) { note(s.g, s.t, m, s.bar, 'pad', 0.5); }); },
    bassOne: function (s) { if (s.step === 0) note(s.g, s.t, s.root - 12, 1, 'bass', 0.8); },
    oompah: function (s) {
      if (s.step === 0) note(s.g, s.t, s.root - 12, 0.4, 'bass', 0.9);
      if (s.step === 2 || s.step === 4) s.chord(57).forEach(function (m) { note(s.g, s.t, m, 0.2, 'piano', 0.42); });
    },
    arp: function (s) {
      var cn = s.chord(s.tr.arp.oct * 12), seq = cn.concat(cn.slice(1, -1).reverse());
      note(s.g, s.t, seq[s.abs % seq.length] + 12, 0.3, s.tr.arp.inst, 0.7);
    },
    walk: function (s) {
      if (s.step % 2) return;
      var cn = s.chord(s.tr.key - 12), q = s.step / 2;
      var m = q === 0 ? cn[0] : q === 3 ? s.nextRoot - 12 - 1 : cn[(q + (s.r() < 0.5 ? 0 : 1)) % cn.length];
      note(s.g, s.t, m, 0.4, 'bass', 0.85);
    },
    brush: function (s) { if (s.step === 2 || s.step === 6) note(s.g, s.t, 0, 0.1, 'brush', 1); else if (s.step % 2 === 1) note(s.g, s.t, 0, 0.1, 'brush', 0.35); },
    comp: function (s) { if (s.step === 3 || s.step === 7) s.chord(58).forEach(function (m) { note(s.g, s.t, m, 0.15, 'piano', 0.33); }); },
    habanera: function (s) {
      if (s.step === 0) { note(s.g, s.t, s.root - 12, 0.5, 'bass', 0.9); note(s.g, s.t, 0, 0.2, 'thump', 0.5); }
      if (s.step === 3) note(s.g, s.t + s.sd * 0.5, s.root - 12 + 7, 0.3, 'bass', 0.6);
      if (s.step === 4 || s.step === 6) note(s.g, s.t, s.root - 12 + (s.step === 4 ? 12 : 7), 0.3, 'bass', 0.7);
    },
    drone: function (s) { if (s.step === 0 && s.barN % 2 === 0) { note(s.g, s.t, s.tr.key - 24, s.bar * 2, 'organ', 0.7); note(s.g, s.t, s.tr.key - 12, s.bar * 2, 'organ', 0.35); } },
    organ: function (s) { if (s.step === 0) s.chord(50).forEach(function (m) { note(s.g, s.t, m, s.bar, 'organ', 0.6); }); },
    octaves: function (s) {
      if (s.step === 0 || s.step === 5) { var cn = s.chord(45); note(s.g, s.t, cn[0], 1.2, 'piano', 0.8); note(s.g, s.t, cn[0] + 12, 1.2, 'piano', 0.5); }
    },
    stab: function (s) {
      if (s.step === 6 && s.r() < 0.35) [0, 1, 6].forEach(function (x) { note(s.g, s.t, s.root + 12 + x, 0.4, 'piano', 0.45); });
    },
    melody: function (s) {
      var mel = s.tr._mel;
      var n = mel[s.abs % mel.length];
      if (n) note(s.g, s.t, n, 0.5, s.tr.melody.inst, 0.62);
    }
  };

  /* A melody per piece, fixed by its seed, made of chord and scale tones. */
  function buildMelody(tr) {
    var r = rng(tr.seed * 7919 + 13), steps = tr.beats * 2, out = [];
    var last = tr.key + 12 * ((tr.melody ? tr.melody.oct : 5) - 4) + 7;
    for (var b = 0; b < tr.prog.length; b++) {
      var ch = tr.prog[b], cn = chordNotes(tr.key + ch[0], ch[1], last - 6);
      for (var st = 0; st < steps; st++) {
        var strong = st % 2 === 0;
        if (!tr.melody || r() > (strong ? tr.melody.density * 1.4 : tr.melody.density * 0.6)) { out.push(0); continue; }
        var target = cn[(r() * cn.length) | 0];
        if (!strong && r() < 0.5) target = last + (r() < 0.5 ? -2 : 2);
        while (target - last > 7) target -= 12;
        while (last - target > 7) target += 12;
        out.push(target); last = target;
      }
    }
    return out;
  }

  /* ------------------------------- playback ------------------------------- */
  function start(id) {
    var tr = TRACKS[id] || TRACKS.title;
    if (!tr._mel) tr._mel = buildMelody(tr);
    var g = M.c.createGain(); g.gain.value = 0.0001; g.connect(M.bus);
    g.gain.exponentialRampToValueAtTime(1, M.c.currentTime + 2.5);
    M.cur = { id: id, tr: tr, g: g, next: M.c.currentTime + 0.12, abs: 0, r: rng(tr.seed) };
    clearInterval(M.timer);
    M.timer = setInterval(tick, 60);
    applyTension();
  }
  function tick() {
    var cur = M.cur; if (!cur || cur.user) return;
    var tr = cur.tr, sd = 60 / tr.bpm / 2, steps = tr.beats * 2;
    while (cur.next < M.c.currentTime + 0.25) {
      var step = cur.abs % steps, barN = Math.floor(cur.abs / steps);
      var ch = tr.prog[barN % tr.prog.length], nx = tr.prog[(barN + 1) % tr.prog.length];
      var t = cur.next + (tr.swing && step % 2 ? sd * tr.swing : 0);
      var s = {
        g: cur.g, t: t, step: step, abs: cur.abs, barN: barN, bar: sd * steps, sd: sd, tr: tr, r: cur.r,
        root: tr.key + ch[0], nextRoot: tr.key + nx[0],
        chord: function (low) { return chordNotes(this.root, ch[1], low); }
      };
      for (var i = 0; i < tr.parts.length; i++) { try { P[tr.parts[i]](s); } catch (e) { /* skip */ } }
      cur.next += sd;
      cur.abs += 1;
      // a worn record skips: jump back half a bar
      if (step === steps - 1 && M.tension > 0.55 && cur.r() < (M.tension - 0.5) * 0.5) {
        cur.abs -= Math.floor(steps / 2) + 1;
        note(M.bus, cur.next, 0, 0.05, 'brush', 2.4);
      }
    }
  }
  function applyTension() {
    if (!M.ready) return;
    var t = M.c.currentTime, warp = (M.cur && M.cur.tr && M.cur.tr.warp) || 1;
    M.wowG.gain.setTargetAtTime(0.0012 * warp * (1 + M.tension * 2.2), t, 0.5);
    M.lp.frequency.setTargetAtTime(3200 - M.tension * 1600, t, 0.5);
    M.crackle.gain.setTargetAtTime(M.cur ? 0.05 + M.tension * 0.06 : 0, t, 0.3);
  }
  function fadeOut(cur, sec) {
    if (!cur) return;
    if (cur.audio) {
      var a = cur.audio, g = cur.g;
      g.gain.setTargetAtTime(0.0001, M.c.currentTime, (sec || 1) / 3);
      setTimeout(function () { try { a.pause(); URL.revokeObjectURL(a.src); } catch (e) { /* gone */ } }, (sec || 1) * 1000 + 200);
      return;
    }
    cur.g.gain.cancelScheduledValues(M.c.currentTime);
    cur.g.gain.setTargetAtTime(0.0001, M.c.currentTime, (sec || 1) / 3);
    setTimeout(function () { try { cur.g.disconnect(); } catch (e) { /* gone */ } }, (sec || 1) * 1000 + 3500);
  }
  function playUser(id, blob) {
    var a = new Audio(), g = M.c.createGain();
    a.src = URL.createObjectURL(blob); a.loop = true; a.crossOrigin = 'anonymous';
    try { var src = M.c.createMediaElementSource(a); src.connect(g); } catch (e) { /* plays without the mixer */ }
    g.gain.value = 0.0001; g.connect(M.out);
    g.gain.exponentialRampToValueAtTime(0.9, M.c.currentTime + 2);
    clearInterval(M.timer);
    M.cur = { id: id, user: true, audio: a, g: g };
    var p = a.play(); if (p && p.catch) p.catch(function () { /* waits for a click */ });
    applyTension();
  }

  function play(id) {
    M.want = id;
    if (!M.on || !FX.settings.sound) return;
    if (!ensure()) return;                       // starts after the first click
    if (M.cur && M.cur.id === id) return;
    fadeOut(M.cur, 1.6); M.cur = null;
    var blob = M.user[id];
    if (blob) playUser(id, blob); else start(id);
  }
  function stop(sec) { M.want = null; clearInterval(M.timer); fadeOut(M.cur, sec || 1.2); M.cur = null; applyTension(); }
  function kick() { if (M.want && !M.cur) play(M.want); }
  function setTension(v) {
    v = Math.max(0, Math.min(1, v || 0));
    if (Math.abs(v - M.tension) < 0.05) return;
    M.tension = v; applyTension();
  }
  function setOn(on) {
    M.on = !!on; savePrefs();
    if (M.ready) M.out.gain.setTargetAtTime(M.on ? 0.5 : 0, M.c.currentTime, 0.2);
    if (M.on) kick(); else { var w = M.want; stop(0.4); M.want = w; }
  }

  /* --------------------- your own music (stays on this device) --------------------- */
  function openDb() {
    return new Promise(function (res) {
      try {
        if (!window.indexedDB) { res(null); return; }
        var rq = indexedDB.open('house21-music', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('slots'); };
        rq.onsuccess = function () { M.db = rq.result; res(M.db); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function loadUser() {
    return openDb().then(function (db) {
      if (!db) return;
      return new Promise(function (res) {
        try {
          var tx = db.transaction('slots', 'readonly'), st = tx.objectStore('slots'), rq = st.openCursor();
          rq.onsuccess = function () { var c = rq.result; if (c) { M.user[c.key] = c.value; c.continue(); } else res(); };
          rq.onerror = function () { res(); };
        } catch (e) { res(); }
      });
    });
  }
  function setUser(slot, file) {
    if (file) M.user[slot] = file; else delete M.user[slot];
    if (M.cur && M.cur.id === slot) { var w = slot; stop(0.3); setTimeout(function () { play(w); }, 350); }
    if (!M.db) return Promise.resolve();
    return new Promise(function (res) {
      try {
        var tx = M.db.transaction('slots', 'readwrite'), st = tx.objectStore('slots');
        if (file) st.put(file, slot); else st.delete(slot);
        tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); };
      } catch (e) { res(); }
    });
  }

  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  /** The "your music" dialog. */
  function openPicker() {
    var UI = H.UI;
    function rows() {
      return '<p class="modal-text dim">Pick a music file for any slot. Files stay in this browser on this device: nothing is uploaded, and other players will not hear them. Slots left empty play the game\'s own music.</p>' +
        '<ul class="music-slots">' + SLOTS.map(function (s) {
          var f = M.user[s[0]];
          return '<li><span class="ms-name">' + s[1] + '</span><span class="ms-file">' + (f ? esc(f.name || 'your file') : 'game music') + '</span>' +
            '<label class="key key-small">CHOOSE<input type="file" accept="audio/*" data-slot="' + s[0] + '" hidden></label>' +
            (f ? '<button class="key key-small" data-clear="' + s[0] + '">CLEAR</button>' : '') + '</li>';
        }).join('') + '</ul>';
    }
    return UI.modal({
      title: 'YOUR MUSIC', html: rows(), dismiss: null, cls: 'music-modal',
      buttons: [{ label: 'DONE', value: null, isDefault: true }],
      onMount: function (mroot) {
        var root = mroot.querySelector('.modal-body');
        root.addEventListener('change', function (ev) {
          var inp = ev.target, slot = inp.getAttribute && inp.getAttribute('data-slot');
          if (!slot || !inp.files || !inp.files[0]) return;
          setUser(slot, inp.files[0]).then(function () { root.innerHTML = rows(); });
        });
        root.addEventListener('click', function (ev) {
          var b = ev.target.closest && ev.target.closest('[data-clear]');
          if (!b) return;
          setUser(b.getAttribute('data-clear'), null).then(function () { root.innerHTML = rows(); });
        });
      }
    });
  }

  loadPrefs();
  loadUser();

  H.Music = {
    play: play, stop: stop, kick: kick, setTension: setTension, setOn: setOn,
    on: function () { return M.on; }, openPicker: openPicker, SLOTS: SLOTS,
    current: function () { return M.cur ? M.cur.id : null; }
  };
})(window.H21 = window.H21 || {});
