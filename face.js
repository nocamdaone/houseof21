/* ==========================================================================
   HOUSE OF 21 — face.js
   Characters are photo cut-outs: a faceless body plus separate eye and nose
   pieces layered on top (art in assets/, positions in assets/art.js).
   Expressions swap the pieces: eyes open / closed / glancing either way,
   nose normal / flared, plus a twitch. Blinking and glances run on their own.

   build(look)  look = 'jack' | { art: 'jack' }  ->  HTML string
   apply(root, expression)   gaze(root, nx, ny)   setBlush(root, level)
   conductor()  the hooded figure
   ========================================================================== */
(function (H) {
  'use strict';

  var ART = H.ART;
  var CHARS = ['dennis', 'bryan', 'jack'];
  var NAMES = { dennis: 'Dennis', bryan: 'Bryan', jack: 'Jack', conductor: 'The Conductor' };

  /* expression -> eyes (open|closed|look|lookr|wide), nose (normal|flared), twitch */
  var EXPR = {
    neutral:    { eyes: 'open', nose: 'normal' },
    tired:      { eyes: 'open', nose: 'normal', slow: true },
    watch:      { eyes: 'look', nose: 'normal' },
    concerned:  { eyes: 'open', nose: 'flared' },
    relieved:   { eyes: 'closed', nose: 'normal' },
    frustrated: { eyes: 'open', nose: 'flared', twitch: true },
    smug:       { eyes: 'lookr', nose: 'normal' },
    celebrate:  { eyes: 'closed', nose: 'flared' },
    nervous:    { eyes: 'open', nose: 'flared', twitch: true },
    hurt:       { eyes: 'closed', nose: 'flared', twitch: true },
    thinking:   { eyes: 'look', nose: 'normal' },
    dead:       { eyes: 'closed', nose: 'normal', dead: true }
  };

  function charOf(look) {
    if (!look) return 'dennis';
    if (typeof look === 'string') return ART.chars[look] || look === 'conductor' ? look : 'dennis';
    if (look.art && (ART.chars[look.art] || look.art === 'conductor')) return look.art;
    return 'dennis';
  }

  function img(src, st, cls) {
    return '<img src="' + src + '" alt="" draggable="false" data-st="' + st + '"' + (cls ? ' class="' + cls + '"' : '') + '>';
  }

  function part(name, p, inner) {
    return '<div class="cut-part ' + name + '" style="left:' + p.x.toFixed(2) + '%;top:' + p.y.toFixed(2) + '%;width:' + p.w.toFixed(2) + '%">' + inner + '</div>';
  }

  function eyeHTML(set, side) {
    var S = ART.src, other = side === 'l' ? 'r' : 'l';
    var open = S['p-' + set + '-open-' + side], closed = S['p-' + set + '-closed-' + side];
    var look = S['p-' + set + '-look-' + side], lookOther = S['p-' + set + '-look-' + other];
    var out = img(open, 'open') + img(closed, 'closed');
    if (look && lookOther) out += img(look, 'look') + img(lookOther, 'lookr', 'flip');
    else out += img(open, 'look') + img(open, 'lookr');
    return out;
  }

  function noseHTML(set) {
    var S = ART.src;
    var normal = S['p-' + set + '-normal'], flared = S['p-' + set + '-flared'];
    return img(normal, 'normal') + (flared ? img(flared, 'flared') : img(normal, 'flared', 'flare'));
  }

  /** A character's cut-out as an HTML string. */
  function build(look) {
    var id = charOf(look);
    if (id === 'conductor') return conductor();
    var c = ART.chars[id];
    var html = '<div class="cut" data-char="' + id + '" data-eyes="open" data-nose="normal" role="img" aria-label="' + NAMES[id] + '">' +
      '<img class="cut-body" src="' + ART.src['c-' + id] + '" alt="" draggable="false">' +
      part('eye eye-l', c.parts['eye-l'], eyeHTML(c.parts['eye-l'].set, 'l')) +
      part('eye eye-r', c.parts['eye-r'], eyeHTML(c.parts['eye-r'].set, 'r')) +
      part('nose', c.parts.nose, noseHTML(c.parts.nose.set)) +
      '</div>';
    return html;
  }

  function rootOf(r) {
    if (!r) return null;
    if (r.classList && r.classList.contains('cut')) return r;
    return r.querySelector ? r.querySelector('.cut') : null;
  }

  /** Apply a named expression (both twins / every cut-out inside root). */
  function apply(r, name) {
    var root = rootOf(r);
    if (!root) return;
    var e = EXPR[name] || EXPR.neutral;
    root.setAttribute('data-expr', name);
    root.setAttribute('data-eyes', e.eyes);
    root.setAttribute('data-nose', e.nose);
    root.classList.toggle('twitch', !!e.twitch);
    root.classList.toggle('dead', !!e.dead);
    root.classList.toggle('slow', !!e.slow);
  }

  /** The eyes find you when the cursor drifts far to one side. */
  function gaze(r, nx) {
    var root = rootOf(r);
    if (!root || root.classList.contains('dead')) return;
    var g = nx < -0.55 ? 'look' : nx > 0.55 ? 'lookr' : '';
    if (root.getAttribute('data-gaze') !== g) root.setAttribute('data-gaze', g);
  }

  /** Rage: flared nostrils that will not settle. */
  function setBlush(r, level) {
    var root = rootOf(r);
    if (!root) return;
    root.classList.toggle('seething', (level || 0) > 0.5);
  }

  /** The Conductor: a hood with nothing inside it. */
  function conductor() {
    return '<div class="cut cut-conductor" data-char="conductor" role="img" aria-label="The Conductor, a hooded figure with no visible face">' +
      '<img class="cut-body" src="' + ART.src.conductor + '" alt="" draggable="false"></div>';
  }

  /* Blinks and idle glances for every cut-out on the page. */
  function tick() {
    var now = Date.now();
    var list = document.querySelectorAll('.cut[data-eyes]');
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.classList.contains('dead')) continue;
      var next = +c.getAttribute('data-nb') || 0;
      if (!next) { c.setAttribute('data-nb', String(now + 1500 + Math.random() * 3500)); continue; }
      if (now >= next) {
        c.setAttribute('data-blink', '1');
        (function (el) { setTimeout(function () { el.removeAttribute('data-blink'); }, 110 + Math.random() * 60); })(c);
        var slow = c.classList.contains('slow');
        var twice = Math.random() < 0.18;
        c.setAttribute('data-nb', String(now + (twice ? 260 : (slow ? 1400 : 2200) + Math.random() * (slow ? 2200 : 4200))));
        if (!twice && Math.random() < 0.2 && !c.getAttribute('data-gaze')) {
          c.setAttribute('data-idle', Math.random() < 0.5 ? 'look' : 'lookr');
          (function (el) { setTimeout(function () { el.removeAttribute('data-idle'); }, 700 + Math.random() * 900); })(c);
        }
      }
    }
  }
  setInterval(tick, 120);

  H.Face = { build: build, apply: apply, gaze: gaze, setBlush: setBlush, conductor: conductor, CHARS: CHARS, EXPRESSIONS: Object.keys(EXPR) };
})(window.H21 = window.H21 || {});
