/* ==========================================================================
   HOUSE OF 21 — death.js
   How each competitor goes out, played on the middle TV in choppy,
   stop-motion cut-paper style (stepped easing, hard cuts, flat blood).

     crush   Jack     a barrel drops on him
     inject  Dennis   an IV line pumps it in; he seizes, then slumps
     hang    Bryan    a rope drops; he is yanked up out of frame
     split   Cassie   cut in half (ready for her art)
     scalp   Elaine   the top of the head comes away (ready for her art)
     shot    Delilah  one shot (ready for her art)
     static  The Conductor dissolves into the signal

   Death.play(kind) -> Promise; Death.player() -> Promise; Death.reset()
   ========================================================================== */
(function (H) {
  'use strict';

  var ART = H.ART, FX = H.FX;
  var $ = function (id) { return document.getElementById(id); };
  var timers = [];

  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function wait(ms) { return new Promise(function (r) { later(r, ms); }); }
  function anim(el, frames, ms, easing, fill) {
    if (!el || !el.animate) return null;
    return el.animate(frames, { duration: ms, easing: easing || 'linear', fill: fill || 'forwards' });
  }
  function low() { return FX.lowFx(); }

  function cutEl() { var f = $('oppFace'); return f && f.querySelector('.cut'); }

  /** Lay the death layer exactly over the character, so props can use percent. */
  function frame() {
    var cut = cutEl(), face = $('oppFace'), layer = $('deathLayer');
    layer.innerHTML = '';
    if (!cut) return layer;
    layer.style.left = (face.offsetLeft + cut.offsetLeft) + 'px';
    layer.style.top = (face.offsetTop + cut.offsetTop) + 'px';
    layer.style.width = cut.offsetWidth + 'px';
    layer.style.height = cut.offsetHeight + 'px';
    return layer;
  }

  function prop(parent, src, css, cls) {
    var i = document.createElement('img');
    i.src = src; i.alt = ''; i.draggable = false;
    i.className = 'dprop ' + (cls || '');
    Object.keys(css).forEach(function (k) { i.style[k] = css[k]; });
    parent.appendChild(i);
    return i;
  }
  function blood(parent, x, y, size, rot, delay) {
    var pick = ['blood-1', 'blood-2', 'blood-3'][(Math.random() * 3) | 0];
    var b = prop(parent, ART.src[pick], { left: x + '%', top: y + '%', width: size + '%', transform: 'translate(-50%,-50%) rotate(' + (rot || 0) + 'deg) scale(0)' }, 'dblood');
    later(function () {
      anim(b, [{ transform: 'translate(-50%,-50%) rotate(' + (rot || 0) + 'deg) scale(0.2)' }, { transform: 'translate(-50%,-50%) rotate(' + (rot || 0) + 'deg) scale(1)' }], 140, 'steps(3)');
    }, delay || 0);
    return b;
  }
  function drips(parent, x, y, w, ms, delay) {
    var d = prop(parent, ART.src.drips, { left: x + '%', top: y + '%', width: w + '%', clipPath: 'inset(0 0 100% 0)' }, 'ddrips');
    later(function () { anim(d, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], ms || 1800, 'steps(9)'); }, delay || 0);
    return d;
  }
  function shake(ms) {
    var st = $('stage');
    if (low() || !st) return;
    st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake');
    later(function () { st.classList.remove('shake'); }, ms || 450);
  }
  function setEyes(cut, eyes, nose) {
    if (!cut) return;
    if (eyes) cut.setAttribute('data-eyes', eyes);
    if (nose) cut.setAttribute('data-nose', nose);
  }
  function kill(cut) {
    if (!cut) return;
    cut.classList.add('dead');
    cut.classList.remove('twitch');
    setEyes(cut, 'closed', 'normal');
    cut.removeAttribute('data-gaze');
  }
  function stageFlash(cls, ms) {
    var st = $('oppStage'); if (!st) return;
    var f = document.createElement('div');
    f.className = 'dflash ' + (cls || '');
    st.appendChild(f);
    later(function () { if (f.parentNode) f.parentNode.removeChild(f); }, ms || 180);
  }

  /* ----------------------------- the deaths ----------------------------- */
  var KINDS = {
    crush: function (cut, L) {
      var barrel = prop(L, ART.src.barrel, { left: '50%', top: '-12%', width: '58%', transform: 'translate(-50%,-140%)' }, 'dbarrel');
      FX.sfx('rope');
      return wait(420).then(function () {
        anim(barrel, [{ transform: 'translate(-50%,-140%)' }, { transform: 'translate(-50%,8%)' }], 260, 'cubic-bezier(.6,0,1,1)');
        return wait(250);
      }).then(function () {
        FX.sfx('crush'); shake(520); FX.staticBurst(260, 0.35);
        kill(cut);
        anim(cut, [{ transform: 'none' }, { transform: 'scale(1.22,0.55)' }, { transform: 'scale(1.42,0.24)' }], 180, 'steps(3)');
        cut.style.transformOrigin = '50% 100%';
        blood(L, 50, 82, 95, 10, 30); blood(L, 22, 70, 60, -40, 90); blood(L, 80, 74, 58, 75, 120); blood(L, 50, 96, 120, 0, 200);
        drips(L, 4, 52, 92, 2200, 260);
        anim(barrel, [{ transform: 'translate(-50%,8%)' }, { transform: 'translate(-50%,2%)' }, { transform: 'translate(-50%,8%)' }], 260, 'steps(3)');
        return wait(2300);
      });
    },

    inject: function (cut, L) {
      var c = cut.querySelector('.cut-body'), stage = $('oppStage');
      var cv = document.createElement('canvas');
      cv.className = 'dline';
      cv.width = stage.clientWidth; cv.height = stage.clientHeight;
      stage.appendChild(cv);
      var neck = ART.chars[cut.getAttribute('data-char')] ? ART.chars[cut.getAttribute('data-char')].neck : [50, 75];
      var nx = L.offsetLeft + L.offsetWidth * neck[0] / 100 + L.offsetWidth * 0.06;
      var ny = L.offsetTop + L.offsetHeight * neck[1] / 100 - L.offsetHeight * 0.03;
      var sx = cv.width + 10, sy = -10;
      var ctx = cv.getContext('2d');
      function tube(fill) {
        ctx.clearRect(0, 0, cv.width, cv.height);
        var pts = function () { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(cv.width * 0.75, cv.height * 0.55, nx + 60, ny - 90, nx, ny); };
        ctx.lineCap = 'round';
        pts(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 7; ctx.stroke();
        pts(); ctx.strokeStyle = 'rgba(205,205,200,0.55)'; ctx.lineWidth = 5; ctx.stroke();
        if (fill > 0) {
          pts(); ctx.setLineDash([fill * 900, 2000]); ctx.strokeStyle = '#8f0d0f'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
        }
        pts(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#bdbdb8'; ctx.fillRect(nx - 1, ny - 1, 9, 3);
      }
      tube(0);
      cv.style.clipPath = 'inset(0 0 100% 0)';
      anim(cv, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], 500, 'steps(5)');
      FX.sfx('inject');
      setEyes(cut, 'open', 'flared');
      var f = 0;
      return wait(550).then(function () {
        return new Promise(function (res) {
          var iv = setInterval(function () { f += 0.06; tube(Math.min(1.4, f)); if (f >= 1.4) { clearInterval(iv); res(); } }, 50);
          timers.push(iv);
        });
      }).then(function () {
        FX.sfx('seize');
        var n = 0;
        return new Promise(function (res) {
          var iv = setInterval(function () {
            n += 1;
            var tx = (Math.random() - 0.5) * 7, ty = (Math.random() - 0.5) * 4, rot = (Math.random() - 0.5) * 9;
            cut.style.transform = 'translate(' + tx.toFixed(1) + '%,' + ty.toFixed(1) + '%) rotate(' + rot.toFixed(1) + 'deg)';
            var e = ['open', 'closed', 'look', 'lookr'][(Math.random() * 4) | 0];
            setEyes(cut, e, Math.random() < 0.6 ? 'flared' : 'normal');
            if (n === 12) drips(L, 38, 50, 26, 1600, 0);
            if (n === 20) blood(L, 52, 88, 44, 20, 0);
            if (n > 34) { clearInterval(iv); res(); }
          }, 70);
          timers.push(iv);
        });
      }).then(function () {
        kill(cut);
        cut.style.transform = '';
        anim(cut, [{ transform: 'none' }, { transform: 'translateY(5%) rotate(8deg)' }], 300, 'steps(3)');
        if (c) c.style.filter = 'brightness(0.8)';
        return wait(1700);
      });
    },

    hang: function (cut, L) {
      var ch = ART.chars[cut.getAttribute('data-char')] || { neck: [50, 75] };
      var neck = ch.neck;
      var rope = prop(cut, ART.src.rope, { left: (neck[0] - 1.4) + '%', bottom: (100 - neck[1] + 4) + '%', width: '2.8%', height: '220%', transform: 'translateY(-120%)' }, 'drope');
      var noose = prop(cut, ART.src.noose, { left: neck[0] + '%', top: (neck[1] - 9) + '%', width: '46%', transform: 'translate(-50%,-260%)' }, 'dnoose');
      FX.sfx('rope');
      anim(rope, [{ transform: 'translateY(-120%)' }, { transform: 'translateY(4%)' }, { transform: 'none' }], 520, 'steps(5)');
      anim(noose, [{ transform: 'translate(-50%,-260%)' }, { transform: 'translate(-50%,-10%)' }, { transform: 'translate(-50%,0)' }], 520, 'steps(5)');
      setEyes(cut, 'open', 'flared');
      return wait(900).then(function () {
        anim(noose, [{ transform: 'translate(-50%,0)' }, { transform: 'translate(-50%,0) scale(0.82,0.9)' }], 220, 'steps(2)');
        setEyes(cut, 'look', 'flared');
        return wait(500);
      }).then(function () {
        FX.sfx('snap'); if (H.Scene) H.Scene.flicker();
        stageFlash('black', 140);
        kill(cut);
        cut.style.transformOrigin = neck[0] + '% ' + (neck[1] - 4) + '%';
        anim(cut, [
          { transform: 'translateY(0)' }, { transform: 'translateY(-34%)' }, { transform: 'translateY(-30%) rotate(5deg)' },
          { transform: 'translateY(-31%) rotate(-4deg)' }, { transform: 'translateY(-30%) rotate(3deg)' }, { transform: 'translateY(-30%) rotate(-2deg)' },
          { transform: 'translateY(-30%) rotate(1deg)' }, { transform: 'translateY(-30%) rotate(0deg)' }
        ], 2600, 'steps(16)');
        drips(L, 40, 82, 24, 1800, 700);
        blood(L, 50, 104, 54, 0, 1500);
        return wait(2700);
      });
    },

    split: function (cut, L) {
      var face = $('oppFace');
      var a = cut.cloneNode(true), b = cut.cloneNode(true);
      [a, b].forEach(function (n) { n.classList.add('dclone'); kill(n); face.appendChild(n); });
      a.style.clipPath = 'polygon(0 0, 52% 0, 47% 30%, 53% 55%, 48% 100%, 0 100%)';
      b.style.clipPath = 'polygon(52% 0, 100% 0, 100% 100%, 48% 100%, 53% 55%, 47% 30%)';
      cut.style.visibility = 'hidden';
      FX.sfx('tear'); shake(400);
      var band = blood(L, 50, 50, 30, 90, 0); band.style.height = '110%'; band.style.width = '22%';
      anim(a, [{ transform: 'none' }, { transform: 'translateX(-10%) rotate(-8deg)' }], 900, 'steps(6)');
      anim(b, [{ transform: 'none' }, { transform: 'translateX(10%) rotate(8deg)' }], 900, 'steps(6)');
      blood(L, 30, 40, 50, 30, 200); blood(L, 70, 60, 50, -60, 300);
      drips(L, 20, 0, 60, 2000, 400);
      return wait(2600);
    },

    scalp: function (cut, L) {
      var face = $('oppFace');
      var ch = ART.chars[cut.getAttribute('data-char')] || { top: [50, 2], parts: { 'eye-l': { y: 30 } } };
      var line = ch.parts['eye-l'].y - 6;
      var top = cut.cloneNode(true);
      top.classList.add('dclone'); face.appendChild(top);
      top.style.clipPath = 'polygon(0 0, 100% 0, 100% ' + line + '%, 70% ' + (line + 2) + '%, 50% ' + (line - 1) + '%, 30% ' + (line + 2) + '%, 0 ' + line + '%)';
      cut.style.clipPath = 'polygon(0 ' + line + '%, 30% ' + (line + 2) + '%, 50% ' + (line - 1) + '%, 70% ' + (line + 2) + '%, 100% ' + line + '%, 100% 100%, 0 100%)';
      setEyes(cut, 'open', 'flared');
      FX.sfx('tear');
      var cap = blood(L, ch.top[0], line + 1, 46, 90, 0); cap.style.height = '8%';
      anim(top, [{ transform: 'none' }, { transform: 'translate(8%,-30%) rotate(18deg)' }, { transform: 'translate(30%,-90%) rotate(40deg)' }], 900, 'steps(6)');
      drips(L, 26, line, 48, 2200, 200);
      return wait(1200).then(function () { kill(cut); return wait(1500); });
    },

    shot: function (cut, L) {
      setEyes(cut, 'look', 'normal');
      return wait(500).then(function () {
        FX.sfx('gunshot'); stageFlash('white', 90); shake(380);
        var face = $('oppFace');
        var s = document.createElement('img');
        s.src = ART.src['blood-2']; s.className = 'dprop dwall';
        s.style.left = (cut.offsetLeft + cut.offsetWidth * 0.68) + 'px';
        s.style.top = (cut.offsetTop + cut.offsetHeight * 0.18) + 'px';
        face.insertBefore(s, cut);
        kill(cut);
        cut.style.transformOrigin = '50% 90%';
        anim(cut, [{ transform: 'none' }, { transform: 'translateX(-5%) rotate(-11deg)' }, { transform: 'translate(-3%,6%) rotate(-7deg)' }], 520, 'steps(4)');
        blood(L, 46, 30, 22, 0, 60);
        drips(L, 34, 34, 30, 2000, 300);
        return wait(2400);
      });
    },

    static: function (cut) {
      FX.staticBurst(1600, 0.55); FX.sfx('static');
      anim(cut, [
        { opacity: 1, transform: 'none' }, { opacity: 0.3, transform: 'skewX(14deg)' }, { opacity: 0.9, transform: 'skewX(-8deg) scaleY(0.8)' },
        { opacity: 0.2, transform: 'scaleY(0.1)' }, { opacity: 0, transform: 'scaleY(0.02)' }
      ], 1500, 'steps(10)');
      return wait(2200);
    }
  };

  function play(kind) {
    var cut = cutEl();
    if (!cut || !KINDS[kind]) return wait(800);
    var L = frame();
    if (low()) {
      kill(cut);
      blood(L, 50, 60, 80, 0, 0);
      return wait(900);
    }
    return KINDS[kind](cut, L).catch(function () { /* keep the game moving */ });
  }

  function player() {
    if (!H.Scene) return wait(1200);
    H.Scene.setLives('player', 0, 3);
    FX.sfx('splat');
    shake(600);
    var room = document.body;
    room.classList.add('you-died');
    H.Scene.splatter('blob'); later(function () { H.Scene.splatter('blob'); FX.sfx('splat'); }, 260);
    later(function () { H.Scene.splatter('drips'); }, 500);
    return wait(2800);
  }

  function reset() {
    timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    timers = [];
    var L = $('deathLayer'); if (L) L.innerHTML = '';
    var st = $('oppStage');
    if (st) Array.prototype.slice.call(st.querySelectorAll('.dline, .dflash')).forEach(function (n) { n.parentNode.removeChild(n); });
    var f = $('oppFace');
    if (f) Array.prototype.slice.call(f.querySelectorAll('.dclone, .dwall')).forEach(function (n) { n.parentNode.removeChild(n); });
    document.body.classList.remove('you-died');
    if (H.Scene) H.Scene.clearSplatter();
  }

  /** Small hits: a life lost leaves blood behind. */
  function wound(who) {
    if (who === 'player') {
      if (H.Scene) { var n = H.Scene.splatter('blob'); if (n) later(function () { n.classList.add('fade'); }, 2200); later(function () { if (n && n.parentNode) n.parentNode.removeChild(n); }, 4200); }
      return;
    }
    var cut = cutEl(); if (!cut) return;
    var L = $('deathLayer');
    if (!L.style.width) frame();
    blood(L, 30 + Math.random() * 40, 50 + Math.random() * 40, 26 + Math.random() * 14, (Math.random() * 360) | 0, 0);
    FX.sfx('splat');
  }

  function forChar(id) {
    return { jack: 'crush', dennis: 'inject', bryan: 'hang', cassie: 'split', elaine: 'scalp', delilah: 'shot', conductor: 'static' }[id] || 'shot';
  }

  H.Death = { play: play, player: player, reset: reset, wound: wound, forChar: forChar, KINDS: Object.keys(KINDS) };
})(window.H21 = window.H21 || {});
