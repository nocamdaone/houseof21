/* ==========================================================================
   HOUSE OF 21 — ui.js
   Draws the six monitors from the view model built in game.js, plus the
   full-screen pages, modals, tooltips, typewriter text and banners.
   ========================================================================== */
(function (H) {
  'use strict';

  var Cards = H.Cards, Items = H.Items, ITEMS = H.Items.ITEMS, FX = H.FX, Face = H.Face, Story = H.Story;
  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  var handlers = {};
  var seen = {};              // card uids already animated in
  var lastLives = { player: null, opp: null };
  var currentOppId = null;
  var currentDef = null;
  var lastView = null;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var HEART = '<svg class="heart" viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21 L2.6 11.6 A5.6 5.6 0 0 1 12 3.8 A5.6 5.6 0 0 1 21.4 11.6 Z"/></svg>';
  function heartsHTML(n, slots, cls) {
    var out = '';
    for (var i = 0; i < slots; i++) out += '<span class="life ' + (i < n ? 'on' : 'off') + ' ' + (cls || '') + '" data-i="' + i + '">' + HEART + '</span>';
    return out;
  }
  function textHearts(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '♥ ';
    return s.trim() || '—';
  }

  /* ======================================================================
     RARITY
     ====================================================================== */
  function rarityKey(it) { return it && H.CONFIG.rarities[it.rarity] ? it.rarity : 'common'; }
  function chip(it) {
    var k = rarityKey(it);
    return '<span class="rar rar-' + k + '">' + H.CONFIG.rarities[k].name + '</span>';
  }

  /* ======================================================================
     CARDS
     ====================================================================== */
  function cardHTML(card, extra) {
    extra = extra || '';
    var anim = '';
    if (card && !seen[card.uid]) { seen[card.uid] = true; anim = ' deal-in'; }
    if (!card) return '<div class="card back' + extra + '"><span class="back-mark">21</span></div>';
    if (card.mystery) {
      return '<div class="card back mystery' + anim + extra + '" tabindex="0" data-tip="SCHRÖDINGER\'S CARD — sealed. You choose to keep or discard it when the round ends."><span class="back-mark">?</span></div>';
    }
    var rank = Cards.rankLabel(card);
    var mod = card.mod !== null && !card.wild ? '<span class="modtag">=' + card.mod + '</span>' : '';
    var cls = 'card' + (card.red ? ' red' : '') + (card.wild ? ' wild' : '') + (card.kind === 'doll' ? ' doll' : '') + (card.smuggled ? ' smuggled' : '') + (card.mod !== null && !card.wild ? ' cut' : '') + anim + extra;
    var mid = card.wild ? card.mod : card.sym;
    return '<div class="' + cls + '" tabindex="0" data-tip="' + esc(Cards.fullName(card) + ' — ' + Cards.describeValue(card)) + '">' +
      '<span class="c-tl">' + rank + '<i>' + (card.wild ? '✱' : card.sym) + '</i></span>' +
      '<span class="c-mid">' + mid + '</span>' +
      '<span class="c-br">' + rank + '</span>' + mod +
      '</div>';
  }
  function backHTML(uid, extra) {
    var anim = '';
    var key = 'b' + uid;
    if (!seen[key]) { seen[key] = true; anim = ' deal-in'; }
    return '<div class="card back' + anim + (extra || '') + '"><span class="back-mark">21</span></div>';
  }

  /* ======================================================================
     RENDER
     ====================================================================== */
  function render(v) {
    lastView = v;
    document.body.classList.toggle('critical', v.dread >= 1);
    document.body.classList.toggle('uneasy', v.dread > 0 && v.dread < 1);
    if (!v.hands.length && !v.opp.hands.length) seen = {};
    renderLives(v);
    renderInventory(v);
    renderHand(v);
    renderActions(v);
    renderOpponent(v);
    renderLog(v);
  }

  function renderLives(v) {
    var n = v.lives.player;
    var slots = Math.max(v.startingLives, n);
    var dropped = lastLives.player !== null && n < lastLives.player;
    var html = '<div class="lives-row" aria-label="Lives ' + n + '">' + heartsHTML(n, slots) + '</div>' +
      '<dl class="stat-grid">' +
        '<dt>LIVES</dt><dd>' + n + ' / ' + v.startingLives + (n > v.startingLives ? ' +' + (n - v.startingLives) : '') + '</dd>' +
        '<dt>ROUND</dt><dd>' + pad(Math.max(v.round, 0)) + '</dd>' +
        '<dt>MATCH</dt><dd>' + (v.matchLabel || (pad(v.match) + ' / ' + pad(v.matches))) + '</dd>' +
        '<dt>TOKENS</dt><dd class="amber">◆ ' + v.tokens + '</dd>' +
      '</dl>';
    if (v.effects.length) {
      html += '<ul class="effects">' + v.effects.map(function (e) { return '<li class="fx-' + e.k + '">' + esc(e.t) + '</li>'; }).join('') + '</ul>';
    } else if (n <= 1) {
      html += '<p class="warn-line">WARNING: ONE LIFE REMAINING</p>';
    }
    el.livesBody.innerHTML = html;
    if (dropped) {
      var lost = el.livesBody.querySelectorAll('.life.off');
      for (var i = 0; i < lost.length; i++) {
        var idx = parseInt(lost[i].getAttribute('data-i'), 10);
        if (idx >= n && idx < lastLives.player) lost[i].classList.add('just-off');
      }
    }
    lastLives.player = n;
  }

  function renderInventory(v) {
    el.invCount.textContent = v.inventory.length + '/' + v.invMax;
    var html = '<div class="inv-grid">';
    for (var i = 0; i < v.invMax; i++) {
      var it = v.inventory[i];
      if (it) {
        var rk = rarityKey(it.item);
        html += '<button class="slot r-' + rk + (it.usable ? ' usable' : '') + '" data-uid="' + it.uid + '" ' +
          'data-tip="' + esc(it.item.name + ' (' + H.CONFIG.rarities[rk].name + ') — ' + it.item.desc + (it.usable ? ' [USABLE NOW]' : ' [' + it.reason + ']')) + '" aria-label="' + esc(it.item.name + ', ' + H.CONFIG.rarities[rk].name) + '">' +
          '<span class="slot-key">' + (i + 1) + '</span>' + it.item.icon +
          '<span class="slot-name">' + esc(it.item.name) + '</span><span class="slot-rar">' + H.CONFIG.rarities[rk].name + '</span></button>';
      } else {
        html += '<div class="slot empty" aria-hidden="true"><span class="slot-key">' + (i + 1) + '</span><span class="slot-name">EMPTY</span></div>';
      }
    }
    var usableCount = v.inventory.filter(function (x) { return x.usable; }).length;
    html += '<div class="inv-hint">' + (v.inventory.length ? (usableCount ? usableCount + ' USABLE NOW<br>CLICK TO INSPECT' : 'CLICK AN ITEM<br>TO INSPECT') : 'NO ITEMS<br>WIN ROUNDS FOR TOKENS') + '</div>';
    html += '</div>';
    el.invBody.innerHTML = html;
  }

  function renderHand(v) {
    if (!v.hands.length) {
      el.handBody.innerHTML = '<div class="hand-empty">' + (v.phase === 'prep' ? 'AWAITING DEAL' : 'NO CARDS') + '</div>';
      el.handTotalTop.textContent = '';
      return;
    }
    var html = '<div class="hands' + (v.hands.length > 1 ? ' split' : ' single') + '">';
    v.hands.forEach(function (h, i) {
      var active = v.activeHand === i;
      var badge = h.bust ? '<b class="tag bad">BUST</b>' : h.natural ? '<b class="tag good">BLACKJACK</b>' : h.stood ? '<b class="tag">STOOD</b>' : '';
      var many = h.cards.length >= 6 ? ' many' : h.cards.length >= 5 ? ' some' : '';
      html += '<div class="hand' + (active ? ' active' : '') + (h.bust ? ' busted' : '') + '">' +
        (v.hands.length > 1 ? '<div class="hand-label">HAND ' + (i + 1) + (active ? ' ◀ PLAYING' : '') + '</div>' : '') +
        '<div class="hand-cards' + many + '">' + h.cards.map(function (c) { return cardHTML(c); }).join('') + '</div>' +
        '<div class="hand-total"><span class="tot-num">' + h.total + (h.mystery ? '<small> + ?</small>' : '') + '</span>' + (h.soft && !h.bust ? '<span class="soft">SOFT</span>' : '') + badge + '</div>' +
        '</div>';
    });
    html += '</div>';
    if (v.doubled) html += '<div class="hand-note">DOUBLED DOWN · ROUND COSTS 2</div>';
    el.handBody.innerHTML = html;
    var fh = v.hands[v.activeHand >= 0 ? v.activeHand : 0];
    el.handTotalTop.textContent = 'TOTAL ' + fh.total + (fh.mystery ? ' + ?' : '') + (fh.bust ? ' · BUST' : '');
  }

  function setBtn(b, s) {
    b.disabled = !s.enabled;
    b.classList.toggle('shackled', !!s.shackled);
  }

  function renderActions(v) {
    setBtn(el.btnHit, v.buttons.hit);
    setBtn(el.btnStand, v.buttons.stand);
    setBtn(el.btnDouble, v.buttons.double);
    setBtn(el.btnSplit, v.buttons.split);
    setBtn(el.btnItem, v.buttons.item);
    el.actStatus.textContent = v.status;
    el.actStatus.classList.toggle('my-turn', v.myTurn);
    el.turnTag.textContent = v.turnTag;
    if (v.primary) {
      el.btnPrimary.hidden = false;
      el.btnPrimary.textContent = v.primary;
      el.btnPrimary.disabled = !!v.primaryBusy;
    } else {
      el.btnPrimary.hidden = true;
    }
    el.mon4.classList.toggle('your-turn', v.myTurn);
  }

  function renderOpponent(v) {
    var o = v.opp;
    el.oppName.textContent = o.def.name + ' · ' + o.def.alias;
    var dropped = lastLives.opp !== null && v.lives.opp < lastLives.opp && currentOppId === o.def.id;
    el.oppLivesTop.innerHTML = heartsHTML(v.lives.opp, Math.max(o.startLives, v.lives.opp), 'mini');
    if (dropped) { FX.glitch(el.mon5, 260); }
    lastLives.opp = v.lives.opp;
    var fsvg = el.oppFace.querySelector('svg');
    if (fsvg && o.def.traits && o.def.traits.impatient) Face.setBlush(fsvg, o.rage);

    var html = '';
    if (!o.hands.length) {
      html = '<div class="opp-cards-empty">' + (v.phase === 'prep' ? 'NO CARDS · WAITING FOR DEAL' : '') + '</div>';
    } else {
      o.hands.forEach(function (h, hi) {
        html += '<div class="opp-hand' + (o.reveal && h.bust ? ' busted' : '') + '">';
        if (o.reveal) {
          html += h.cards.map(function (c) { return cardHTML(c, ' small revealed'); }).join('');
          html += '<span class="opp-total">' + h.total + (h.bust ? ' BUST' : '') + '</span>';
        } else {
          for (var i = 0; i < h.cards.length; i++) {
            var c = h.cards[i];
            var xr = null;
            if (o.xray) {
              for (var j = 0; j < o.xray.length; j++) if (o.xray[j].uid === c.uid) xr = o.xray[j];
            }
            if (xr) html += cardHTML(xr, ' small xrayed');
            else html += backHTML(c.uid, ' small');
          }
          html += '<span class="opp-total">' + (o.split ? 'H' + (hi + 1) + ' · ' : '') + h.count + ' CARDS</span>';
        }
        html += '</div>';
      });
      if (o.xray) html += '<div class="xray-tag">X-RAY · OPENING CARDS</div>';
    }
    el.oppCards.innerHTML = html;
  }

  var logRendered = 0;
  function renderLog(v) {
    var list = el.logList;
    if (v.log.length < logRendered || list.children.length !== logRendered) { list.innerHTML = ''; logRendered = 0; }
    var frag = document.createDocumentFragment();
    for (var i = logRendered; i < v.log.length; i++) {
      var e = v.log[i];
      var li = document.createElement('li');
      li.className = 'lg lg-' + e.who + ' lk-' + e.kind;
      li.textContent = (e.who === 'player' ? 'YOU › ' : '') + e.text;
      frag.appendChild(li);
    }
    list.appendChild(frag);
    logRendered = v.log.length;
    list.scrollTop = list.scrollHeight;

    var o = v.opp;
    if (v.footer) {
      el.logFooter.innerHTML = v.footer;
      el.logStatus.textContent = v.logStatus || o.status;
      return;
    }
    var tot = 'UNKNOWN';
    if (o.reveal && o.hands.length) tot = o.hands.map(function (h) { return h.total + (h.bust ? ' BUST' : ''); }).join(' / ');
    el.logFooter.innerHTML =
      '<span><b>LIVES</b> <em class="red">' + textHearts(v.lives.opp) + '</em></span>' +
      '<span><b>CARDS</b> ' + o.cardCount + '</span>' +
      '<span><b>ITEMS</b> ' + o.itemCount + '</span>' +
      '<span><b>TOTAL</b> ' + tot + '</span>' +
      (o.burner ? '<span><b>BURNER</b> ' + esc(o.burner) + '</span>' : '') +
      (o.shackled ? '<span class="red"><b>LOCKED</b> ' + esc(o.shackled) + '</span>' : '') +
      (o.doubled ? '<span class="amber"><b>DOUBLED</b></span>' : '');
    el.logStatus.textContent = o.status;
  }

  /* ======================================================================
     OPPONENT PORTRAIT, SPEECH, BANNERS
     ====================================================================== */
  function setOpponent(def) {
    if (currentOppId === def.id && el.oppFace.firstChild) return;
    currentOppId = def.id;
    currentDef = def;
    lastLives.opp = null;
    el.oppFace.classList.remove('eliminated');
    el.oppFace.innerHTML = Face.build(def.look) + '<div class="signal-lost">SIGNAL LOST</div>';
    Face.apply(el.oppFace.querySelector('svg'), baseExpr(def));
    el.oppName.textContent = def.name + ' · ' + def.alias;
  }

  function baseExpr(d) {
    if (!d) return 'neutral';
    if (d.traits && d.traits.stoneFace) return 'tired';
    return d.baseExpr || 'neutral';
  }

  var exprTimer = 0;
  function setExpression(name) {
    var svg = el.oppFace.querySelector('svg');
    if (!svg) return;
    Face.apply(svg, name);
    el.oppFace.classList.remove('bob');
    void el.oppFace.offsetWidth;
    el.oppFace.classList.add('bob');
    clearTimeout(exprTimer);
    if (name !== 'dead') {
      exprTimer = setTimeout(function () {
        var v = lastView;
        if (svg.getAttribute('data-expr') === 'dead') return;
        var stone = currentDef && currentDef.traits && currentDef.traits.stoneFace;
        Face.apply(svg, (v && v.lives.opp <= 1 && !stone) ? 'nervous' : baseExpr(currentDef));
      }, 3200);
    }
  }

  function oppEliminated() {
    el.oppFace.classList.add('eliminated');
    var svg = el.oppFace.querySelector('svg');
    if (svg) Face.apply(svg, 'dead');
  }

  var sayTimer = 0, sayTyping = null;
  function say(text, who) {
    if (!text) return;
    clearTimeout(sayTimer);
    if (sayTyping) sayTyping.finish();
    el.oppSpeech.className = 'opp-speech show ' + (who === 'conductor' ? 'from-conductor' : '');
    el.oppSpeech.innerHTML = '<span class="speaker">' + (who === 'conductor' ? 'THE CONDUCTOR' : esc(lastView ? lastView.opp.def.name : '')) + '</span><span class="said"></span>';
    sayTyping = typeText(el.oppSpeech.querySelector('.said'), '“' + text + '”', 22, false);
    sayTimer = setTimeout(function () { el.oppSpeech.className = 'opp-speech'; }, 3800 + text.length * 30);
  }

  var whisperTimer = 0;
  function conductorWhisper(text) {
    var band = el.conductorBand;
    FX.staticBurst(220, 0.18);
    FX.glitch(el.mon5, 200);
    band.innerHTML = '<div class="cb-portrait">' + Face.conductor() + '</div><div class="cb-text"><span class="speaker">THE CONDUCTOR</span><span class="said"></span></div>';
    band.hidden = false;
    band.classList.remove('out');
    typeText(band.querySelector('.said'), text, 26, false);
    clearTimeout(whisperTimer);
    whisperTimer = setTimeout(function () {
      band.classList.add('out');
      setTimeout(function () { band.hidden = true; }, 400);
    }, 3200 + text.length * 35);
  }

  var bannerTimer = 0;
  function banner(text, kind) {
    el.banner.textContent = text;
    el.banner.className = 'banner show ' + (kind || '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { el.banner.className = 'banner'; }, 1500);
  }

  var statusTimer = 0;
  function flashStatus(text) {
    el.actStatus.textContent = text;
    el.actStatus.classList.add('error');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      el.actStatus.classList.remove('error');
      if (lastView) el.actStatus.textContent = lastView.status;
    }, 1800);
  }

  function lifeFlash(who) {
    var target = who === 'player' ? el.mon1 : el.mon5;
    target.classList.remove('hurt-flash');
    void target.offsetWidth;
    target.classList.add('hurt-flash');
    if (who === 'player') document.body.classList.add('shake');
    setTimeout(function () { document.body.classList.remove('shake'); }, 450);
  }

  /* ======================================================================
     TYPEWRITER
     ====================================================================== */
  function typeText(node, text, speed, sound) {
    var i = 0, done = false, timer = 0, resolveFn;
    var p = new Promise(function (r) { resolveFn = r; });
    function finish() {
      if (done) return;
      done = true; clearInterval(timer);
      node.textContent = text;
      node.classList.remove('typing');
      resolveFn();
    }
    if (FX.reduced() || !speed) { node.textContent = text; done = true; resolveFn(); return { promise: p, finish: finish, isDone: function () { return true; } }; }
    node.textContent = '';
    node.classList.add('typing');
    timer = setInterval(function () {
      i += 1;
      node.textContent = text.slice(0, i);
      if (sound && text.charAt(i - 1) !== ' ') FX.sfx('type');
      if (i >= text.length) finish();
    }, speed);
    return { promise: p, finish: finish, isDone: function () { return done; } };
  }

  /* ======================================================================
     SCREENS
     ====================================================================== */
  var SCREENS = ['title', 'story', 'info', 'result', 'multi'];
  var activeScreen = 'title';
  function showScreen(name) {
    activeScreen = name;
    SCREENS.forEach(function (s) { el['scr_' + s].hidden = s !== name; });
    el.menuBtn.hidden = name !== null;
    el.room.setAttribute('aria-hidden', name !== null ? 'true' : 'false');
    if (name === 'title') updateTitleSettings();
  }

  function setTitleContinue(on) { el.tContinue.hidden = !on; }

  function updateTitleSettings() {
    el.tSound.textContent = 'SOUND: ' + (FX.settings.sound ? 'ON' : 'OFF');
    el.tFx.textContent = 'EFFECTS: ' + (FX.settings.fx === 'full' ? 'FULL' : 'LOW');
  }

  /* Story / cutscene text sequence */
  var story = null;
  function playSequence(lines) {
    showScreen('story');
    return new Promise(function (resolve) {
      var idx = -1, typing = null;
      story = {
        next: function () {
          FX.unlockAudio();
          if (typing && !typing.isDone()) { typing.finish(); return; }
          idx += 1;
          if (idx >= lines.length) { story = null; resolve(); return; }
          var ln = lines[idx];
          el.storyTag.textContent = ln.tag || (ln.who === 'conductor' ? 'THE CONDUCTOR' : '');
          el.storyPortrait.innerHTML = ln.who === 'conductor' ? Face.conductor() : '<div class="narrator-glyph"><span></span></div>';
          el.storyPortrait.className = 'story-portrait ' + (ln.who === 'conductor' ? 'is-conductor' : 'is-narrator');
          el.storyText.className = 'story-text ' + (ln.who === 'conductor' ? 'conductor-voice' : '');
          if (ln.glitch) FX.staticBurst(380, 0.3);
          typing = typeText(el.storyText, ln.text, 24, true);
          el.storyNext.textContent = idx === lines.length - 1 ? 'BEGIN ▸' : 'CONTINUE ▸';
        },
        skip: function () { story = null; if (typing) typing.finish(); resolve(); }
      };
      story.next();
    });
  }

  function showInfo(kind, onBack) {
    showScreen('info');
    if (kind === 'credits') {
      el.infoTitle.textContent = 'CREDITS';
      el.infoBody.innerHTML = Story.credits.map(function (c) { return '<p>' + esc(c) + '</p>'; }).join('');
    } else {
      el.infoTitle.textContent = 'HOW TO PLAY';
      var html = Story.howTo.map(function (s) { return '<section class="how"><h3>' + esc(s[0]) + '</h3><p>' + esc(s[1]) + '</p></section>'; }).join('');
      var legend = '<div class="rarity-legend">' + H.CONFIG.rarityOrder.map(function (k) {
        return '<span>' + chip({ rarity: k }) + ' ' + ({ common: 'frequent', uncommon: 'moderate', rare: 'infrequent', veryrare: 'very rare', contraband: 'extremely rare' }[k] || '') + '</span>';
      }).join('') + '</div>';
      html += '<section class="how how-items"><h3>THE ' + Items.ALL_IDS.length + ' ITEMS</h3>' + legend + '<ul class="item-ref">' +
        Items.ALL_IDS.slice().sort(Items.byRarity).map(function (id) {
          var it = ITEMS[id];
          return '<li class="r-' + rarityKey(it) + '">' + it.icon + '<div><b>' + esc(it.name) + '</b> ' + chip(it) + '<span>' + esc(it.desc) + '</span><em>' + esc(it.usage) + '</em></div></li>';
        }).join('') + '</ul></section>';
      el.infoBody.innerHTML = html;
    }
    el.infoBody.scrollTop = 0;
    infoBack = onBack;
  }
  var infoBack = null;

  var resultResolve = null;
  function showResult(o) {
    showScreen('result');
    el.resultKicker.textContent = o.kicker || '';
    el.resultTitle.textContent = o.title || '';
    el.resultTitle.className = 'result-title ' + (o.title === 'DEFEAT' ? 'bad' : 'good');
    el.resultSub.textContent = o.sub || '';
    el.resultPortrait.innerHTML = o.portrait === 'conductor' ? Face.conductor() : '';
    el.resultBtn.textContent = o.btn || 'CONTINUE';
    el.resultBtn2.hidden = !o.btn2;
    el.resultBtn2.textContent = o.btn2 || '';
    FX.staticBurst(400, 0.3);
    return new Promise(function (r) { resultResolve = r; });
  }

  /* ======================================================================
     M5 OVERLAYS (match intro, intermission)
     ====================================================================== */
  function showOverlay(html, cls) {
    el.m5Overlay.className = 'm5-overlay ' + (cls || '');
    el.m5Overlay.innerHTML = html;
    el.m5Overlay.hidden = false;
    el.m5Overlay.scrollTop = 0;
  }
  function hideOverlay() { el.m5Overlay.hidden = true; el.m5Overlay.innerHTML = ''; }

  function showMatchIntro(def, conductorLine, G) {
    var html =
      '<div class="dossier">' +
        '<div class="dossier-kicker">MATCH ' + pad(G.matchIndex + 1) + ' / ' + pad(H.CONFIG.matches) + ' · INCOMING COMPETITOR</div>' +
        '<div class="dossier-name">' + esc(def.name) + '</div>' +
        '<div class="dossier-id">' + esc(def.alias) + ' · ' + esc(def.personality.toUpperCase()) + '</div>' +
        '<p class="dossier-text">' + esc(def.dossier) + '</p>' +
        '<p class="dossier-trait"><b>QUIRK</b>' + esc(def.traitText || '') + '</p>' +
        '<p class="dossier-quote">“' + esc(def.lines.intro[0]) + '”</p>' +
        '<div class="dossier-lives"><span>YOU ' + heartsHTML(H.CONFIG.startingLives, H.CONFIG.startingLives, 'mini') + '</span><span>THEM ' + heartsHTML(def.lives || H.CONFIG.startingLives, def.lives || H.CONFIG.startingLives, 'mini') + '</span></div>' +
        (conductorLine ? '<div class="dossier-conductor"><div class="cb-portrait">' + Face.conductor() + '</div><p><span class="speaker">THE CONDUCTOR</span>' + esc(conductorLine) + '</p></div>' : '') +
        '<button class="key key-primary" data-overlay="intro">BEGIN MATCH ▸</button>' +
      '</div>';
    showOverlay(html, 'intro');
  }

  function showIntermission(G) {
    var r = G.lastResult || {};
    var C = H.CONFIG;
    var oppCards = (r.oppHands || []).map(function (cards) {
      var t = Cards.handValue(cards).total;
      return '<div class="mini-hand">' + cards.map(function (c) { seen[c.uid] = true; return cardHTML(c, ' tiny'); }).join('') + '<span>' + t + (t > 21 ? ' BUST' : '') + '</span></div>';
    }).join('');
    var lossLine = '';
    if (r.winner === 'player') lossLine = 'OPPONENT LOST ' + r.applied + (r.applied === 1 ? ' LIFE' : ' LIVES') + ' · +' + r.tokens + (r.tokens === 1 ? ' TOKEN' : ' TOKENS');
    else if (r.winner === 'opp') lossLine = r.applied ? 'YOU LOST ' + r.applied + (r.applied === 1 ? ' LIFE' : ' LIVES') : 'TOURNIQUET HELD · NO LIFE LOST';
    else lossLine = 'NO LIVES LOST';
    if (r.line) lossLine = r.line;
    var full = G.player.inventory.length >= C.inventoryMax;
    var boughtOut = G.shop.bought >= C.shopPurchasesPerIntermission;
    var shop = G.shop.items.map(function (id, i) {
      if (!id) return '<div class="shop-item sold"><span class="shop-name">SOLD</span></div>';
      var it = ITEMS[id];
      var can = !full && !boughtOut && G.tokens >= C.shopPrice;
      var why = full ? 'INVENTORY FULL' : boughtOut ? 'ONE PER BREAK' : G.tokens < C.shopPrice ? 'NEED ' + C.shopPrice + ' TOKENS' : 'BUY · ◆' + C.shopPrice;
      return '<div class="shop-item r-' + rarityKey(it) + '" data-tip="' + esc(it.name + ' — ' + it.desc + ' ' + it.usage) + '">' + it.icon +
        '<span class="shop-name">' + esc(it.name) + '</span>' + chip(it) +
        '<span class="shop-desc">' + esc(it.desc) + '</span>' +
        '<button class="key key-small" data-buy="' + i + '"' + (can ? '' : ' disabled') + '>' + why + '</button></div>';
    }).join('');
    var html =
      '<div class="inter">' +
        '<div class="inter-head"><span class="inter-kicker">INTERMISSION · AFTER ROUND ' + pad(G.round) + '</span>' +
          '<span class="inter-result ' + (r.winner === 'player' ? 'good' : r.winner === 'opp' ? 'bad' : '') + '">' + esc(r.head || '') + '</span>' +
          '<span class="inter-why">' + esc(r.why || '') + ' · ' + lossLine + '</span></div>' +
        '<div class="inter-cols">' +
          '<div class="inter-reveal"><span class="inter-label">THEIR FINAL HAND</span>' + oppCards + '<span class="inter-label">YOUR TOTAL ' + (r.pB ? 'BUST' : r.pT) + '</span></div>' +
          '<div class="inter-shop"><span class="inter-label">THE SHOP · YOU HAVE ◆ ' + G.tokens + '</span><div class="shop-row">' + shop + '</div></div>' +
        '</div>' +
        '<button class="key key-primary" data-overlay="next">NEXT ROUND ▸</button>' +
      '</div>';
    showOverlay(html, 'intermission');
  }

  /* ======================================================================
     MODALS
     ====================================================================== */
  var modalState = null;
  function modal(o) {
    closeModal();
    return new Promise(function (resolve) {
      var root = el.modalRoot;
      root.innerHTML = '<div class="modal-backdrop"></div><div class="modal ' + (o.cls || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title || 'Dialog') + '">' +
        '<div class="modal-screen"><div class="modal-head">' + esc(o.title || '') + (o.tag ? '<span>' + esc(o.tag) + '</span>' : '') + '</div>' +
        '<div class="modal-body"></div>' +
        '<div class="modal-foot"></div></div><div class="scanlines"></div></div>';
      var body = root.querySelector('.modal-body');
      if (typeof o.html === 'string') body.innerHTML = o.html; else if (o.html) body.appendChild(o.html);
      var foot = root.querySelector('.modal-foot');
      (o.buttons || []).forEach(function (b) {
        var btn = document.createElement('button');
        btn.className = 'key ' + (b.cls || '');
        btn.textContent = b.label;
        if (b.disabled) btn.disabled = true;
        if (b.isDefault) btn.setAttribute('data-default', '1');
        btn.addEventListener('click', function () { FX.sfx('click'); close(b.value); });
        foot.appendChild(btn);
      });
      if (!foot.children.length) foot.hidden = true;
      root.hidden = false;
      function close(val) {
        if (!modalState || modalState.close !== close) return;
        modalState = null;
        root.hidden = true;
        root.innerHTML = '';
        resolve(val);
      }
      modalState = { close: close, dismiss: o.dismiss, root: root };
      root.querySelector('.modal-backdrop').addEventListener('click', function () { if (o.dismiss !== undefined) close(o.dismiss); });
      if (o.onMount) o.onMount(root, close);
      var first = root.querySelector('[data-default]') || root.querySelector('.modal button:not([disabled])');
      if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* ignore */ } }, 30);
    });
  }
  function closeModal() {
    if (modalState) { var c = modalState.close, d = modalState.dismiss; c(d === undefined ? null : d); }
  }

  function confirmBox(title, text, okLabel) {
    return modal({
      title: title, html: '<p class="modal-text">' + esc(text) + '</p>', dismiss: false,
      buttons: [{ label: 'CANCEL', value: false }, { label: okLabel || 'OK', value: true, cls: 'key-danger', isDefault: true }]
    });
  }

  function chooseCard(cards, title) {
    if (!cards.length) return Promise.resolve(null);
    return modal({
      title: title, dismiss: null,
      html: '<p class="modal-text">Select a card from your current hand.</p><div class="pick-cards">' +
        cards.map(function (c) { seen[c.uid] = true; return '<button class="pick" data-pick="' + esc(c.uid) + '">' + cardHTML(c, ' big') + '<span>' + esc(Cards.describeValue(c)) + '</span></button>'; }).join('') + '</div>',
      buttons: [{ label: 'CANCEL', value: null }],
      onMount: function (root, close) {
        root.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () { FX.sfx('click'); close(b.getAttribute('data-pick')); });
        });
      }
    });
  }

  function chooseValue(min, max, title, text) {
    var btns = '';
    for (var v = min; v <= max; v++) {
      btns += '<button class="pick" data-val="' + v + '">' + cardHTML({ uid: 'preview' + v, rank: 'W', suit: 'W', sym: '✱', red: false, mod: v, wild: true, smuggled: false }, ' big') + '<span>COUNTS AS ' + v + '</span></button>';
    }
    var total = lastView && lastView.hands.length ? lastView.hands[Math.max(0, lastView.activeHand)].total : null;
    return modal({
      title: title, dismiss: null,
      html: '<p class="modal-text">' + (total !== null ? 'Your hand is ' + total + '. ' : '') + (text || 'Pick the wild card value. It stays fixed for the rest of the hand.') + '</p><div class="pick-cards">' + btns + '</div>',
      buttons: [{ label: 'CANCEL', value: null }],
      onMount: function (root, close) {
        root.querySelectorAll('[data-val]').forEach(function (b) {
          b.addEventListener('click', function () { FX.sfx('click'); close(parseInt(b.getAttribute('data-val'), 10)); });
        });
      }
    });
  }

  function itemRow(inv, extra) {
    var it = inv.item || ITEMS[inv.id];
    return '<div class="irow-icon r-' + rarityKey(it) + '">' + it.icon + '</div><div class="irow-text"><b>' + esc(it.name) + ' ' + chip(it) + '</b><span>' + esc(it.desc) + '</span><em>' + esc(it.usage) + '</em>' + (extra || '') + '</div>';
  }

  function chooseItem(invs, title) {
    if (!invs.length) return Promise.resolve(null);
    return modal({
      title: title, dismiss: null,
      html: '<div class="item-list">' + invs.map(function (inv) {
        return '<button class="irow pickable" data-pick="' + inv.uid + '">' + itemRow(inv) + '</button>';
      }).join('') + '</div>',
      buttons: [{ label: 'CANCEL', value: null }],
      onMount: function (root, close) {
        root.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () { FX.sfx('click'); close(b.getAttribute('data-pick')); });
        });
      }
    });
  }

  function chooseDeadWeight(cards) {
    var total = lastView && lastView.hands.length ? lastView.hands[Math.max(0, lastView.activeHand)].total : 0;
    return modal({
      title: 'DEAD WEIGHT — keep one card', tag: 'NO TAKE-BACKS',
      html: '<p class="modal-text">Your hand: ' + total + '. The card you keep is added to your hand. The other is dealt face-down to your opponent.</p><div class="pick-cards">' +
        cards.map(function (c, i) {
          seen[c.uid] = true;
          var nt = Cards.handValue((lastView ? lastView.hands[Math.max(0, lastView.activeHand)].cards : []).concat([c])).total;
          return '<button class="pick" data-idx="' + i + '">' + cardHTML(c, ' big') + '<span>KEEP → YOU HAVE ' + nt + (nt > 21 ? ' (BUST)' : '') + '</span></button>';
        }).join('') + '</div>',
      onMount: function (root, close) {
        root.querySelectorAll('[data-idx]').forEach(function (b) {
          b.addEventListener('click', function () { FX.sfx('click'); close(parseInt(b.getAttribute('data-idx'), 10)); });
        });
      }
    });
  }

  function bindPick(root, close) {
    root.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        FX.sfx('click');
        close(b.getAttribute('data-pick'));
      });
    });
  }

  function choosePandora(opts, title) {
    FX.staticBurst(260, 0.22);
    return modal({
      title: title, tag: 'CONTRABAND', cls: 'pandora', dismiss: null,
      html: '<p class="modal-text">Three items wait inside. Take one and it is used immediately, for free. Close the lid to keep the box for later; the same three will be waiting.</p><div class="item-list">' +
        opts.map(function (o) {
          return '<button class="irow pickable" data-pick="' + o.id + '"' + (o.ok ? '' : ' disabled') + '>' +
            itemRow({ id: o.id }, o.ok ? '<i class="ok">TAKE IT</i>' : '<i class="no">' + esc(o.reason) + '</i>') + '</button>';
        }).join('') + '</div>',
      buttons: [{ label: 'CLOSE THE LID', value: null }],
      onMount: bindPick
    });
  }

  function chooseMystery(known) {
    FX.sfx('flip');
    return modal({
      title: 'SCHRÖDINGER\'S CARD', tag: 'BEFORE THE REVEAL',
      html: '<div class="pick-cards"><div class="card back mystery big"><span class="back-mark">?</span></div></div>' +
        '<p class="modal-text center">Your hand without it: <b>' + known + '</b>. Keep the sealed card and it counts toward your total, whatever it turns out to be. Discard it and it never happened.</p>',
      buttons: [{ label: 'DISCARD IT', value: false }, { label: 'KEEP IT', value: true, cls: 'key-primary', isDefault: true }]
    }).then(function (v) { return v === true; });
  }

  function chooseGiveBack(invs) {
    return modal({
      title: 'GLOVES — your hands are full', tag: 'GIVE ONE BACK',
      html: '<p class="modal-text">You were holding a full inventory, so the steal is a swap. Choose one of your items to hand over.</p><div class="item-list">' +
        invs.map(function (inv) { return '<button class="irow pickable" data-pick="' + inv.uid + '">' + itemRow({ id: inv.id }) + '</button>'; }).join('') + '</div>',
      onMount: bindPick
    }).then(function (uid) { return uid || (invs[0] && invs[0].uid); });
  }

  function rescuePrompt(total, invs) {
    FX.sfx('bust');
    return modal({
      title: 'BUST — ' + total, tag: 'LAST CHANCE', cls: 'danger',
      html: '<p class="modal-text">You went over 21. Use one of these items to save the hand, or accept the bust and lose the round.</p><div class="item-list">' +
        invs.map(function (inv) { return '<button class="irow pickable" data-pick="' + inv.uid + '">' + itemRow({ id: inv.id }) + '</button>'; }).join('') + '</div>',
      buttons: [{ label: 'ACCEPT BUST', value: null, cls: 'key-danger' }],
      onMount: function (root, close) {
        root.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () { FX.sfx('click'); close(b.getAttribute('data-pick')); });
        });
      }
    });
  }

  function openInventory(invs, onUse, focusUid) {
    if (!invs.length) {
      return modal({ title: 'INVENTORY', html: '<p class="modal-text">Your inventory is empty. Win rounds to earn tokens and buy items between rounds.</p>', dismiss: null, buttons: [{ label: 'CLOSE', value: null, isDefault: true }] });
    }
    return modal({
      title: 'INVENTORY', tag: invs.length + ' / ' + H.CONFIG.inventoryMax, dismiss: null,
      html: '<div class="item-list">' + invs.map(function (inv) {
        var status = inv.usable ? '<i class="ok">USABLE NOW</i>' : '<i class="no">' + esc(inv.reason) + '</i>';
        return '<div class="irow' + (inv.uid === focusUid ? ' focus' : '') + '">' + itemRow(inv, status) +
          '<button class="key key-small" data-use="' + inv.uid + '"' + (inv.usable ? '' : ' disabled') + '>USE</button></div>';
      }).join('') + '</div>',
      buttons: [{ label: 'CLOSE', value: null }],
      onMount: function (root, close) {
        root.querySelectorAll('[data-use]').forEach(function (b) {
          b.addEventListener('click', function () {
            var uid = b.getAttribute('data-use');
            close(null);
            onUse(uid);
          });
        });
        var f = root.querySelector('.irow.focus');
        if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
        var fb = f && f.querySelector('[data-use]:not([disabled])');
        if (fb) setTimeout(function () { try { fb.focus(); } catch (e) { /* ignore */ } }, 40);
      }
    });
  }

  function showIntake(G, onConfirm) {
    var C = H.CONFIG;
    var existing = G.player.inventory.slice();
    var need = Math.max(0, existing.length + G.incoming.length - C.inventoryMax);
    var selected = {};
    var sealedN = G.sealedReturned || 0;
    var incomingHTML = G.incoming.map(function (id, i) {
      return '<div class="irow locked">' + itemRow({ id: id }, '<i class="ok">' + (i < sealedN ? 'RETURNED FROM ZIPLOCK BAG' : 'NEW · MUST ACCEPT') + '</i>') + '</div>';
    }).join('');
    var existingHTML = existing.length ? existing.map(function (inv) {
      return '<button class="irow pickable' + (need ? '' : ' static') + '" data-sac="' + inv.uid + '"' + (need ? '' : ' disabled') + '>' + itemRow({ id: inv.id }, need ? '<i class="sac-mark">KEEP</i>' : '<i class="ok">KEPT</i>') + '</button>';
    }).join('') : '<p class="modal-text dim">Nothing carried over.</p>';

    function label() {
      var n = Object.keys(selected).length;
      if (!need) return 'ACCEPT ITEMS ▸';
      return n === need ? 'SACRIFICE ' + n + ' & ACCEPT ▸' : 'SELECT ' + (need - n) + ' MORE TO SACRIFICE';
    }
    return modal({
      title: 'MON-02 // INVENTORY INTAKE', tag: 'MATCH ' + pad(G.matchIndex + 1), cls: 'intake',
      html:
        '<p class="modal-text">Both competitors receive ' + C.itemsPerMatch + ' items. Incoming items cannot be refused. ' +
        (need ? '<b class="amber">You can hold ' + C.inventoryMax + '. Choose ' + need + ' existing item' + (need > 1 ? 's' : '') + ' to sacrifice.</b>' : 'You have room for everything.') + '</p>' +
        '<div class="intake-cols"><section><h4>INCOMING (' + G.incoming.length + ')</h4><div class="item-list">' + incomingHTML + '</div></section>' +
        '<section><h4>YOUR INVENTORY (' + existing.length + ')</h4><div class="item-list">' + existingHTML + '</div></section></div>' +
        '<p class="modal-text dim">Your opponent also received ' + C.itemsPerMatch + ' items. Theirs stay hidden.</p>',
      buttons: [{ label: label(), value: 'ok', cls: 'key-primary intake-ok', disabled: need > 0, isDefault: true }],
      onMount: function (root) {
        var ok = root.querySelector('.intake-ok');
        root.querySelectorAll('[data-sac]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!need) return;
            var uid = b.getAttribute('data-sac');
            if (selected[uid]) delete selected[uid];
            else if (Object.keys(selected).length < need) selected[uid] = true;
            else { FX.sfx('error'); return; }
            FX.sfx('click');
            b.classList.toggle('sacrificed', !!selected[uid]);
            b.querySelector('.sac-mark').textContent = selected[uid] ? 'SACRIFICE' : 'KEEP';
            ok.textContent = label();
            ok.disabled = Object.keys(selected).length !== need;
          });
        });
      }
    }).then(function (v) {
      if (v === 'ok') onConfirm(Object.keys(selected));
    });
  }

  function menu(state) {
    return modal({
      title: 'MENU', dismiss: null,
      html: '<p class="modal-text dim">' + esc(state.saveNote) + '</p>',
      buttons: [
        { label: 'RESUME', value: null, isDefault: true },
        { label: 'HOW TO PLAY', value: 'how' },
        { label: 'SOUND: ' + (state.sound ? 'ON' : 'OFF'), value: 'sound' },
        { label: 'EFFECTS: ' + (state.fx === 'full' ? 'FULL' : 'LOW'), value: 'fx' },
        { label: 'RESTART TOURNAMENT', value: 'restart', cls: 'key-danger' },
        { label: 'QUIT TO TITLE', value: 'title' }
      ],
      cls: 'menu'
    });
  }

  /* ======================================================================
     TOOLTIPS
     ====================================================================== */
  var tipTarget = null;
  function showTip(t) {
    var text = t.getAttribute('data-tip');
    if (!text) return;
    tipTarget = t;
    el.tooltip.textContent = text;
    el.tooltip.hidden = false;
    var r = t.getBoundingClientRect();
    var tw = el.tooltip.offsetWidth, th = el.tooltip.offsetHeight;
    var x = Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2));
    var y = r.top - th - 8;
    if (y < 8) y = r.bottom + 8;
    el.tooltip.style.left = x + 'px';
    el.tooltip.style.top = y + 'px';
  }
  function hideTip() { tipTarget = null; el.tooltip.hidden = true; }

  /* ======================================================================
     KEYS
     ====================================================================== */
  function handleKey(ev) {
    var k = (ev.key || '').toLowerCase();
    if (modalState) {
      if (k === 'escape' && modalState.dismiss !== undefined) { closeModal(); ev.preventDefault(); }
      return true;
    }
    if (activeScreen === 'story') {
      if (k === 'enter' || k === ' ' || k === 'arrowright') { if (story) story.next(); ev.preventDefault(); }
      else if (k === 'escape' && story) story.skip();
      return true;
    }
    if (activeScreen === 'info') {
      if (k === 'escape' || k === 'enter') { el.infoBack.click(); ev.preventDefault(); }
      return true;
    }
    if (activeScreen === 'result') {
      if (k === 'enter') { el.resultBtn.click(); ev.preventDefault(); }
      return true;
    }
    if (activeScreen === 'title' || activeScreen === 'multi') return true;
    return false;
  }

  /* ======================================================================
     INIT
     ====================================================================== */
  function init(h) {
    handlers = h;
    // Rarity colours come from config.js so they live in one place.
    Object.keys(H.CONFIG.rarities).forEach(function (k) {
      document.documentElement.style.setProperty('--r-' + k, H.CONFIG.rarities[k].color);
    });
    ['room', 'layerBg', 'layerFrames', 'layerFg', 'livesBody', 'invBody', 'invCount', 'handBody', 'handTotalTop',
      'actStatus', 'turnTag', 'btnHit', 'btnStand', 'btnDouble', 'btnSplit', 'btnItem', 'btnPrimary',
      'oppName', 'oppLivesTop', 'oppFace', 'oppSpeech', 'oppCards', 'm5Overlay', 'oppStage',
      'logList', 'logFooter', 'logStatus', 'mon1', 'mon2', 'mon3', 'mon4', 'mon5', 'mon6',
      'banner', 'menuBtn', 'modalRoot', 'tooltip', 'staticCanvas',
      'tContinue', 'tNew', 'tHow', 'tCredits', 'tSound', 'tFx',
      'storyTag', 'storyText', 'storyPortrait', 'storyNext', 'storySkip',
      'infoTitle', 'infoBody', 'infoBack',
      'resultKicker', 'resultTitle', 'resultSub', 'resultPortrait', 'resultBtn', 'resultBtn2'
    ].forEach(function (id) { el[id] = $(id); });
    el.scr_title = $('scrTitle'); el.scr_story = $('scrStory'); el.scr_info = $('scrInfo'); el.scr_result = $('scrResult'); el.scr_multi = $('scrMulti');

    var band = document.createElement('div');
    band.className = 'conductor-band';
    band.hidden = true;
    el.oppStage.appendChild(band);
    el.conductorBand = band;

    // Action buttons
    [el.btnHit, el.btnStand, el.btnDouble, el.btnSplit, el.btnItem].forEach(function (b) {
      b.addEventListener('click', function () { FX.sfx('click'); handlers.onAction(b.getAttribute('data-act')); });
    });
    el.btnPrimary.addEventListener('click', function () { FX.sfx('click'); handlers.onPrimary(); });

    // Inventory slots (delegated)
    el.invBody.addEventListener('click', function (ev) {
      var s = ev.target.closest ? ev.target.closest('[data-uid]') : null;
      if (s) { FX.sfx('click'); handlers.onInspect(s.getAttribute('data-uid')); }
    });

    // M5 overlay buttons (delegated)
    el.m5Overlay.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('button') : null;
      if (!t) return;
      if (t.hasAttribute('data-buy')) { handlers.onBuy(parseInt(t.getAttribute('data-buy'), 10)); return; }
      var o = t.getAttribute('data-overlay');
      FX.sfx('click');
      if (o === 'intro') handlers.onIntro();
      else if (o === 'next') handlers.onPrimary();
    });

    // Title
    el.tNew.addEventListener('click', function () { FX.sfx('click'); handlers.onNewGame(); });
    el.tContinue.addEventListener('click', function () { FX.sfx('click'); handlers.onContinue(); });
    el.tHow.addEventListener('click', function () { FX.unlockAudio(); FX.sfx('click'); showInfo('how', function () { showScreen('title'); }); });
    el.tCredits.addEventListener('click', function () { FX.unlockAudio(); FX.sfx('click'); showInfo('credits', function () { showScreen('title'); }); });
    el.tSound.addEventListener('click', function () { FX.unlockAudio(); FX.setSound(!FX.settings.sound); updateTitleSettings(); FX.sfx('click'); });
    el.tFx.addEventListener('click', function () { FX.setFx(FX.settings.fx === 'full' ? 'low' : 'full'); updateTitleSettings(); FX.sfx('click'); });

    // Story
    el.storyNext.addEventListener('click', function () { if (story) story.next(); });
    el.storySkip.addEventListener('click', function () { if (story) story.skip(); });
    el.scr_story.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('button')) return;
      if (story) story.next();
    });

    el.infoBack.addEventListener('click', function () { FX.sfx('click'); if (infoBack) infoBack(); });
    el.resultBtn.addEventListener('click', function () { FX.sfx('click'); if (resultResolve) { var r = resultResolve; resultResolve = null; r(1); } });
    el.resultBtn2.addEventListener('click', function () { FX.sfx('click'); if (resultResolve) { var r = resultResolve; resultResolve = null; r(2); } });
    el.menuBtn.addEventListener('click', function () { FX.sfx('click'); handlers.onMenu(); });

    // Tooltips (mouse + keyboard focus; skipped for touch)
    document.addEventListener('mouseover', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-tip]') : null;
      if (t && t !== tipTarget) showTip(t);
      else if (!t && tipTarget) hideTip();
    });
    document.addEventListener('focusin', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-tip]') : null;
      if (t) showTip(t); else hideTip();
    });
    document.addEventListener('pointerdown', function (ev) { if (ev.pointerType === 'touch') hideTip(); FX.unlockAudio(); });
    document.addEventListener('scroll', hideTip, true);

    document.addEventListener('keydown', function (ev) { handlers.onKey(ev); });

    // The parallax layers are larger than the room; never let focus or
    // scroll-into-view shift the room (older Chrome lacks overflow: clip).
    el.room.addEventListener('scroll', function () {
      if (getComputedStyle(el.room).position === 'fixed' && (el.room.scrollLeft || el.room.scrollTop)) {
        el.room.scrollLeft = 0; el.room.scrollTop = 0;
      }
    });

    // Effects
    FX.initStatic(el.staticCanvas);
    FX.initParallax({ bg: el.layerBg, frames: el.layerFrames, fg: el.layerFg, root: el.room });
    FX.onPointer(function (nx, ny) {
      // Eyes follow the cursor: the opponent watches you.
      var svg = el.oppFace.querySelector('svg');
      if (!svg) return;
      var r = el.oppFace.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
      var px = (nx + 1) / 2 * window.innerWidth, py = (ny + 1) / 2 * window.innerHeight;
      Face.gaze(svg, (px - cx) / (window.innerWidth / 2), (py - cy) / (window.innerHeight / 2));
    });
  }

  H.UI = {
    init: init,
    render: render,
    showScreen: showScreen,
    setTitleContinue: setTitleContinue,
    playSequence: playSequence,
    showInfo: showInfo,
    showResult: showResult,
    setOpponent: setOpponent,
    setExpression: setExpression,
    oppEliminated: oppEliminated,
    say: say,
    conductorWhisper: conductorWhisper,
    banner: banner,
    flashStatus: flashStatus,
    lifeFlash: lifeFlash,
    showMatchIntro: showMatchIntro,
    showIntermission: showIntermission,
    hideOverlay: hideOverlay,
    showIntake: showIntake,
    modal: modal,
    closeModal: closeModal,
    confirm: confirmBox,
    chooseCard: chooseCard,
    chooseValue: chooseValue,
    chooseItem: chooseItem,
    chooseDeadWeight: chooseDeadWeight,
    rescuePrompt: rescuePrompt,
    choosePandora: choosePandora,
    chooseMystery: chooseMystery,
    chooseGiveBack: chooseGiveBack,
    openInventory: openInventory,
    menu: menu,
    handleKey: handleKey
  };
})(window.H21 = window.H21 || {});
