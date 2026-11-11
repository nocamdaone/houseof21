/* ==========================================================================
   HOUSE OF 21 — face.js
   Placeholder characters drawn as simple SVG from a `look` description in
   opponents.js. To use real art later, replace build()/conductor() with
   <img>/sprite markup and map expression names to frames in apply().

   look: head, skin, hair, hairColor, browColor, shirt, collar,
         eyeScale, eyeWhite, pupil, mouthColor, scale, twins, ribbons,
         hood, hat, beanie, extras[]
   extras: hood bags stubble pimples bigglasses glasses dirt blush
           blushlight vein freckles cowboyhat beanie visor cigarette
           mustache doublechin shine earrings cap
   ========================================================================== */
(function (H) {
  'use strict';

  var HEADS = {
    narrow: { rx: 43, ry: 56 },
    wide: { rx: 56, ry: 54 },
    long: { rx: 38, ry: 63 },
    round: { rx: 48, ry: 52 },
    small: { rx: 41, ry: 50 }
  };

  /* Hair drawn over the head, designed for a 45 x 56 head at (100,104). */
  var HAIR = {
    combover: 'M58 92 Q58 50 100 47 Q142 50 143 88 Q126 60 72 72 Q64 78 58 92 Z',
    buzz: 'M47 96 Q47 52 100 50 Q153 52 153 96 Q144 70 100 66 Q56 70 47 96 Z',
    slick: 'M59 98 Q52 38 100 37 Q150 39 141 98 Q139 58 104 55 Q72 55 59 98 Z',
    short: 'M56 92 Q56 52 100 50 Q144 52 144 92 Q136 66 112 64 Q90 70 70 66 Q60 74 56 92 Z',
    cropped: 'M57 90 Q57 52 100 50 Q143 52 143 90 Q134 70 118 72 L112 66 L104 72 L96 66 L88 72 L80 66 Q66 72 57 90 Z',
    shaggy: 'M54 102 Q50 50 100 46 Q150 50 146 102 Q140 80 128 82 L124 72 L114 82 L104 70 L94 82 L84 70 L74 82 Q62 80 54 102 Z',
    messy: 'M56 96 Q50 56 76 50 L80 42 L90 50 L98 40 L106 50 L116 42 L120 52 Q150 56 144 96 Q138 74 120 70 Q100 78 82 70 Q62 74 56 96 Z',
    'messy-long': 'M56 100 Q50 56 76 50 L80 42 L90 50 L98 40 L106 50 L116 42 L120 52 Q150 56 144 100 Q138 74 120 70 Q100 80 82 70 Q62 74 56 100 Z',
    long: 'M56 100 Q52 50 100 48 Q148 50 144 100 Q140 66 100 64 Q60 66 56 100 Z',
    bob: 'M54 100 Q50 48 100 46 Q150 48 146 100 Q142 70 120 66 Q100 76 74 68 Q58 74 54 100 Z',
    bun: 'M58 92 Q56 52 100 50 Q144 52 142 92 Q134 64 100 62 Q66 64 58 92 Z',
    braids: 'M56 96 Q54 50 100 48 Q146 50 144 96 Q136 66 104 62 L100 70 L96 62 Q64 66 56 96 Z',
    pigtails: 'M56 96 Q54 50 100 48 Q146 50 144 96 Q136 66 104 62 L100 70 L96 62 Q64 66 56 96 Z',
    none: ''
  };
  /* Hair drawn behind the head (long styles). */
  var HAIR_BACK = {
    'messy-long': 'M50 98 Q42 150 56 182 L78 172 Q62 140 66 98 Z M150 98 Q158 150 144 182 L122 172 Q138 140 134 98 Z',
    long: 'M54 96 Q44 150 58 186 L80 178 Q66 140 70 100 Z M146 96 Q156 150 142 186 L120 178 Q134 140 130 100 Z',
    bob: 'M54 92 Q48 140 62 152 L82 152 Q66 126 68 96 Z M146 92 Q152 140 138 152 L118 152 Q134 126 132 96 Z'
  };

  /* Expression table: brow tilt (positive = worried/inner raised), brow
     lift, eye openness, mouth path, sweat, mouth fill. */
  var EXPR = {
    neutral:   { bl: 0, br: 0, by: 0, eye: 1, mouth: 'M86 143 Q100 145 114 143' },
    tired:     { bl: 5, br: 5, by: 2, eye: 0.42, mouth: 'M88 145 Q100 142 112 145' },
    watch:     { bl: -5, br: -5, by: 2, eye: 0.75, mouth: 'M87 143 L113 143' },
    concerned: { bl: 12, br: 12, by: -3, eye: 1.12, mouth: 'M86 146 Q100 138 114 146' },
    relieved:  { bl: 7, br: 7, by: -1, eye: 0.6, mouth: 'M86 141 Q100 149 114 141' },
    frustrated:{ bl: -16, br: -16, by: 3, eye: 0.8, mouth: 'M85 147 Q100 135 115 147' },
    smug:      { bl: -8, br: 10, by: 0, eye: 0.7, mouth: 'M86 142 Q104 151 117 137' },
    celebrate: { bl: 8, br: 8, by: -5, eye: 0.55, mouth: 'M84 138 Q100 160 116 138 Q100 146 84 138 Z', fill: true },
    nervous:   { bl: 15, br: 15, by: -4, eye: 1.18, mouth: 'M85 144 Q89 140 93 144 Q97 148 101 144 Q105 140 109 144 Q113 148 116 143', sweat: true },
    hurt:      { bl: 17, br: 17, by: -2, eye: 0.45, mouth: 'M88 147 Q100 140 112 147' },
    thinking:  { bl: 2, br: -9, by: 0, eye: 0.85, mouth: 'M90 144 L112 141' },
    dead:      { bl: 0, br: 0, by: 4, eye: 1, mouth: 'M88 145 L112 145', dead: true }
  };

  var counter = 0;

  function collar(c, shirt) {
    switch (c) {
      case 'tie': return '<path d="M96 168 L104 168 L108 200 L100 214 L92 200 Z" fill="#3b2a26"/>';
      case 'bowtie': return '<path d="M86 168 L100 174 L114 168 L114 182 L100 176 L86 182 Z" fill="#1a1a1a"/>';
      case 'open': return '<path d="M86 166 L100 188 L114 166" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3"/>';
      case 'tee': return '<path d="M84 166 Q100 178 116 166" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3"/>';
      case 'polo': return '<path d="M82 165 L94 182 L100 170 L106 182 L118 165" fill="' + shirt + '" stroke="#000" stroke-opacity=".35" stroke-width="2"/><circle cx="100" cy="188" r="1.6" fill="#ddd"/>';
      case 'scarf': return '<path d="M76 160 Q100 182 124 160 L126 174 Q100 196 74 174 Z" fill="#6b4e3a"/><path d="M110 178 L118 210 L106 210 Z" fill="#5a4030"/>';
      case 'cardigan': return '<path d="M92 168 L95 222 M108 168 L105 222" stroke="#000" stroke-opacity=".3" stroke-width="3"/><circle cx="96" cy="192" r="2" fill="#ddd"/><circle cx="96" cy="206" r="2" fill="#ddd"/>';
      case 'peter': return '<path d="M84 165 Q88 182 100 173 Q112 182 116 165 Z" fill="#e2dccb" stroke="#000" stroke-opacity=".2"/>';
      case 'conductor': return '<path d="M70 156 L100 186 L130 156 L120 150 L100 168 L80 150 Z" fill="#141614"/>';
      default: return '';
    }
  }

  function eye(cx, cls, ew, pu, es) {
    return '<g class="f-eye ' + cls + '"><g transform="translate(' + cx + ' 101) scale(' + es + ') translate(' + (-cx) + ' -101)">' +
      '<ellipse cx="' + cx + '" cy="101" rx="10.5" ry="6.8" fill="' + ew + '"/>' +
      '<circle class="f-pupil" cx="' + cx + '" cy="101" r="3.6" fill="' + pu + '"/></g></g>';
  }

  function braids(hc, ribbon) {
    var out = '';
    [62, 138].forEach(function (x) {
      for (var i = 0; i < 6; i++) out += '<ellipse cx="' + (x + (x < 100 ? -2 : 2)) + '" cy="' + (118 + i * 11) + '" rx="7" ry="6.5" fill="' + hc + '" stroke="#000" stroke-opacity=".18"/>';
      out += '<rect x="' + (x - 5) + '" y="183" width="10" height="5" fill="' + (ribbon || '#7a4038') + '"/>';
    });
    return out;
  }

  function pigtails(hc, ribbon) {
    var r = ribbon || '#b0407a';
    return '<circle cx="48" cy="92" r="15" fill="' + hc + '"/><circle cx="152" cy="92" r="15" fill="' + hc + '"/>' +
      '<path d="M58 80 l-8 -7 l0 14 Z M58 80 l8 -7 l0 14 Z" fill="' + r + '"/>' +
      '<path d="M142 80 l-8 -7 l0 14 Z M142 80 l8 -7 l0 14 Z" fill="' + r + '"/>';
  }

  function person(look) {
    counter += 1;
    var gid = 'fShade' + counter;
    var hd = HEADS[look.head] || HEADS.narrow;
    var sx = hd.rx / 45, sy = hd.ry / 56;
    var hairT = ' transform="translate(100 104) scale(' + sx.toFixed(3) + ' ' + sy.toFixed(3) + ') translate(-100 -104)"';
    var ex = look.extras || [];
    function has(e) { return ex.indexOf(e) >= 0; }
    var hc = look.hairColor || '#222', skin = look.skin;
    var brow = look.browColor || hc;
    var ew = look.eyeWhite || '#d8d2c2', pu = look.pupil || '#141414', mc = look.mouthColor || '#2a1e1b';
    var es = look.eyeScale || 1;
    var top = 104 - hd.ry;

    var out = '<defs><radialGradient id="' + gid + '" cx="50%" cy="38%" r="65%"><stop offset="0%" stop-color="#fff" stop-opacity="0.10"/><stop offset="70%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.45"/></radialGradient></defs>';

    if (has('hood')) out += '<path d="M40 128 Q32 34 100 28 Q168 34 160 128 Q164 176 152 200 L48 200 Q36 176 40 128 Z" fill="' + look.hood + '"/>';

    // Body
    var neckTop = look.neck === 'long' ? 132 : 140;
    out += '<g class="f-body">' +
      '<path d="M14 222 Q24 172 100 164 Q176 172 186 222 Z" fill="' + look.shirt + '"/>' +
      '<path d="M84 ' + neckTop + ' L116 ' + neckTop + ' L118 172 Q100 180 82 172 Z" fill="' + skin + '" opacity="0.82"/>' +
      collar(look.collar, look.shirt) +
      (has('hood') ? '<path d="M90 172 L88 206 M110 172 L112 206" stroke="#cfc8b6" stroke-width="2"/>' : '') +
      '</g>';

    var head = '';
    if (HAIR_BACK[look.hair]) head += '<path d="' + HAIR_BACK[look.hair] + '" fill="' + hc + '"' + hairT + '/>';
    if (look.hair === 'pigtails') head += pigtails(hc, look.ribbon);
    if (look.hair === 'bun') head += '<circle cx="100" cy="' + (top - 4) + '" r="13" fill="' + hc + '"/>';
    // Face
    head += '<ellipse cx="' + (100 - hd.rx + 2) + '" cy="108" rx="6" ry="11" fill="' + skin + '"/>';
    head += '<ellipse cx="' + (100 + hd.rx - 2) + '" cy="108" rx="6" ry="11" fill="' + skin + '"/>';
    head += '<ellipse cx="100" cy="104" rx="' + hd.rx + '" ry="' + hd.ry + '" fill="' + skin + '"/>';
    if (has('doublechin')) head += '<path d="M72 150 Q100 174 128 150" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="3"/>';
    if (has('stubble')) head += '<path d="M66 126 Q100 172 134 126" fill="none" stroke="#2b2621" stroke-width="10" stroke-dasharray="1 3" opacity=".3"/>';
    if (has('dirt')) head += '<g fill="#3d3024" opacity=".32"><ellipse cx="70" cy="118" rx="9" ry="5"/><ellipse cx="124" cy="80" rx="7" ry="4"/><ellipse cx="116" cy="132" rx="6" ry="3"/></g>';
    if (has('blush') || has('blushlight') || has('freckles')) {
      head += '<g class="f-blush" style="opacity:' + (has('blush') ? 0 : 0.3) + '"><ellipse cx="72" cy="121" rx="10" ry="6" fill="#c0473f"/><ellipse cx="128" cy="121" rx="10" ry="6" fill="#c0473f"/></g>';
    }
    if (has('freckles')) head += '<g fill="#8a5a3a" opacity=".55"><circle cx="76" cy="116" r="1.2"/><circle cx="82" cy="119" r="1.2"/><circle cx="72" cy="121" r="1.2"/><circle cx="124" cy="116" r="1.2"/><circle cx="118" cy="119" r="1.2"/><circle cx="128" cy="121" r="1.2"/></g>';
    if (has('pimples')) head += '<g fill="#b0574d"><circle cx="70" cy="124" r="2"/><circle cx="128" cy="118" r="1.8"/><circle cx="110" cy="72" r="1.8"/><circle cx="122" cy="130" r="1.6"/><circle cx="80" cy="74" r="1.5"/></g>';
    if (has('vein')) head += '<path class="f-vein" d="M118 66 l5 6 l-4 4 l6 7" fill="none" stroke="#9a3a33" stroke-width="2.4" style="opacity:0"/>';
    // Hair over head
    if (HAIR[look.hair]) head += '<path d="' + HAIR[look.hair] + '" fill="' + hc + '"' + hairT + '/>';
    if (look.hair === 'braids') head += braids(hc, look.ribbon);
    if (has('shine')) head += '<ellipse cx="84" cy="' + (top + 14) + '" rx="14" ry="7" fill="#fff" opacity=".14" transform="rotate(-20 84 ' + (top + 14) + ')"/>';
    if (has('bags')) head += '<path d="M71 111 Q82 118 93 111 M107 111 Q118 118 129 111" fill="none" stroke="#5b4a52" stroke-width="2.2" opacity=".6"/>';
    // Brows + eyes
    head += '<g class="f-brows" stroke="' + brow + '" stroke-width="4" stroke-linecap="round">' +
      '<path class="f-brow f-brow-l" d="M70 86 L94 86"/><path class="f-brow f-brow-r" d="M106 86 L130 86"/></g>';
    head += '<g class="f-eyes">' + eye(82, 'f-eye-l', ew, pu, es) + eye(118, 'f-eye-r', ew, pu, es) +
      '<g class="f-xeyes" stroke="' + (look.pupil || '#141414') + '" stroke-width="3" stroke-linecap="round" style="display:none"><path d="M75 94 L89 108 M89 94 L75 108"/><path d="M111 94 L125 108 M125 94 L111 108"/></g></g>';
    head += '<path d="M100 104 L95 125 L104 125" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>';
    head += '<path class="f-mouth" d="' + EXPR.neutral.mouth + '" fill="none" stroke="' + mc + '" stroke-width="3" stroke-linecap="round"/>';
    if (has('mustache')) head += '<path d="M83 136 Q92 129 100 133 Q108 129 117 136 Q108 140 100 137 Q92 140 83 136 Z" fill="' + hc + '"/>';
    head += '<path class="f-sweat" d="M146 82 Q151 92 146 96 Q141 92 146 82 Z" fill="#9fb7b8" style="display:none"/>';
    head += '<ellipse cx="100" cy="104" rx="' + hd.rx + '" ry="' + hd.ry + '" fill="url(#' + gid + ')"/>';
    // Accessories
    if (has('glasses')) head += '<g fill="none" stroke="#1b1d1b" stroke-width="2.4"><circle cx="82" cy="101" r="14"/><circle cx="118" cy="101" r="14"/><path d="M96 101 Q100 97 104 101"/></g>';
    if (has('bigglasses')) head += '<g stroke="#161816" stroke-width="3.2"><circle cx="81" cy="101" r="19" fill="rgba(220,235,225,.10)"/><circle cx="119" cy="101" r="19" fill="rgba(220,235,225,.10)"/><path d="M100 99 Q100 95 100 99" fill="none"/><path d="M62 98 L54 95 M138 98 L146 95" fill="none"/></g>';
    if (has('visor')) head += '<g><path d="M52 80 Q100 58 148 80 L146 86 Q100 68 54 86 Z" fill="#2f4a37"/><path d="M60 82 Q100 54 140 82" fill="none" stroke="#1c2d21" stroke-width="2"/></g>';
    if (has('cigarette')) head += '<g><rect x="112" y="141" width="22" height="4" rx="1" fill="#e8e2d0" transform="rotate(10 112 143)"/><rect x="131" y="144" width="4" height="4" fill="#d9653a" transform="rotate(10 112 143)"/><path class="f-smoke" d="M136 140 Q130 128 137 118 Q144 108 137 96" stroke="#aab3aa" stroke-width="2" fill="none" opacity=".4"/></g>';
    if (has('earrings')) head += '<g fill="none" stroke="#c9a454" stroke-width="2"><circle cx="' + (100 - hd.rx + 1) + '" cy="124" r="5"/><circle cx="' + (100 + hd.rx - 1) + '" cy="124" r="5"/></g>';
    if (has('beanie')) head += '<g' + hairT + '><path d="M53 84 Q52 36 100 34 Q148 36 147 84 Z" fill="' + (look.beanie || '#4b3b33') + '"/><rect x="51" y="76" width="98" height="12" rx="3" fill="' + (look.beanie || '#4b3b33') + '" stroke="#000" stroke-opacity=".25"/></g>';
    if (has('cowboyhat')) head += '<g><ellipse cx="100" cy="' + (top + 18) + '" rx="74" ry="13" fill="' + (look.hat || '#8a6a3e') + '"/><path d="M64 ' + (top + 18) + ' Q64 ' + (top - 26) + ' 100 ' + (top - 22) + ' Q136 ' + (top - 26) + ' 136 ' + (top + 18) + ' Z" fill="' + (look.hat || '#8a6a3e') + '"/><rect x="64" y="' + (top + 6) + '" width="72" height="7" fill="#3a2a1a"/></g>';
    if (has('cap')) head += '<g><path d="M52 66 Q100 34 148 66 L146 76 L54 76 Z" fill="#0a0b0a"/><path d="M44 76 L156 76 Q150 86 100 86 Q50 86 44 76 Z" fill="#050605"/><rect x="90" y="56" width="20" height="10" rx="2" fill="#3a3524"/></g>';
    if (has('hood')) head += '<path fill-rule="evenodd" fill="' + look.hood + '" d="M100 28 Q166 32 164 112 Q162 170 140 190 L60 190 Q38 170 36 112 Q34 32 100 28 Z M100 48 Q56 52 56 112 Q58 160 74 178 L126 178 Q142 160 144 112 Q144 52 100 48 Z"/>';

    out += '<g class="f-head">' + head + '</g>';
    return out;
  }

  function extend(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  /** Build an opponent portrait (or a pair, for twins) as an SVG string. */
  function build(look) {
    var inner;
    if (look.twins) {
      var rb = look.ribbons || [];
      inner = '<g transform="translate(-18 48) scale(0.78)">' + person(extend(look, { ribbon: rb[0] })) + '</g>' +
        '<g transform="translate(62 48) scale(0.78)">' + person(extend(look, { ribbon: rb[1] })) + '</g>';
    } else {
      inner = person(look);
      var s = look.scale || 1;
      if (s !== 1) inner = '<g transform="translate(' + (100 * (1 - s)).toFixed(1) + ' ' + (220 * (1 - s)).toFixed(1) + ') scale(' + s + ')">' + inner + '</g>';
    }
    return '<svg class="face-svg" viewBox="0 0 200 220" role="img" aria-label="Opponent">' + inner + '</svg>';
  }

  function each(root, sel, fn) {
    var list = root.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) fn(list[i]);
  }

  /** Apply a named expression to a rendered portrait (both twins at once). */
  function apply(root, name) {
    if (!root) return;
    var e = EXPR[name] || EXPR.neutral;
    root.setAttribute('data-expr', name);
    each(root, '.f-brow-l', function (b) { b.setAttribute('transform', 'translate(0 ' + e.by + ') rotate(' + (-e.bl) + ' 82 86)'); });
    each(root, '.f-brow-r', function (b) { b.setAttribute('transform', 'translate(0 ' + e.by + ') rotate(' + e.br + ' 118 86)'); });
    each(root, '.f-eye', function (n) {
      n.setAttribute('transform', 'translate(0 101) scale(1 ' + e.eye + ') translate(0 -101)');
      n.style.display = e.dead ? 'none' : '';
    });
    each(root, '.f-xeyes', function (n) { n.style.display = e.dead ? '' : 'none'; });
    each(root, '.f-mouth', function (m) {
      m.setAttribute('d', e.mouth);
      m.setAttribute('fill', e.fill ? '#1a1210' : 'none');
    });
    each(root, '.f-sweat', function (n) { n.style.display = e.sweat ? '' : 'none'; });
  }

  /** Point the pupils toward a normalised position (-1..1). */
  function gaze(root, nx, ny) {
    if (!root) return;
    var dx = Math.max(-1, Math.min(1, nx)) * 4.2;
    var dy = Math.max(-1, Math.min(1, ny)) * 2.6;
    each(root, '.f-pupil', function (p) { p.setAttribute('transform', 'translate(' + dx.toFixed(2) + ' ' + dy.toFixed(2) + ')'); });
  }

  /** Chuck's temper: 0 calm .. 1 furious. */
  function setBlush(root, level) {
    if (!root) return;
    var l = Math.max(0, Math.min(1, level || 0));
    each(root, '.f-blush', function (b) { b.style.opacity = (l * 0.8).toFixed(2); });
    each(root, '.f-vein', function (v) { v.style.opacity = Math.max(0, (l - 0.5) * 2).toFixed(2); });
  }

  /** The Conductor (story screens): a silhouette with a peaked cap. */
  function conductor() {
    return '' +
      '<svg class="conductor-svg" viewBox="0 0 200 240" role="img" aria-label="The Conductor">' +
        '<path d="M10 242 Q20 170 70 156 L100 186 L130 156 Q180 170 190 242 Z" fill="#070807"/>' +
        '<path d="M70 156 L100 186 L130 156 L120 150 L100 168 L80 150 Z" fill="#141614"/>' +
        '<rect x="88" y="128" width="24" height="30" fill="#0b0c0b"/>' +
        '<ellipse cx="100" cy="98" rx="38" ry="46" fill="#0d0e0d"/>' +
        '<path d="M52 66 Q100 34 148 66 L146 76 L54 76 Z" fill="#0a0b0a"/>' +
        '<path d="M44 76 L156 76 Q150 86 100 86 Q50 86 44 76 Z" fill="#050605"/>' +
        '<rect x="90" y="56" width="20" height="10" rx="2" fill="#3a3524"/>' +
        '<circle class="c-eye" cx="86" cy="100" r="2.6" fill="#d9d0a8"/>' +
        '<circle class="c-eye" cx="114" cy="100" r="2.6" fill="#d9d0a8"/>' +
        '<path d="M84 124 Q100 130 116 122" fill="none" stroke="#2c2a22" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
  }

  H.Face = { build: build, apply: apply, gaze: gaze, setBlush: setBlush, conductor: conductor, EXPRESSIONS: Object.keys(EXPR) };
})(window.H21 = window.H21 || {});
