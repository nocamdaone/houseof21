/* ==========================================================================
   HOUSE OF 21 — mp.js
   Online multiplayer: 1v1 and 4-player free-for-all, through public
   matchmaking or a private room code.

   Transport: the hosted page's live "room" service (window.claude.use
   ('room')). It exists only in the hosted claude.ai page; the offline file
   shows a notice instead. Only signed-in people the page is shared with
   can connect.

   Model (host-authoritative):
   - One player's page (the host) runs the match and shares the whole table
     in its presence field `g`, compacted to fit the 4 KiB limit.
   - Every page sends numbered actions in its own presence field `a`; the
     host acknowledges each one in the table (`ac`).
   - Prompts that need a player mid-effect (Dead Weight, Gloves swap,
     Schrodinger's card, bust rescue) are "asks" in the table, answered
     with an `ans` action.
   The 22 items are reused unchanged through an adapter that maps their
   'player'/'opp' view onto an actor and a chosen target.
   ========================================================================== */
(function (H) {
  'use strict';
  var Cards = H.Cards, Items = H.Items, ITEMS = H.Items.ITEMS, RNG = H.RNG, FX = H.FX, Face = H.Face;
  var UI = null;
  function M() { return H.CONFIG.mp; }
  function now() { return Date.now(); }
  function noop() {}
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* Items that act on an opponent: in a free-for-all you pick who. */
  var TARGETED = ['xray', 'ratpoison', 'shackles', 'handsaw', 'burner', 'viceclamp', 'chokehold', 'gloves', 'deadweight', 'russiandoll'];
  var EXCLUDED = ['ziplock']; // there is no "next match" online
  var ACTION_NAMES = { hit: 'HIT', stand: 'STAND', double: 'DOUBLE DOWN', split: 'SPLIT', item: 'USE ITEM' };
  var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var STORE_KEY = 'house21.mp.v1';

  /* Player avatars: generic placeholder looks (swap for real art later). */
  var AVATARS = [
    { head: 'round', skin: '#c9ad97', hair: 'short', hairColor: '#3b2c22', shirt: '#4b5249', collar: 'tee' },
    { head: 'small', skin: '#d4b8a2', hair: 'bob', hairColor: '#7a4d2c', shirt: '#5c4a5a', collar: 'open' },
    { head: 'narrow', skin: '#9c7a5f', hair: 'buzz', hairColor: '#1c1714', shirt: '#3e4a5a', collar: 'polo' },
    { head: 'small', skin: '#a77c5f', hair: 'long', hairColor: '#2a1d16', shirt: '#4a3c4a', collar: 'tee' },
    { head: 'long', skin: '#bfae99', hair: 'slick', hairColor: '#4a3a2c', shirt: '#2f3a34', collar: 'open', extras: ['glasses'] },
    { head: 'round', skin: '#e0c8b4', hair: 'braids', hairColor: '#a8713c', shirt: '#6a4a3a', collar: 'peter' },
    { head: 'wide', skin: '#8a6a52', hair: 'none', browColor: '#2a221c', shirt: '#4a4a3a', collar: 'tee', extras: ['stubble'] },
    { head: 'small', skin: '#cfb7a4', hair: 'shaggy', hairColor: '#5a5048', shirt: '#38424a', collar: 'none', hood: '#38424a', extras: ['hood'] }
  ];

  /* ======================================================================
     1. CARD CODEC (compact text so the table fits in presence)
     ====================================================================== */
  function enc(c) {
    if (!c) return '';
    var s;
    if (c.wild) s = 'W' + (c.kind === 'doll' ? 'd' : 'p') + c.mod + '~' + c.uid;
    else s = c.uid + (c.mod !== null && c.mod !== undefined ? '=' + c.mod : '');
    return (c.mystery ? '?' : '') + s;
  }
  function dec(t) {
    var mystery = t.charAt(0) === '?';
    if (mystery) t = t.slice(1);
    var c;
    if (t.charAt(0) === 'W') {
      var kind = t.charAt(1) === 'd' ? 'doll' : 'placebo';
      var parts = t.slice(2).split('~');
      c = { uid: parts[1] || t, rank: 'W', suit: 'W', sym: '✱', red: false, mod: parseInt(parts[0], 10) || 1, wild: true, smuggled: false, kind: kind };
    } else {
      var bits = t.split('=');
      var base = bits[0], core = base.split('*')[0];
      c = Cards.makeCard(core.slice(0, -1), core.slice(-1));
      c.uid = base;
      c.smuggled = base.indexOf('*') >= 0;
      c.mod = bits.length > 1 ? parseInt(bits[1], 10) : null;
    }
    c.mystery = mystery;
    return c;
  }
  function encList(a) { return (a || []).map(enc).join(','); }
  function decList(s) { return s ? s.split(',').map(dec) : []; }

  /* ======================================================================
     2. SHARED RULES (run by the host on the real table and by every
        client on its copy, so buttons match what the host will accept)
     ====================================================================== */
  function total(h) { return Cards.handValue(h.cards).total; }
  function finished(h) { return h.stood || total(h) > 21; }
  function alive(p) { return !!p && p.lives > 0 && !p.left; }
  function isDone(p) {
    if (!alive(p) || !p.hands.length) return true;
    for (var i = 0; i < p.hands.length; i++) if (!finished(p.hands[i])) return false;
    return true;
  }
  function allBusted(p) {
    if (!p.hands.length) return false;
    for (var i = 0; i < p.hands.length; i++) if (total(p.hands[i]) <= 21) return false;
    return true;
  }
  function focusIndex(p) {
    var i;
    for (i = 0; i < p.hands.length; i++) if (!finished(p.hands[i])) return i;
    for (i = p.hands.length - 1; i >= 0; i--) if (total(p.hands[i]) > 21) return i;
    return Math.max(0, p.hands.length - 1);
  }
  function focusHand(p) { return p.hands[focusIndex(p)]; }
  function bestTotal(p) {
    var best = -1;
    p.hands.forEach(function (h) { var t = total(h); if (t <= 21 && t > best) best = t; });
    if (best < 0) { best = 99; p.hands.forEach(function (h) { best = Math.min(best, total(h)); }); }
    return best;
  }
  function cardCount(p) { var n = 0; p.hands.forEach(function (h) { n += h.cards.length; }); return n; }
  function isNatural(p) {
    return !p.split && p.hands.length === 1 && p.hands[0].drawn.length === 0 && Cards.isNatural(p.hands[0].cards);
  }
  function deckSize(S) { return S.deck ? S.deck.length : (S.ds || 0); }
  function aliveIdx(S) { var out = []; S.players.forEach(function (p, i) { if (alive(p)) out.push(i); }); return out; }
  function opponentsOf(S, i) { return aliveIdx(S).filter(function (j) { return j !== i; }); }
  function findInv(p, uid) {
    for (var i = 0; i < p.inventory.length; i++) if (p.inventory[i].uid === uid) return p.inventory[i];
    return null;
  }
  function immune(S, i) { return (S.fx.flu[i] || 0) > 0; }

  function availableActions(S, i, ignoreShackle) {
    if (S.phase !== 'play') return [];
    var p = S.players[i];
    if (!alive(p) || isDone(p)) return [];
    var h = focusHand(p), out = [], ds = deckSize(S);
    if (ds > 0) out.push('hit');
    var fresh = !p.split && p.hands.length === 1 && h.drawn.length === 0 && h.cards.length === 2;
    if (fresh && ds >= 1) out.push('double');
    if (fresh && ds >= 2 && Cards.cardValue(h.cards[0]) === Cards.cardValue(h.cards[1])) out.push('split');
    if (p.inventory.length) out.push('item');
    if (!ignoreShackle && S.fx.sh[i]) out = out.filter(function (a) { return a !== S.fx.sh[i]; });
    return out;
  }

  function addToBestHand(p, card) {
    var target = null, i;
    for (i = 0; i < p.hands.length; i++) if (!finished(p.hands[i])) { target = p.hands[i]; break; }
    if (!target) for (i = 0; i < p.hands.length; i++) if (total(p.hands[i]) <= 21) { target = p.hands[i]; break; }
    if (!target) target = p.hands[p.hands.length - 1];
    if (!target) return;
    target.cards.push(card);
    target.drawn.push(card.uid);
  }

  /* Map an item's 'player' / 'opp' view onto actor `a` and target `t`. */
  function viewOf(arr, a, t) {
    var o = {};
    Object.defineProperty(o, 'player', { get: function () { return arr[a]; }, set: function (v) { arr[a] = v; }, enumerable: true });
    Object.defineProperty(o, 'opp', { get: function () { return arr[t]; }, set: function (v) { arr[t] = v; }, enumerable: true });
    return o;
  }

  var READONLY = {
    drawCard: function () { return null; }, takeFromDeck: function () { return null; },
    returnToDeck: noop, shuffleDeck: noop, discard: noop, gainLife: noop,
    loseLives: function () { return 0; }, logItem: noop, xray: noop, burner: noop,
    ask: function () { return Promise.resolve(null); }, flu: noop, announce: noop,
    applyItem: function () { return Promise.resolve(); }, serial: function () { return 0; }
  };

  function makeE(S, a, t, hk) {
    var P = S.players;
    function I(k) { return k === 'player' ? a : t; }
    var fx = {
      ratPoison: viewOf(S.fx.rp, a, t), handSaw: viewOf(S.fx.hs, a, t),
      shackled: viewOf(S.fx.sh, a, t), clamped: viewOf(S.fx.cl, a, t), tourniquet: viewOf(S.fx.tq, a, t)
    };
    var tqn = viewOf(S.fx.tqn, a, t);
    var E = {
      side: function (k) { return P[I(k)]; },
      other: function (k) { return k === 'player' ? 'opp' : 'player'; },
      lives: function (k) { return P[I(k)].lives; },
      maxLives: function () { return M().maxLives; },
      startLives: function () { return M().startLives; },
      gainLife: function (k, n) { hk.gainLife(I(k), n); },
      loseLives: function (k, n) { return hk.loseLives(I(k), n); },
      inventory: function (k) { return P[I(k)].inventory; },
      removeInventory: function (k, uid) {
        var inv = P[I(k)].inventory;
        for (var i = 0; i < inv.length; i++) if (inv[i].uid === uid) return inv.splice(i, 1)[0];
        return null;
      },
      focusHand: function (k) { return focusHand(P[I(k)]); },
      isDone: function (k) { return isDone(P[I(k)]); },
      cardCount: function (k) { return cardCount(P[I(k)]); },
      drawCard: hk.drawCard,
      deckSize: function () { return deckSize(S); },
      takeFromDeck: hk.takeFromDeck, returnToDeck: hk.returnToDeck, shuffleDeck: hk.shuffleDeck, discard: hk.discard,
      addCard: function (k, card, opts) {
        opts = opts || {};
        var h = opts.hand || focusHand(P[I(k)]);
        h.cards.push(card);
        if (opts.drawn) h.drawn.push(card.uid);
      },
      addCardToOther: function (k, card) { addToBestHand(P[I(k)], card); },
      log: function (k, text, kind) { hk.logItem(a, t, k === 'player' ? text : null, k === 'player' ? null : text, kind); },
      logBoth: function (k, mine, theirs, kind) { hk.logItem(I(k), I(E.other(k)), mine, theirs, kind); },
      fx: function () { return fx; },
      tourniquetNext: function () { return tqn; },
      availableActions: function (k, ign) { return availableActions(S, I(k), ign); },
      actionName: function (x) { return ACTION_NAMES[x] || x; },
      nextSerial: hk.serial,
      sealedCount: function () { return 99; }, seal: noop, isLastMatch: function () { return true; },
      xray: function (w, tg) { hk.xray(I(w), I(tg)); },
      recordBurner: function (w, tg, r) { hk.burner(I(w), I(tg), r); },
      chooseDeadWeight: function (w, cards) { return hk.ask(I(w), 'dw', cards.map(enc)); },
      chooseGiveBack: function (w, invs) { return hk.ask(I(w), 'gb', invs.map(function (x) { return x.uid; })); },
      immune: function (k) { return immune(S, I(k)); },
      startFluShot: function (k) { hk.flu(I(k)); },
      announce: function (w, text, good) { hk.announce(I(w), text, good); },
      applyVirtual: function (w, id, params) { return hk.applyItem(I(w), I(E.other(w)), id, params); },
      rollOffer: function () { return rollOffer(); },
      virtualCanUse: function (w, id, win) {
        var it = ITEMS[id];
        if (!it || it.windows.indexOf(win) < 0) return { ok: false, reason: 'NOT RIGHT NOW' };
        return it.canUse(E, w, win);
      },
      bestTotal: function (k) { return bestTotal(P[I(k)]); },
      allBusted: function (k) { return allBusted(P[I(k)]); },
      rage: function () { return 0; },
      unknownPool: function () { return []; },
      canUseItem: function () { return { ok: false, reason: '' }; }
    };
    return E;
  }

  function rollOffer() { return Items.randomIds(3, { exclude: ['pandora'].concat(EXCLUDED), distinct: true }); }

  /** Can player i use item uid in window win (against target, or anyone)? */
  function mpCanUse(S, i, uid, win, target) {
    var p = S.players[i];
    if (!alive(p)) return { ok: false, reason: 'ELIMINATED' };
    var inv = findInv(p, uid);
    if (!inv) return { ok: false, reason: 'ITEM NOT FOUND' };
    var it = ITEMS[inv.id];
    if (EXCLUDED.indexOf(inv.id) >= 0) return { ok: false, reason: 'NOT USED IN ONLINE MATCHES' };
    if (!win || it.windows.indexOf(win) < 0) {
      if (win === 'between') return { ok: false, reason: 'ONLY DURING YOUR TURN IN A HAND' };
      if (win === 'rescue') return { ok: false, reason: 'CANNOT SAVE A BUST' };
      return { ok: false, reason: it.windows.indexOf('turn') >= 0 ? 'ONLY ON YOUR TURN' : 'ONLY BETWEEN ROUNDS' };
    }
    if (win === 'turn' && (S.phase !== 'play' || S.turn !== i || isDone(p))) return { ok: false, reason: 'ONLY ON YOUR TURN' };
    if (win === 'between' && S.phase !== 'inter') return { ok: false, reason: 'ONLY BETWEEN ROUNDS' };
    if (win === 'rescue' && !allBusted(p)) return { ok: false, reason: 'YOU HAVE NOT BUSTED' };
    if ((win === 'turn' || win === 'rescue') && S.fx.sh[i] === 'item') return { ok: false, reason: 'ITEMS ARE SHACKLED THIS ROUND' };
    if ((win === 'turn' || win === 'rescue') && S.fx.cl[i]) return { ok: false, reason: 'ITEMS CLAMPED THIS ROUND' };
    var targets = (target !== null && target !== undefined) ? [target] : opponentsOf(S, i);
    if (!targets.length) return { ok: false, reason: 'NO OPPONENT' };
    var last = { ok: false, reason: 'NO VALID TARGET' };
    for (var k = 0; k < targets.length; k++) {
      var r = it.canUse(makeE(S, i, targets[k], READONLY), 'player', win);
      if (r.ok) return r;
      last = r;
    }
    return last;
  }

  /* ======================================================================
     3. HOST — runs the match
     ====================================================================== */
  var HOST = null;

  function newFx(n) {
    function fill(v) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
    return { rp: fill(false), hs: fill(false), sh: fill(null), cl: fill(false), tq: fill(0), tqn: fill(false), flu: fill(0) };
  }
  function hS() { return HOST.S; }
  /** Timer lengths. Same-screen games have no clocks: people pass the device. */
  function tm(k) { return HOST && HOST.local ? 864e5 : M()[k]; }
  function serial() { hS().serial += 1; return hS().serial; }
  function newInv(id) { return { uid: 'i' + serial(), id: id, offer: id === 'pandora' ? rollOffer() : null }; }
  function hlog(e) {
    var S = hS();
    S.logN += 1;
    e.n = S.logN;
    S.log.push(e);
    if (S.log.length > 40) S.log.shift();
  }
  function logSys(text, kind) { hlog({ a: null, z: text, k: kind || 'sys' }); }
  function logAct(i, mine, pub, kind) { hlog({ a: i, x: mine, z: pub, k: kind || 'act' }); }

  var HK = {
    drawCard: function () { var S = hS(); return S.deck.length ? S.deck.pop() : null; },
    takeFromDeck: function (uid) {
      var d = hS().deck;
      for (var i = 0; i < d.length; i++) if (d[i].uid === uid) return d.splice(i, 1)[0];
      return null;
    },
    returnToDeck: function (c) {
      if (!c) return;
      if (c.wild || c.smuggled) { hS().discard.push(c); return; }
      c.mod = null; c.mystery = false;
      hS().deck.push(c);
    },
    shuffleDeck: function () { RNG.shuffle(hS().deck); },
    discard: function (c) { hS().discard.push(c); },
    gainLife: function (i, n) { var p = hS().players[i]; p.lives = Math.min(M().maxLives, p.lives + n); },
    loseLives: function (i, n) { return loseLives(i, n); },
    logItem: function (a, t, mine, theirs, kind) { hlog({ a: a, t: t, x: mine, y: theirs, k: kind || 'item' }); },
    xray: function (a, t) {
      var S = hS();
      S.players[a].intel.x = { t: t, c: encList(S.players[t].initial), u: now() + H.CONFIG.xrayDurationMs };
    },
    burner: function (a, t, r) { var S = hS(); S.players[a].intel.b = { t: t, r: r, n: cardCount(S.players[t]) }; },
    ask: function (i, kind, data) { return ask(i, kind, data, tm('askMs')); },
    flu: function (i) {
      var fx = hS().fx;
      fx.flu[i] = H.CONFIG.fluShotRounds;
      fx.rp[i] = false; fx.hs[i] = false; fx.sh[i] = null; fx.cl[i] = false;
    },
    announce: function (i, text, good) { announce(i, text, good); },
    applyItem: function (a, t, id, params) { return applyItem(a, t, id, params); },
    serial: serial
  };

  function announce(i, text, good) { var p = hS().players[i]; if (p) p.bn = { n: serial(), t: String(text).slice(0, 60), g: good ? 1 : 0 }; }

  function loseLives(i, n) {
    var S = hS(), p = S.players[i];
    if (n <= 0 || !alive(p)) return 0;
    if (S.fx.tq[i] > 0) {
      S.fx.tq[i] = 0;
      n -= 1;
      hlog({ a: i, z: 'TOURNIQUET ABSORBED 1 LIFE', k: 'trap' });
    }
    n = Math.min(n, p.lives);
    if (n <= 0) return 0;
    p.lives -= n;
    if (p.lives <= 0) eliminate(i, 'OUT OF LIVES');
    return n;
  }

  function eliminate(i, why) {
    var S = hS(), p = S.players[i];
    if (p.out) return;
    p.out = true;
    p.lives = Math.max(0, Math.min(p.lives, 0));
    p.hands.forEach(function (h) { h.stood = true; });
    hlog({ a: i, z: 'ELIMINATED' + (why ? ' · ' + why : ''), k: 'lose' });
    announce(i, 'ELIMINATED', false);
    S.asks.slice().forEach(function (a) { if (a.p === i) answer(i, a.id, undefined); });
  }

  /* ---- asks: prompts a player must answer mid-effect ---- */
  function askDefault(kind, data) {
    if (kind === 'dw') return 0;
    if (kind === 'gb') return data && data[0];
    if (kind === 'my') return false;
    return null;
  }
  function ask(i, kind, data, ms) {
    var S = hS();
    if (!alive(S.players[i])) return Promise.resolve(askDefault(kind, data));
    var id = serial();
    S.asks.push({ id: id, p: i, k: kind, d: data, u: now() + (ms || tm('askMs')) });
    publish();
    return new Promise(function (res) { HOST.pending[id] = { res: res, kind: kind, data: data }; });
  }
  function answer(i, id, v) {
    var S = hS();
    var idx = -1;
    for (var k = 0; k < S.asks.length; k++) if (S.asks[k].id === id && S.asks[k].p === i) idx = k;
    if (idx < 0) return;
    S.asks.splice(idx, 1);
    var pd = HOST.pending[id];
    delete HOST.pending[id];
    if (!pd) return;
    var out = askDefault(pd.kind, pd.data);
    if (v !== undefined && v !== null) {
      if (pd.kind === 'dw') out = v === 1 ? 1 : 0;
      else if (pd.kind === 'gb') out = (pd.data || []).indexOf(v) >= 0 ? v : out;
      else if (pd.kind === 'my') out = v === true;
      else if (pd.kind === 'rescue') out = (v && typeof v === 'object' && typeof v.u === 'string') ? v : null;
    }
    pd.res(out);
    publish();
  }
  function hasAsk(i) { return hS().asks.some(function (a) { return a.p === i; }); }

  /* ---- match lifecycle ---- */
  function hostCreate(room, mode, roster) {
    stopHost();
    var n = roster.length;
    var S = {
      id: 'g' + Math.random().toString(36).slice(2, 8), mode: mode, phase: 'play', round: 0, start: RNG.int(0, n - 1),
      players: roster.map(function (r) {
        return { peer: r.peer, name: r.name, av: r.av, lives: M().startLives, tokens: 0, left: false, out: false,
          inventory: [], hands: [], initial: [], prevInitial: null, doubled: false, split: false, itemsUsedThisRound: 0,
          intel: { x: null, b: null }, shop: [], bought: 0, ready: false, ack: 0, bn: null, declined: false };
      }),
      fx: newFx(n), deck: [], discard: [], turn: null, deadline: 0, revealUntil: 0, asks: [],
      log: [], logN: 0, serial: 0, winner: null, res: null, seq: 0, actions: 0
    };
    HOST = { room: room, local: !room, S: S, lastSeq: {}, q: Promise.resolve(), pending: {}, busy: false, autoPending: false, timer: 0 };
    S.players.forEach(function (p) {
      p.inventory = Items.randomIds(M().startItems, { exclude: EXCLUDED }).map(newInv);
    });
    logSys('MATCH START · ' + (mode === 'duel' ? '1V1' : n + '-PLAYER FREE FOR ALL'), 'sys');
    startRound();
    HOST.timer = setInterval(tick, 400);
    publish();
  }

  function stopHost() {
    if (!HOST) return;
    clearInterval(HOST.timer);
    Object.keys(HOST.pending).forEach(function (id) { try { HOST.pending[id].res(askDefault(HOST.pending[id].kind, HOST.pending[id].data)); } catch (e) { /* ignore */ } });
    HOST = null;
  }

  function startRound() {
    var S = hS();
    if (S.phase === 'over' || checkOver()) return;
    S.round += 1;
    S.phase = 'play';
    S.res = null;
    S.actions = 0;
    S.deck = Cards.freshShuffledDeck();
    S.discard = [];
    S.fx.tq = S.fx.tqn.map(function (v) { return v ? 1 : 0; });
    S.fx.tqn = S.players.map(function () { return false; });
    var n = S.players.length, order = [];
    for (var k = 0; k < n; k++) { var j = (S.start + k) % n; if (alive(S.players[j])) order.push(j); }
    S.start = (S.start + 1) % n;
    S.players.forEach(function (p) {
      p.hands = []; p.initial = []; p.doubled = false; p.split = false; p.itemsUsedThisRound = 0;
      p.intel = { x: null, b: null }; p.declined = false; p.ready = false;
    });
    order.forEach(function (j) { S.players[j].hands = [{ cards: [], stood: false, drawn: [] }]; });
    for (var pass = 0; pass < 2; pass++) order.forEach(function (j) { S.players[j].hands[0].cards.push(S.deck.pop()); });
    order.forEach(function (j) { S.players[j].initial = S.players[j].hands[0].cards.map(Cards.cloneCard); });
    logSys('— ROUND ' + pad(S.round) + ' —', 'round');
    if (order.some(function (j) { return isNatural(S.players[j]); })) {
      logSys('NATURAL BLACKJACK!', 'reveal');
      S.turn = null;
      resolve('natural');
      return;
    }
    S.turn = order[0];
    S.deadline = now() + tm('turnMs');
  }

  function startInter() {
    var S = hS();
    S.phase = 'inter';
    S.deadline = now() + tm('interMs');
    aliveIdx(S).forEach(function (i) {
      var p = S.players[i];
      p.shop = Items.randomIds(M().shopSize, { exclude: EXCLUDED, distinct: true });
      p.bought = 0;
      p.ready = false;
    });
  }

  function checkOver() {
    var S = hS();
    if (S.phase === 'over') return true;
    var al = aliveIdx(S);
    if (al.length <= 1) {
      S.phase = 'over';
      S.turn = null;
      S.winner = al.length ? al[0] : null;
      hlog({ a: S.winner, z: S.winner === null ? 'NOBODY SURVIVED THE TABLE' : 'WINS THE MATCH', k: 'win' });
      S.asks.slice().forEach(function (a) { answer(a.p, a.id, undefined); });
      return true;
    }
    return false;
  }

  function nextTurn(prev) {
    var S = hS(), n = S.players.length;
    var al = aliveIdx(S);
    if (!al.length || al.every(function (j) { return isDone(S.players[j]); })) { resolve('compare'); return; }
    var from = (prev === null || prev === undefined) ? -1 : prev;
    for (var k = 1; k <= n; k++) {
      var j = (from + k + n) % n;
      if (alive(S.players[j]) && !isDone(S.players[j])) {
        S.turn = j;
        S.deadline = now() + tm('turnMs');
        return;
      }
    }
  }

  function advance(actor, pass) {
    var S = hS();
    if (S.phase !== 'play') return;
    var al = aliveIdx(S);
    if (al.every(function (j) { return isDone(S.players[j]); })) { resolve('compare'); return; }
    var cur = S.turn;
    if (pass && cur === actor) nextTurn(actor);
    else if (cur === null || !alive(S.players[cur]) || isDone(S.players[cur])) nextTurn(cur === null ? actor : cur);
  }

  function doAction(i, kind, auto) {
    var S = hS(), p = S.players[i];
    var acts = availableActions(S, i, false);
    if (kind !== 'stand' && acts.indexOf(kind) < 0) return false;
    var h = focusHand(p), hi = focusIndex(p), tag = p.split ? ' [HAND ' + (hi + 1) + ']' : '', c;
    S.actions += 1;
    if (kind === 'hit') {
      c = HK.drawCard();
      if (!c) { h.stood = true; logAct(i, 'DECK EMPTY · STAND', 'STANDS (DECK EMPTY)'); }
      else {
        h.cards.push(c); h.drawn.push(c.uid);
        logAct(i, 'HIT' + tag + ' → ' + Cards.label(c) + ' (' + total(h) + ')', 'HITS' + tag + ' · ' + cardCount(p) + ' CARDS');
      }
    } else if (kind === 'stand') {
      h.stood = true;
      logAct(i, (auto ? 'TIMED OUT · ' : '') + 'STAND' + tag + ' ON ' + total(h), (auto ? 'TIMED OUT · ' : '') + 'STANDS' + tag);
    } else if (kind === 'double') {
      p.doubled = true;
      c = HK.drawCard();
      if (c) { h.cards.push(c); h.drawn.push(c.uid); }
      h.stood = true;
      logAct(i, 'DOUBLE DOWN → ' + (c ? Cards.label(c) : '—') + ' (' + total(h) + ') · STAKES 2', 'DOUBLED DOWN · STAKES NOW 2');
    } else if (kind === 'split') {
      var a = h.cards[0], b = h.cards[1];
      p.split = true;
      p.hands = [{ cards: [a], stood: false, drawn: [] }, { cards: [b], stood: false, drawn: [] }];
      var c1 = HK.drawCard(), c2 = HK.drawCard();
      p.hands[0].cards.push(c1); p.hands[0].drawn.push(c1.uid);
      p.hands[1].cards.push(c2); p.hands[1].drawn.push(c2.uid);
      logAct(i, 'SPLIT → ' + Cards.label(a) + ' ' + Cards.label(c1) + ' | ' + Cards.label(b) + ' ' + Cards.label(c2), 'SPLITS · 2 HANDS');
    }
    if (p.split && total(h) > 21 && !allBusted(p)) logAct(i, 'HAND ' + (hi + 1) + ' BUST', 'HAND ' + (hi + 1) + ' BUSTS', 'trap');
    if (S.actions > 120) aliveIdx(S).forEach(function (j) { S.players[j].hands.forEach(function (x) { x.stood = true; }); });
    return true;
  }

  function validParams(p, uid, it, params) {
    params = params || {};
    if (it.ask === 'item') return !!(params.itemUid && params.itemUid !== uid && findInv(p, params.itemUid));
    if (it.ask === 'value') {
      var v = params.value;
      return typeof v === 'number' && v >= (it.askMin || 1) && v <= (it.askMax || 5) && Math.floor(v) === v;
    }
    if (it.ask === 'card') {
      var h = focusHand(p);
      return !!(h && h.cards.some(function (c) { return c.uid === params.cardUid && !c.mystery; }));
    }
    return true;
  }

  function applyItem(a, t, id, params) {
    var S = hS(), it = ITEMS[id];
    if (it.hostile && immune(S, t)) {
      hlog({ a: a, t: t, z: it.name + ' BOUNCED OFF {T} (FLU SHOT)', k: 'trap' });
      return Promise.resolve();
    }
    return Promise.resolve(it.apply(makeE(S, a, t, HK), 'player', params || {}));
  }

  function useItem(i, uid, params, t, win) {
    var S = hS(), p = S.players[i];
    if (t === null || t === undefined) return Promise.resolve(false);
    var chk = mpCanUse(S, i, uid, win, t);
    if (!chk.ok) return Promise.resolve(false);
    var inv = findInv(p, uid), it = ITEMS[inv.id];
    if (inv.id === 'pandora') {
      var ch = params && params.choice;
      if (!inv.offer || inv.offer.indexOf(ch) < 0) return Promise.resolve(false);
      var inner = ITEMS[ch];
      if (inner.windows.indexOf(win) < 0 || !inner.canUse(makeE(S, i, t, READONLY), 'player', win).ok) return Promise.resolve(false);
      if (!validParams(p, uid, inner, params.inner)) return Promise.resolve(false);
    } else if (!validParams(p, uid, it, params)) return Promise.resolve(false);
    p.inventory.splice(p.inventory.indexOf(inv), 1);
    p.itemsUsedThisRound += 1;
    var aimed = TARGETED.indexOf(inv.id) >= 0 || (inv.id === 'pandora' && TARGETED.indexOf(params.choice) >= 0);
    hlog({ a: i, t: aimed ? t : null, z: 'USED ' + it.name + (aimed ? ' ON {T}' : ''), k: 'item' });
    if (S.fx.rp[i]) {
      S.fx.rp[i] = false;
      if (immune(S, i)) hlog({ a: i, z: 'SHRUGGED OFF RAT POISON (FLU SHOT)', k: 'trap' });
      else {
        hlog({ a: i, z: 'TOOK RAT POISON · -1 LIFE', k: 'trap' });
        loseLives(i, 1);
        if (!alive(p)) return Promise.resolve(true);
      }
    }
    return applyItem(i, t, inv.id, params).then(function () { return true; });
  }

  function settleBusts() {
    var S = hS();
    var order = aliveIdx(S);
    var chain = Promise.resolve();
    order.forEach(function (i) {
      chain = chain.then(function loop() {
        if (S.phase !== 'play' || HOST === null || HOST.S !== S) return;
        var p = S.players[i];
        if (!alive(p) || !allBusted(p)) { p.declined = false; return; }
        if (p.declined) return;
        var opp = opponentsOf(S, i)[0];
        var opts = p.inventory.filter(function (inv) { return mpCanUse(S, i, inv.uid, 'rescue', opp).ok; });
        if (!opts.length || opp === undefined) { p.declined = true; return; }
        return ask(i, 'rescue', { t: total(focusHand(p)), o: opts.map(function (x) { return x.uid; }) }, tm('rescueMs')).then(function (v) {
          if (v && opts.some(function (o) { return o.uid === v.u; })) {
            return useItem(i, v.u, v.p || {}, opp, 'rescue').then(function (used) {
              if (!used) { p.declined = true; return; }
              return loop();
            });
          }
          p.declined = true;
        });
      });
    });
    return chain;
  }

  function afterChange() {
    var S = hS();
    if (S.phase !== 'play') return Promise.resolve();
    if (checkOver()) return Promise.resolve();
    return settleBusts().then(function () {
      if (!HOST || HOST.S !== S || S.phase !== 'play') return;
      if (checkOver()) return;
      if (S.mode === 'duel' && aliveIdx(S).some(function (j) { return allBusted(S.players[j]); })) resolve('bust');
    });
  }

  function mysteriesOf(p) {
    var out = [];
    p.hands.forEach(function (h) { h.cards.forEach(function (c) { if (c.mystery) out.push({ hand: h, card: c }); }); });
    return out;
  }
  function settleMystery(i, m, keep) {
    if (!m.card.mystery) return;
    if (keep) {
      m.card.mystery = false;
      hlog({ a: i, x: 'SCHRÖDINGER\'S CARD KEPT: ' + Cards.label(m.card), z: 'KEPT A SEALED CARD', k: 'reveal' });
      return;
    }
    var k = m.hand.cards.indexOf(m.card);
    if (k >= 0) m.hand.cards.splice(k, 1);
    var d = m.hand.drawn.indexOf(m.card.uid);
    if (d >= 0) m.hand.drawn.splice(d, 1);
    m.card.mystery = false;
    hS().discard.push(m.card);
    hlog({ a: i, z: 'DISCARDED A SEALED CARD (IT WAS ' + Cards.label(m.card) + ')', k: 'reveal' });
  }

  function resolve(reason) {
    var S = hS();
    if (S.phase !== 'play') return Promise.resolve();
    S.phase = 'resolve';
    S.turn = null;
    S.revealUntil = 0;
    publish();
    var pre = Promise.resolve();
    if (reason !== 'natural') {
      pre = Promise.all(aliveIdx(S).map(function (i) {
        return mysteriesOf(S.players[i]).reduce(function (pr, m) {
          return pr.then(function () {
            return ask(i, 'my', total(m.hand), tm('askMs')).then(function (keep) { settleMystery(i, m, keep); });
          });
        }, Promise.resolve());
      }));
    }
    return pre.then(function () {
      if (!HOST || HOST.S !== S || S.phase !== 'resolve') return;
      var al = aliveIdx(S);
      var score = {}, label = {};
      al.forEach(function (i) {
        var p = S.players[i];
        mysteriesOf(p).forEach(function (m) { settleMystery(i, m, false); });
        if (allBusted(p)) { score[i] = -1; label[i] = 'BUST'; }
        else if (isNatural(p)) { score[i] = 22; label[i] = 'BJ'; }
        else { score[i] = bestTotal(p); label[i] = String(score[i]); }
      });
      var winners = [], losers = [];
      if (al.length && !al.every(function (i) { return score[i] < 0; })) {
        var max = -2;
        al.forEach(function (i) { max = Math.max(max, score[i]); });
        winners = al.filter(function (i) { return score[i] === max; });
        losers = al.filter(function (i) { return score[i] < 0; });
        var standing = al.filter(function (i) { return score[i] >= 0; });
        if (standing.length >= 2) {
          var min = 99;
          standing.forEach(function (i) { min = Math.min(min, score[i]); });
          if (min < max) standing.forEach(function (i) { if (score[i] === min) losers.push(i); });
        }
      }
      var winnerDoubled = winners.some(function (i) { return S.players[i].doubled; });
      var lost = [];
      losers.forEach(function (l) {
        var pen = 1;
        if (S.players[l].doubled || winnerDoubled) pen = 2;
        if (S.fx.hs[l] && score[l] < 0 && !immune(S, l)) pen = 2;
        lost.push([l, loseLives(l, Math.min(pen, 2))]);
      });
      if (losers.length) winners.forEach(function (i) { S.players[i].tokens += M().tokensPerWin; });
      var why = al.map(function (i) {
        var lo = 0;
        lost.forEach(function (x) { if (x[0] === i) lo = x[1]; });
        return S.players[i].name + ' ' + label[i] + (lo ? ' −' + lo : '') + (losers.length && winners.indexOf(i) >= 0 ? ' ★' : '');
      }).join(' · ');
      S.res = { rd: S.round, w: losers.length ? winners : [], l: lost, s: al.map(function (i) { return [i, label[i]]; }), why: why };
      logSys('RESULT: ' + why, losers.length ? 'reveal' : 'sys');
      S.players.forEach(function (p) { p.prevInitial = p.initial.map(Cards.cloneCard); });
      S.fx.flu = S.fx.flu.map(function (v) { return v > 0 ? v - 1 : 0; });
      var n = S.players.length;
      S.fx.rp = newFx(n).rp; S.fx.hs = newFx(n).hs; S.fx.sh = newFx(n).sh; S.fx.cl = newFx(n).cl; S.fx.tq = newFx(n).tq;
      S.revealUntil = now() + M().revealMs;
      publish();
    });
  }

  /* ---- incoming actions ---- */
  function validTarget(i, g) {
    var S = hS();
    if (typeof g === 'number' && g !== i && alive(S.players[g])) return g;
    var o = opponentsOf(S, i);
    return o.length ? o[0] : null;
  }

  function enqueue(i, act) {
    if (!HOST) return;
    var S = hS();
    HOST.q = HOST.q.then(function () {
      if (!HOST || HOST.S !== S) return;
      return handle(i, act);
    }).catch(function (e) { if (window.console) console.error('[mp]', e); });
  }

  function handle(i, act) {
    var S = hS(), p = S.players[i];
    if (!p) return;
    if (act.t === 'check') {
      HOST.busy = true;
      return afterChange().then(function () { advance(S.turn, false); }).then(done, done);
    }
    if (!alive(p) || S.phase === 'over') return;
    HOST.busy = true;
    function done() { if (HOST) { HOST.busy = false; HOST.autoPending = false; } publish(); }
    var t = act.t;
    if (t === 'hit' || t === 'stand' || t === 'double' || t === 'split') {
      if (S.phase !== 'play' || S.turn !== i || isDone(p) || hasAsk(i)) { done(); return; }
      if (!doAction(i, t, !!act.auto)) { done(); return; }
      return afterChange().then(function () { advance(i, true); }).then(done, done);
    }
    if (t === 'item') {
      var win = S.phase === 'inter' ? 'between' : 'turn';
      var inv = findInv(p, act.u);
      if (!inv) { done(); return; }
      var it = ITEMS[inv.id];
      return useItem(i, act.u, act.p || {}, validTarget(i, act.g), win).then(function (ok) {
        if (!ok) { announce(i, 'CANNOT USE THAT NOW', false); return; }
        if (S.phase === 'play') return afterChange().then(function () { advance(i, Items.costsOf(it, act.p)); });
        if (S.phase === 'inter') checkOver();
      }).then(done, done);
    }
    if (t === 'buy') {
      if (S.phase === 'inter') {
        var k = act.i | 0, id = p.shop[k];
        if (id && p.bought < 1 && p.tokens >= M().shopPrice && p.inventory.length < M().inventoryMax) {
          p.tokens -= M().shopPrice;
          p.bought += 1;
          p.shop[k] = null;
          p.inventory.push(newInv(id));
          hlog({ a: i, x: 'BOUGHT ' + ITEMS[id].name, z: 'BOUGHT AN ITEM', k: 'item' });
        }
      }
      done();
      return;
    }
    if (t === 'ready') {
      if (S.phase === 'inter') {
        p.ready = true;
        if (aliveIdx(S).every(function (j) { return S.players[j].ready; })) startRound();
      }
      done();
      return;
    }
    done();
  }

  function idxOfPeer(peer) {
    var P = hS().players;
    for (var i = 0; i < P.length; i++) if (P[i].peer === peer) return i;
    return -1;
  }

  /** Read every peer's latest action. Runs on room updates and on a timer
      (room updates are per animation frame, which pause in hidden tabs). */
  function pollPeers(peers) {
    if (!HOST || !HOST.room) return;
    var S = hS();
    (peers || HOST.room.peers()).forEach(function (pr) {
      if (pr.isMe && pr.sameTab) return;
      var i = idxOfPeer(pr.peer);
      if (i < 0) return;
      var a = pr.presence && pr.presence.a;
      if (!a || typeof a !== 'object' || a.gid !== S.id || typeof a.s !== 'number') return;
      var last = HOST.lastSeq[pr.peer] || 0;
      if (a.s <= last) return;
      HOST.lastSeq[pr.peer] = a.s;
      S.players[i].ack = a.s;
      if (a.t === 'ans') answer(i, a.k, a.v);
      else enqueue(i, a);
    });
  }

  function playerLeft(peer) {
    if (!HOST) return;
    var S = hS(), i = idxOfPeer(peer);
    if (i < 0 || S.players[i].left) return;
    S.players[i].left = true;
    eliminate(i, 'LEFT THE TABLE');
    if (S.phase === 'play' || S.phase === 'resolve' || S.phase === 'inter') {
      if (S.phase === 'inter') { if (!checkOver() && aliveIdx(S).every(function (j) { return S.players[j].ready; })) startRound(); }
      else enqueue(i, { t: 'check' });
    }
    publish();
  }

  function tick() {
    if (!HOST) return;
    var S = hS(), t = now(), changed = false;
    pollPeers();
    S.asks.slice().forEach(function (a) { if (a.u < t) answer(a.p, a.id, undefined); });
    if (S.phase === 'play' && S.turn !== null && t > S.deadline && !HOST.busy && !HOST.autoPending && !hasAsk(S.turn)) {
      HOST.autoPending = true;
      enqueue(S.turn, { t: 'stand', auto: 1 });
    }
    if (S.phase === 'resolve' && S.revealUntil && t > S.revealUntil) {
      S.revealUntil = 0;
      if (!checkOver()) startInter();
      changed = true;
    }
    if (S.phase === 'inter' && t > S.deadline) { startRound(); changed = true; }
    S.players.forEach(function (p) { if (p.intel.x && p.intel.x.u < t) { p.intel.x = null; changed = true; } });
    if (changed) publish();
  }

  /* ---- sharing the table ---- */
  var textEncoder = window.TextEncoder ? new TextEncoder() : null;
  function byteLen(s) { return textEncoder ? textEncoder.encode(s).length : unescape(encodeURIComponent(s)).length; }

  function wire() {
    var S = hS(), t = now();
    S.seq += 1;
    var w = {
      v: 1, id: S.id, m: S.mode, ph: S.phase, rd: S.round, tn: S.turn, hn: t,
      dl: S.deadline, ru: S.revealUntil || 0, ds: S.deck.length, w: S.winner, n: S.seq,
      fx: S.fx, ak: S.asks.map(function (a) { return [a.id, a.p, a.k, a.d, a.u]; }), rs: S.res,
      P: S.players.map(function (p) {
        return {
          pr: p.peer, nm: p.name, av: p.av, lv: p.lives, tk: p.tokens, lf: p.left ? 1 : 0,
          iv: p.inventory.map(function (x) { return x.offer ? [x.uid, x.id, x.offer] : [x.uid, x.id]; }),
          h: p.hands.map(function (h) { return [encList(h.cards), h.stood ? 1 : 0, h.drawn.join(',')]; }),
          in: encList(p.initial), pv: p.prevInitial ? encList(p.prevInitial) : '',
          db: p.doubled ? 1 : 0, sp: p.split ? 1 : 0, iu: p.itemsUsedThisRound,
          x: p.intel.x, b: p.intel.b, sh: p.shop, bo: p.bought, rd: p.ready ? 1 : 0, ac: p.ack || 0, bn: p.bn
        };
      }),
      lg: S.log.slice(-M().logWindow)
    };
    var s = JSON.stringify(w);
    while (byteLen(s) > M().wireLimit && w.lg.length) { w.lg.shift(); s = JSON.stringify(w); }
    return w;
  }

  function publish() {
    if (!HOST) return;
    var w = wire();
    HOST.lastWire = w;
    if (HOST.room) HOST.room.presence({ g: w }).catch(function (e) { if (window.console) console.warn('[mp] presence', e && e.message); });
    onState(w, true);
  }

  /* ======================================================================
     4. CLIENT — everyone, the host included
     ====================================================================== */
  var C = {
    room: null, queue: null, match: null, unsubs: [], qTimer: 0, uiTimer: 0,
    stage: 'menu', mode: 'duel', kind: null, code: '', hostPeer: null, isHost: false,
    expect: null, gatherUntil: 0, joinWait: 0,
    S: null, gameId: null, lastN: 0, offset: 0, myIdx: -1,
    seq: 0, pending: null, pendingAt: 0, outbox: [],
    log: [], logSeen: 0, answered: {}, askOpen: null, lastBanner: 0,
    lastPhase: null, lastRound: 0, shownOver: null, interSig: '', overlay: false,
    ffaCells: {}, dismissed: {}, notice: '', name: '', av: 0,
    online: false, via: '', local: false, viewer: -1, curtainFor: null, seats: null, seatCount: 4
  };

  function loadProfile() {
    var d = { name: 'PLAYER ' + RNG.int(10, 99), av: RNG.int(0, AVATARS.length - 1) };
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p.name === 'string') d.name = cleanName(p.name) || d.name;
        if (p && typeof p.av === 'number' && p.av >= 0 && p.av < AVATARS.length) d.av = p.av;
      }
    } catch (e) { /* storage blocked */ }
    C.name = d.name; C.av = d.av;
  }
  function saveProfile() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ name: C.name, av: C.av })); } catch (e) { /* ignore */ }
  }
  function cleanName(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12); }
  function randCode() { var s = ''; for (var i = 0; i < 5; i++) s += CODE_CHARS.charAt(RNG.int(0, CODE_CHARS.length - 1)); return s; }
  function myPeer(room) {
    var ps = (room || C.room).peers();
    for (var i = 0; i < ps.length; i++) if (ps[i].isMe && ps[i].sameTab) return ps[i].peer;
    return null;
  }
  function need() { return C.mode === 'duel' ? 2 : 4; }

  /* ---- connection ---- */
  function connect() {
    if (C.room) return Promise.resolve(C.room);
    if (!window.claude || typeof window.claude.use !== 'function') {
      // A plain website (GitHub Pages): rooms run through public relays (net.js).
      if (H.Net && H.Net.available()) {
        C.via = 'net';
        return H.Net.connect().then(function (room) { C.room = room || null; return C.room; }, function () { return null; });
      }
      C.via = 'file';
      return Promise.resolve(null);
    }
    C.via = 'claude';
    var timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 10000); });
    return Promise.race([window.claude.use('room'), timeout]).then(function (room) {
      C.room = room || null;
      return C.room;
    }, function () { return null; });
  }

  function openMulti() {
    FX.unlockAudio();
    loadProfile();
    UI.showScreen('multi');
    C.stage = 'connecting';
    renderMulti();
    connect().then(function (room) {
      C.online = !!room;
      C.stage = 'menu';
      renderMulti();
    });
  }

  function cleanupRooms() {
    C.unsubs.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } });
    C.unsubs = [];
    clearInterval(C.qTimer); C.qTimer = 0;
    if (C.queue) { C.queue.leave().catch(noop); C.queue = null; }
    if (C.match) { C.match.leave().catch(noop); C.match = null; }
    stopHost();
  }

  function resetMatchView() {
    C.S = null; C.gameId = null; C.lastN = 0; C.myIdx = -1; C.pending = null; C.outbox = [];
    C.log = []; C.logSeen = 0; C.answered = {}; C.askOpen = null; C.lastPhase = null; C.interSig = '';
    C.overlay = false; C.hostPeer = null; C.isHost = false; C.expect = null;
    C.local = false; C.viewer = -1; C.curtainFor = null; hideCurtain();
    clearInterval(C.uiTimer); C.uiTimer = 0;
    var stage = $('oppStage');
    if (stage) stage.classList.remove('ffa');
    if ($('mon5')) $('mon5').classList.remove('ffa-mode');
    var grid = $('ffaGrid');
    if (grid) grid.innerHTML = '';
    C.ffaCells = {};
  }

  function leaveAll(toTitle) {
    cleanupRooms();
    resetMatchView();
    UI.closeModal();
    UI.hideOverlay();
    C.stage = 'menu';
    if (toTitle) UI.showScreen('title');
    else { UI.showScreen('multi'); renderMulti(); }
  }

  /* ---- public matchmaking ---- */
  function findPublic() {
    cleanupRooms(); resetMatchView();
    C.kind = 'public';
    C.stage = 'queue';
    renderMulti();
    C.room.join('h21-q-' + C.mode).then(function (q) {
      C.queue = q;
      q.presence({ nm: C.name, av: C.av, q: now() }).catch(noop);
      C.unsubs.push(q.onPeers(function () { evaluateQueue(); }, function () { notice('Lost the matchmaking room. Try again.'); }));
      C.qTimer = setInterval(evaluateQueue, 1000);
    }, function (e) { notice(joinError(e)); });
  }

  function evaluateQueue() {
    var q = C.queue;
    if (!q || C.stage !== 'queue') return;
    var me = myPeer(q);
    if (!me) return;
    var peers = q.peers().filter(function (p) { return p.presence && typeof p.presence.q === 'number'; });
    // Has someone picked me for a table?
    for (var i = 0; i < peers.length; i++) {
      var pk = peers[i].presence.pk;
      if (pk && pk.c && pk.ps && pk.ps.indexOf(me) >= 0) { goMatch(pk.c, peers[i].peer, pk.ps, peers[i].peer === me); return; }
    }
    var picked = {};
    peers.forEach(function (p) { var pk = p.presence.pk; if (pk && pk.ps) pk.ps.forEach(function (x) { picked[x] = 1; }); });
    var free = peers.filter(function (p) { return !picked[p.peer]; }).sort(function (a, b) {
      return (a.presence.q - b.presence.q) || (a.peer < b.peer ? -1 : 1);
    });
    var waitEl = $('mpWaiting');
    if (waitEl) waitEl.textContent = Math.min(free.length, need()) + ' / ' + need() + ' PLAYERS';
    if (free.length >= need() && free[0].peer === me) {
      var ps = free.slice(0, need()).map(function (p) { return p.peer; });
      var code = randCode();
      q.presence({ pk: { c: code, ps: ps } }).catch(noop);
      goMatch(code, me, ps, true);
    }
  }

  function goMatch(code, hostPeer, ps, amHost) {
    if (C.stage !== 'queue') return;
    C.stage = amHost ? 'gathering' : 'waiting';
    C.code = code; C.hostPeer = hostPeer; C.isHost = amHost; C.expect = ps;
    C.gatherUntil = now() + M().gatherMs;
    renderMulti();
    joinMatchRoom('h21-m-' + code.toLowerCase(), amHost).then(function () {
      if (!amHost && C.queue) { C.queue.leave().catch(noop); C.queue = null; clearInterval(C.qTimer); }
    });
  }

  /* ---- private rooms ---- */
  function createPrivate() {
    cleanupRooms(); resetMatchView();
    C.kind = 'private';
    C.code = randCode();
    C.stage = 'lobby';
    C.isHost = true;
    renderMulti();
    joinMatchRoom('h21-p-' + C.code.toLowerCase(), true);
  }

  function joinPrivate(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) { notice('Room codes are 5 letters and numbers.'); return; }
    cleanupRooms(); resetMatchView();
    C.kind = 'private';
    C.code = code;
    C.stage = 'joining';
    C.isHost = false;
    C.joinWait = now() + 7000;
    renderMulti();
    joinMatchRoom('h21-p-' + code.toLowerCase(), false);
  }

  function joinMatchRoom(name, amHost) {
    return C.room.join(name).then(function (room) {
      C.match = room;
      var pres = { nm: C.name, av: C.av, j: now(), hs: amHost ? 1 : 0, md: C.mode };
      room.presence(pres).catch(noop);
      C.unsubs.push(room.onPeers(onMatchPeers, function () { notice('Lost connection to the room.'); }));
      if (!C.qTimer) C.qTimer = setInterval(lobbyTick, 1000);
      else { clearInterval(C.qTimer); C.qTimer = setInterval(lobbyTick, 1000); }
      renderMulti();
    }, function (e) { notice(joinError(e)); });
  }

  function joinError(e) {
    var code = e && e.code;
    if (code === 'limit_reached') return 'Too many rooms open right now. Try again in a moment.';
    if (code === 'not_permitted' || code === 'not_granted') return 'This page cannot join multiplayer rooms for your account.';
    return 'Could not reach the room. Check your connection and try again.';
  }

  function notice(msg) {
    C.notice = msg;
    if (C.stage !== 'match') { C.stage = 'menu'; cleanupRooms(); renderMulti(); }
    else UI.flashStatus(msg.toUpperCase());
  }

  function roomPeers() {
    if (!C.match) return [];
    return C.match.peers().filter(function (p) { return p.presence && typeof p.presence.j === 'number'; })
      .slice().sort(function (a, b) { return (a.presence.j - b.presence.j) || (a.peer < b.peer ? -1 : 1); });
  }

  function lobbyHostPeer() {
    var hs = roomPeers().filter(function (p) { return p.presence.hs; });
    return hs.length ? hs[0].peer : null;
  }

  function onMatchPeers(change) {
    if (!C.match) return;
    if (HOST) {
      change.left.forEach(function (p) { playerLeft(p.peer); });
      pollPeers(change.peers);
    }
    // Host left mid-match?
    if (C.S && C.hostPeer && C.S.phase !== 'over') {
      change.left.forEach(function (p) { if (p.peer === C.hostPeer && !C.isHost) hostGone(); });
    }
    if (!C.hostPeer && C.kind === 'private') {
      var hp = lobbyHostPeer();
      if (hp) { C.hostPeer = hp; if (C.stage === 'joining') C.stage = 'lobby'; }
    }
    // The host's table
    var host = null;
    change.peers.forEach(function (p) { if (p.peer === C.hostPeer) host = p; });
    if (host && host.presence && host.presence.g && !(host.isMe && host.sameTab)) onState(host.presence.g, false);
    if (C.kind === 'private' && host && host.presence && host.presence.md && !C.isHost) C.mode = host.presence.md;
    lobbyTick();
  }

  function lobbyTick() {
    if (C.stage === 'joining' && now() > C.joinWait && !C.hostPeer) {
      notice('No room found with code ' + C.code + '.');
      return;
    }
    if (C.stage === 'gathering' && C.match) {
      var present = roomPeers().map(function (p) { return p.peer; });
      var arrived = C.expect.filter(function (x) { return present.indexOf(x) >= 0; });
      var full = arrived.length === C.expect.length;
      var late = now() > C.gatherUntil;
      if (full || (late && arrived.length >= (C.mode === 'duel' ? 2 : 3))) startHosting(arrived);
      else if (late) { C.stage = 'menu'; findPublic(); return; }
    }
    if (C.stage === 'waiting' && C.match && now() > C.gatherUntil + 8000 && !C.S) {
      C.stage = 'menu'; findPublic(); return;
    }
    if (C.stage === 'lobby' || C.stage === 'joining' || C.stage === 'gathering' || C.stage === 'waiting') renderMulti();
    if (HOST) pollPeers();
  }

  function rosterFrom(peerList) {
    var map = {};
    roomPeers().forEach(function (p) { map[p.peer] = p; });
    return peerList.filter(function (pr) { return map[pr]; }).map(function (pr) {
      var pp = map[pr].presence;
      return { peer: pr, name: cleanName(pp.nm) || 'PLAYER', av: (typeof pp.av === 'number' && pp.av >= 0 && pp.av < AVATARS.length) ? pp.av : 0 };
    });
  }

  function startHosting(peerList) {
    if (!C.match) return;
    var me = myPeer(C.match);
    C.hostPeer = me;
    C.isHost = true;
    if (C.queue) { C.queue.leave().catch(noop); C.queue = null; }
    hostCreate(C.match, C.mode, rosterFrom(peerList));
  }

  function startPrivate() {
    var ps = roomPeers();
    var cap = C.mode === 'duel' ? 2 : 4;
    var min = C.mode === 'duel' ? 2 : 3;
    if (ps.length < min) return;
    startHosting(ps.slice(0, cap).map(function (p) { return p.peer; }));
  }

  function hostGone() {
    if (!C.S || C.S.phase === 'over') return;
    UI.closeModal();
    UI.hideOverlay();
    C.shownOver = C.gameId;
    UI.showResult({ kicker: 'MATCH ENDED', title: 'HOST LEFT', sub: 'The player running this table disconnected, so the match cannot continue.', portrait: 'conductor', btn: 'BACK', btn2: 'TITLE' }).then(function (w) {
      leaveAll(w === 2);
    });
  }

  /* ---- receiving the table ---- */
  function decode(w) {
    return {
      id: w.id, mode: w.m, phase: w.ph, round: w.rd, turn: w.tn, ds: w.ds, winner: w.w, seq: w.n,
      deadline: w.dl, revealUntil: w.ru, fx: w.fx, res: w.rs, log: w.lg || [],
      asks: (w.ak || []).map(function (a) { return { id: a[0], p: a[1], k: a[2], d: a[3], u: a[4] }; }),
      players: (w.P || []).map(function (q) {
        return {
          peer: q.pr, name: cleanName(q.nm) || 'PLAYER', av: q.av | 0, lives: q.lv, tokens: q.tk, left: !!q.lf,
          inventory: (q.iv || []).map(function (a) { return { uid: a[0], id: a[1], offer: a[2] || null }; }).filter(function (x) { return ITEMS[x.id]; }),
          hands: (q.h || []).map(function (a) { return { cards: decList(a[0]), stood: !!a[1], drawn: a[2] ? a[2].split(',') : [] }; }),
          initial: decList(q.in), prevInitial: q.pv ? decList(q.pv) : null,
          doubled: !!q.db, split: !!q.sp, itemsUsedThisRound: q.iu | 0, intel: { x: q.x || null, b: q.b || null },
          shop: q.sh || [], bought: q.bo | 0, ready: !!q.rd, ack: q.ac | 0, bn: q.bn || null
        };
      })
    };
  }

  function hostTime(t) { return t + C.offset; } // host clock -> local clock

  function onState(w, local) {
    if (!w || typeof w !== 'object' || !w.id) return;
    if (w.id === C.gameId && w.n <= C.lastN) return;
    var me = C.match ? myPeer(C.match) : null;
    var roster = (w.P || []).map(function (p) { return p.pr; });
    if (w.id !== C.gameId) {
      if (C.dismissed[w.id]) return;
      if (me && roster.indexOf(me) < 0) {
        if (C.stage === 'lobby' || C.stage === 'joining') { C.notice = 'A game is already running in this room.'; renderMulti(); }
        return;
      }
      if (w.ph === 'over') return;
      C.gameId = w.id; C.log = []; C.logSeen = 0; C.answered = {}; C.askOpen = null;
      C.lastPhase = null; C.interSig = ''; C.pending = null; C.outbox = []; C.ffaCells = {};
      var grid = $('ffaGrid'); if (grid) grid.innerHTML = '';
    }
    C.lastN = w.n;
    C.offset = local ? 0 : now() - w.hn;
    C.S = decode(w);
    if (C.local) {
      if (C.viewer < 0) { C.viewer = neededViewer(); if (C.viewer === null) C.viewer = 0; C.curtainFor = null; showCurtain(C.viewer); }
      C.myIdx = C.viewer;
    } else C.myIdx = me ? roster.indexOf(me) : -1;
    if (C.stage !== 'match') enterMatch();
    var mine = C.myIdx >= 0 ? C.S.players[C.myIdx] : null;
    // Acknowledged actions free the outbox.
    if (mine && C.pending && mine.ack >= C.pending.s) {
      C.pending = null;
      if (C.outbox.length) flushOutbox();
    }
    // Log
    C.S.log.forEach(function (e) {
      if (e.n <= C.logSeen) return;
      C.logSeen = e.n;
      var d = displayEntry(e);
      if (d) C.log.push(d);
    });
    if (C.log.length > 150) C.log.splice(0, C.log.length - 150);
    // Personal banner
    if (mine && mine.bn && mine.bn.n !== C.lastBanner) {
      C.lastBanner = mine.bn.n;
      UI.banner(mine.bn.t, mine.bn.g ? 'good' : 'bad');
      FX.sfx(mine.bn.g ? 'item' : 'error');
    }
    phaseEffects();
    render();
    if (C.local) localHandoff();
    if (C.curtainFor === null) handleAsks();
  }

  /* ---- same-screen play: who needs the screen, and the pass-over cover ---- */
  function neededViewer() {
    var S = C.S;
    if (!S) return null;
    if (S.asks.length) return S.asks[0].p;
    if (S.phase === 'play' && S.turn !== null && S.turn !== undefined) return S.turn;
    if (S.phase === 'inter') {
      var al = aliveIdx(S);
      for (var k = 0; k < al.length; k++) if (!S.players[al[k]].ready) return al[k];
    }
    return null;
  }
  function localHandoff() {
    var need = neededViewer();
    if (need === null) { if (C.curtainFor !== null) hideCurtain(); C.curtainFor = null; return; }
    if (need === C.viewer && C.curtainFor === null) return;
    if (need !== C.curtainFor) showCurtain(need);
  }
  function curtainReason(i) {
    var S = C.S, a = null;
    S.asks.forEach(function (x) { if (!a && x.p === i) a = x; });
    if (a) return a.k === 'rescue' ? 'YOU BUSTED · SAVE IT WITH AN ITEM?' : a.k === 'my' ? 'YOUR SEALED CARD' : a.k === 'dw' ? 'DEAD WEIGHT · PICK A CARD' : 'SOMEONE NEEDS AN ANSWER';
    if (S.phase === 'inter') return 'YOUR BREAK · SHOP, THEN READY';
    return 'YOUR TURN · ROUND ' + pad(S.round);
  }
  function showCurtain(i) {
    var S = C.S, p = S && S.players[i];
    if (!p) return;
    C.curtainFor = i;
    UI.closeModal();
    if (C.overlay) { UI.hideOverlay(); C.overlay = false; }
    C.askOpen = null;
    var el = $('passCurtain');
    el.querySelector('.pass-face').innerHTML = avatarSVG(p.av);
    el.querySelector('.pass-name').textContent = p.name;
    el.querySelector('.pass-why').textContent = curtainReason(i);
    el.querySelector('.pass-lives').textContent = livesText(p.lives) + '  ·  ' + p.tokens + (p.tokens === 1 ? ' TOKEN' : ' TOKENS');
    var go = el.querySelector('#passGo');
    go.textContent = "I'M " + p.name + ' · SHOW ME';
    go.disabled = true;
    el.hidden = false;
    // A short pause so the last player can't tap straight through.
    clearTimeout(C.curtainT);
    C.curtainT = setTimeout(function () { go.disabled = false; }, 700);
    FX.sfx('click');
  }
  function hideCurtain() {
    var el = $('passCurtain');
    if (el) el.hidden = true;
  }
  function revealForCurtain() {
    if (C.curtainFor === null || !C.S) return;
    var i = C.curtainFor;
    C.curtainFor = null;
    hideCurtain();
    if (i !== C.viewer) {
      C.viewer = i; C.myIdx = i;
      // Rebuild the log from this player's point of view.
      C.log = [];
      var src = HOST ? HOST.S.log : C.S.log;
      src.forEach(function (e) { var d = displayEntry(e); if (d) C.log.push(d); C.logSeen = Math.max(C.logSeen, e.n); });
      var mine = C.S.players[i];
      C.lastBanner = mine && mine.bn ? mine.bn.n : C.lastBanner;
      C.interSig = ''; C.askOpen = null; C.ffaCells = {};
      var grid = $('ffaGrid'); if (grid) grid.innerHTML = '';
      if (C.S.mode === 'duel') UI.setOpponent(oppDef(duelOpp()));
    }
    FX.staticBurst(250, 0.25);
    render();
    handleAsks();
  }
  function buildCurtain() {
    if ($('passCurtain')) return;
    var d = document.createElement('div');
    d.id = 'passCurtain';
    d.className = 'pass-curtain';
    d.hidden = true;
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.innerHTML = '<div class="pass-box"><div class="pass-kicker">SAME SCREEN · PASS THE DEVICE</div>' +
      '<div class="pass-face"></div><h2 class="pass-title">PASS TO <span class="pass-name"></span></h2>' +
      '<div class="pass-lives"></div><div class="pass-why"></div>' +
      '<p class="pass-note">Everyone else, look away. Cards and items stay hidden until you tap.</p>' +
      '<div class="pass-actions"><button class="key key-primary" id="passGo">SHOW ME</button><button class="key key-small" id="passMenu">MENU</button></div></div>';
    ($('app') || document.body).appendChild(d);
    d.querySelector('#passGo').addEventListener('click', function () { FX.unlockAudio(); revealForCurtain(); });
    d.querySelector('#passMenu').addEventListener('click', function () { FX.sfx('click'); onMenu(); });
  }

  function nameOf(i) {
    if (i === C.myIdx) return 'YOU';
    var p = C.S && C.S.players[i];
    return p ? p.name : '?';
  }
  function displayEntry(e) {
    var me = C.myIdx;
    var z = e.z ? String(e.z).replace('{T}', e.t !== null && e.t !== undefined ? nameOf(e.t) : 'THEM') : null;
    if (e.a === me && me >= 0 && e.x) return { who: 'player', text: e.x, kind: e.k };
    if (e.t === me && me >= 0 && e.y && e.a !== me) return { who: 'opp', text: nameOf(e.a) + ': ' + e.y, kind: e.k };
    if (!z) return null;
    if (e.a === null || e.a === undefined) return { who: 'sys', text: z, kind: e.k };
    if (e.a === me) return { who: 'player', text: z, kind: e.k };
    return { who: 'opp', text: nameOf(e.a) + ' ' + z, kind: e.k };
  }

  function enterMatch() {
    C.stage = 'match';
    UI.closeModal();
    UI.hideOverlay();
    UI.showScreen(null);
    var S = C.S;
    if (S.mode === 'duel') {
      $('oppStage').classList.remove('ffa');
      $('mon5').classList.remove('ffa-mode');
      var o = duelOpp();
      if (o >= 0) UI.setOpponent(oppDef(o));
    } else {
      UI.setOpponent({ id: 'ffa-' + S.id, name: 'FREE FOR ALL', alias: S.players.length + ' PLAYERS', look: AVATARS[0], traits: {}, lines: {} });
      $('oppStage').classList.add('ffa');
    }
    clearInterval(C.uiTimer);
    C.uiTimer = setInterval(function () {
      if (C.stage !== 'match' || !C.S) return;
      render();
      if (C.pending && now() - C.pendingAt > 6000) resend();
    }, 1000);
    FX.staticBurst(400, 0.3);
  }

  function duelOpp() {
    if (!C.S) return -1;
    for (var i = 0; i < C.S.players.length; i++) if (i !== C.myIdx) return i;
    return -1;
  }
  function oppDef(i) {
    var p = C.S.players[i];
    return { id: 'mp-' + C.S.id + '-' + i, name: p.name, alias: C.local ? 'SAME SCREEN' : 'ONLINE', personality: 'Human', look: AVATARS[p.av] || AVATARS[0], traits: {}, lines: {}, dossier: '', traitText: '' };
  }

  function phaseEffects() {
    var S = C.S, ph = S.phase;
    if (ph === C.lastPhase && S.round === C.lastRound) return;
    var prev = C.lastPhase;
    C.lastPhase = ph; C.lastRound = S.round;
    if (ph === 'play' && prev !== 'play') {
      UI.hideOverlay(); C.overlay = false; C.interSig = '';
      UI.banner('ROUND ' + pad(S.round));
      FX.sfx('deal');
    }
    if (ph === 'resolve' && S.res) roundBanner();
    if (ph === 'inter') { if (prev !== 'resolve' && S.res) roundBanner(); }
    if (ph === 'over' && C.shownOver !== S.id) showOver();
  }

  function roundBanner() {
    var r = C.S.res, me = C.myIdx;
    if (!r) return;
    var lostMine = 0;
    r.l.forEach(function (x) { if (x[0] === me) lostMine = x[1]; });
    var lostAny = r.l.some(function (x) { return x[0] === me; });
    if (r.w.indexOf(me) >= 0) { UI.banner('ROUND WON', 'good'); FX.sfx('win'); }
    else if (lostAny) { UI.banner(lostMine ? 'ROUND LOST' : 'TOURNIQUET HELD', 'bad'); if (lostMine) UI.lifeFlash('player'); }
    else UI.banner(r.w.length ? 'SAFE' : 'DRAW');
    if (C.S.mode === 'duel') {
      var o = duelOpp();
      if (r.w.indexOf(o) >= 0) UI.setExpression('celebrate');
      else if (r.l.some(function (x) { return x[0] === o; })) UI.setExpression('hurt');
      else UI.setExpression('thinking');
    }
  }

  function showOver() {
    var S = C.S, me = C.myIdx;
    C.shownOver = S.id;
    UI.closeModal(); UI.hideOverlay();
    FX.staticBurst(900, 0.45);
    var won = S.winner === me && me >= 0;
    var title = S.winner === null ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT');
    if (C.local) {
      hideCurtain(); C.curtainFor = null;
      setTimeout(function () {
        UI.showResult({
          kicker: 'SAME SCREEN · ' + (S.mode === 'duel' ? '1V1' : S.players.length + ' PLAYERS') + ' · ' + S.round + ' ROUNDS',
          title: S.winner === null ? 'DRAW' : S.players[S.winner].name + ' WINS',
          sub: S.winner === null ? 'Nobody walked away from this table.' : 'Last one standing out of ' + S.players.length + '.',
          portrait: 'conductor', btn: 'PLAY AGAIN', btn2: 'TITLE'
        }).then(function (w) {
          stopHost(); resetMatchView();
          if (w === 2) { C.stage = 'menu'; UI.showScreen('title'); return; }
          C.stage = 'local'; UI.showScreen('multi'); renderMulti();
        });
      }, 1400);
      return;
    }
    var sub = S.winner === null ? 'Nobody walked away from this table.'
      : won ? (S.mode === 'duel' ? 'You took every one of their lives.' : 'Last one standing out of ' + S.players.length + '.')
        : (S.players[S.winner].name + ' outlasted you.');
    setTimeout(function () {
      UI.showResult({
        kicker: 'ONLINE · ' + (S.mode === 'duel' ? '1V1' : 'FREE FOR ALL') + ' · ' + S.round + ' ROUNDS',
        title: title, sub: sub, portrait: 'conductor',
        btn: C.kind === 'private' ? 'BACK TO ROOM' : 'FIND ANOTHER', btn2: 'LEAVE'
      }).then(function (w) {
        C.dismissed[S.id] = 1;
        if (w === 2) { leaveAll(true); return; }
        if (C.kind === 'private') {
          var keepHost = C.isHost;
          stopHost();
          resetMatchView();
          C.isHost = keepHost;
          C.hostPeer = keepHost ? myPeer(C.match) : lobbyHostPeer();
          C.stage = 'lobby';
          UI.showScreen('multi');
          renderMulti();
        } else {
          findPublic();
          UI.showScreen('multi');
        }
      });
    }, 1400);
  }

  /* ---- sending actions ---- */
  function sendAct(act) {
    if (!C.S || C.myIdx < 0) return;
    act.gid = C.S.id;
    if (HOST && C.isHost) {
      if (act.t === 'ans') answer(C.myIdx, act.k, act.v);
      else enqueue(C.myIdx, act);
      return;
    }
    C.seq += 1;
    act.s = C.seq;
    if (C.pending) { C.outbox.push(act); return; }
    C.pending = act; C.pendingAt = now();
    C.match.presence({ a: act }).catch(noop);
    render();
  }
  function flushOutbox() {
    var nx = C.outbox.shift();
    if (!nx) return;
    C.pending = nx; C.pendingAt = now();
    C.match.presence({ a: nx }).catch(noop);
  }
  function resend() {
    if (!C.pending || !C.match) return;
    C.pending.r = (C.pending.r || 0) + 1;
    C.pendingAt = now();
    C.match.presence({ a: C.pending }).catch(noop);
  }

  /* ---- prompts from the host ---- */
  function handleAsks() {
    var S = C.S, me = C.myIdx;
    if (!S || me < 0) return;
    var mineAsks = S.asks.filter(function (a) { return a.p === me; });
    if (C.askOpen && !mineAsks.some(function (a) { return a.id === C.askOpen; })) { C.askOpen = null; UI.closeModal(); }
    if (C.askOpen) return;
    var a = mineAsks.filter(function (x) { return !C.answered[x.id]; })[0];
    if (!a) return;
    C.askOpen = a.id;
    UI.closeModal();
    var p = S.players[me];
    var reply = function (v) {
      if (C.answered[a.id]) return;
      C.answered[a.id] = 1;
      if (C.askOpen === a.id) C.askOpen = null;
      sendAct({ t: 'ans', k: a.id, v: v === undefined ? null : v });
    };
    if (a.k === 'dw') {
      UI.chooseDeadWeight((a.d || []).map(dec)).then(function (v) { if (v === null || v === undefined) return; reply(v === 1 ? 1 : 0); });
    } else if (a.k === 'gb') {
      var invs = p.inventory.filter(function (x) { return (a.d || []).indexOf(x.uid) >= 0; });
      UI.chooseGiveBack(invs).then(function (uid) { if (uid) reply(uid); });
    } else if (a.k === 'my') {
      UI.chooseMystery(a.d).then(function (keep) { if (C.askOpen === a.id || !C.answered[a.id]) reply(keep === true); });
    } else if (a.k === 'rescue') {
      var opts = p.inventory.filter(function (x) { return (a.d && a.d.o || []).indexOf(x.uid) >= 0; });
      UI.rescuePrompt(a.d && a.d.t, opts).then(function (uid) {
        if (C.answered[a.id]) return;
        if (!uid) { reply(null); return; }
        var it = ITEMS[(findInv(p, uid) || {}).id];
        if (!it) { reply(null); return; }
        gather(it, uid, 'rescue', opponentsOf(S, me)[0]).then(function (g) {
          if (!g) { reply(null); return; }
          reply({ u: uid, p: g.params });
        });
      });
    }
  }

  /* ---- choosing item parameters (and a target, in a free-for-all) ---- */
  function chooseTarget(id, win, prompt) {
    var S = C.S, me = C.myIdx;
    var opps = opponentsOf(S, me);
    if (opps.length <= 1) return Promise.resolve(opps.length ? opps[0] : null);
    var uidOk = function (t) {
      var it = ITEMS[id];
      if (immune(S, t) && it.hostile) return { ok: true, reason: 'FLU SHOT · IT WILL BOUNCE' };
      return it.canUse(makeE(S, me, t, READONLY), 'player', win);
    };
    return UI.modal({
      title: (prompt || ITEMS[id].name) + ' — choose a target', tag: 'WHO?', dismiss: null,
      html: '<div class="item-list">' + opps.map(function (t) {
        var p = S.players[t], r = uidOk(t);
        return '<button class="irow pickable target-row" data-pick="' + t + '"' + (r.ok ? '' : ' disabled') + '>' +
          '<div class="target-face">' + Face.build(AVATARS[p.av] || AVATARS[0]) + '</div>' +
          '<div class="irow-text"><b>' + esc(p.name) + '</b><span>' + livesText(p.lives) + ' · ' + cardCount(p) + ' CARDS · ' + p.inventory.length + ' ITEMS</span>' +
          (r.ok ? (r.reason ? '<i class="no">' + esc(r.reason) + '</i>' : '') : '<i class="no">' + esc(r.reason) + '</i>') + '</div></button>';
      }).join('') + '</div>',
      buttons: [{ label: 'CANCEL', value: null }],
      onMount: function (root, close) {
        root.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () { if (!b.disabled) { FX.sfx('click'); close(parseInt(b.getAttribute('data-pick'), 10)); } });
        });
      }
    });
  }

  function gather(it, uid, win, target) {
    var S = C.S, me = C.myIdx, p = S.players[me];
    if (!it.ask) return Promise.resolve({ params: {}, target: target });
    if (it.ask === 'card') {
      var h = focusHand(p);
      var cards = h.cards.filter(function (c) { return !c.mystery && (it.cardFilter ? it.cardFilter(c) : true); });
      return UI.chooseCard(cards, it.askTitle).then(function (u) { return u ? { params: { cardUid: u }, target: target } : null; });
    }
    if (it.ask === 'value') {
      return UI.chooseValue(it.askMin || 1, it.askMax || 5, it.askTitle, it.askText).then(function (v) { return v ? { params: { value: v }, target: target } : null; });
    }
    if (it.ask === 'item') {
      var others = p.inventory.filter(function (x) { return x.uid !== uid; });
      return UI.chooseItem(others, it.askTitle, it.id).then(function (u) { return u ? { params: { itemUid: u }, target: target } : null; });
    }
    if (it.ask === 'pandora') {
      var box = findInv(p, uid);
      var offer = (box && box.offer) || [];
      var opts = offer.map(function (id) {
        var inner = ITEMS[id];
        var ok = inner.windows.indexOf(win) >= 0;
        var r = ok ? { ok: false, reason: 'NO VALID TARGET' } : { ok: false, reason: win === 'between' ? 'ONLY DURING A HAND' : 'ONLY BETWEEN ROUNDS' };
        if (ok) {
          var ts = TARGETED.indexOf(id) >= 0 ? opponentsOf(S, me) : [opponentsOf(S, me)[0]];
          for (var k = 0; k < ts.length; k++) {
            if (ts[k] === undefined) continue;
            r = inner.canUse(makeE(S, me, ts[k], READONLY), 'player', win);
            if (r.ok) break;
          }
        }
        return { id: id, item: inner, ok: r.ok, reason: r.reason };
      });
      return UI.choosePandora(opts, it.askTitle).then(function (id) {
        if (!id) return null;
        var inner = ITEMS[id];
        var tp = TARGETED.indexOf(id) >= 0 ? chooseTarget(id, win) : Promise.resolve(target);
        return tp.then(function (t2) {
          if (t2 === null || t2 === undefined) return null;
          return gather(inner, uid, win, t2).then(function (g) {
            return g ? { params: { choice: id, inner: g.params }, target: t2 } : null;
          });
        });
      });
    }
    return Promise.resolve({ params: {}, target: target });
  }

  function windowNow() {
    var S = C.S, me = C.myIdx;
    if (!S || me < 0 || !alive(S.players[me])) return null;
    if (S.phase === 'inter') return 'between';
    if (S.phase === 'play' && S.turn === me && !isDone(S.players[me])) return 'turn';
    return null;
  }

  function useFlow(uid) {
    var S = C.S, me = C.myIdx, win = windowNow();
    if (!S || me < 0) return;
    if (!win || C.pending) { UI.flashStatus('NOT RIGHT NOW'); return; }
    var p = S.players[me], inv = findInv(p, uid);
    if (!inv) return;
    var it = ITEMS[inv.id];
    var chk = mpCanUse(S, me, uid, win, null);
    if (!chk.ok) { UI.flashStatus(chk.reason); FX.sfx('error'); return; }
    var tp = TARGETED.indexOf(inv.id) >= 0 ? chooseTarget(inv.id, win) : Promise.resolve(opponentsOf(S, me)[0]);
    tp.then(function (t) {
      if (t === null || t === undefined) return;
      if (TARGETED.indexOf(inv.id) >= 0) {
        var c2 = mpCanUse(C.S, me, uid, win, t);
        if (!c2.ok) { UI.flashStatus(c2.reason); return; }
      }
      return gather(it, uid, win, t).then(function (g) {
        if (!g || windowNow() !== win) return;
        sendAct({ t: 'item', u: uid, p: g.params, g: g.target });
      });
    });
  }

  /* ======================================================================
     5. RENDERING THE TABLE
     ====================================================================== */
  function livesText(n) { var s = ''; for (var i = 0; i < n; i++) s += '♥'; return s || '—'; }
  function secs(t) { return Math.max(0, Math.ceil((hostTime(t) - now()) / 1000)); }
  function cd(t) { return C.local ? '' : ' · ' + secs(t) + 's'; }

  function myInventoryView() {
    var S = C.S, me = C.myIdx, p = S.players[me];
    var win = windowNow();
    return p.inventory.map(function (inv) {
      var it = ITEMS[inv.id];
      var chk = win ? mpCanUse(S, me, inv.uid, win, null) : { ok: false, reason: S.phase === 'play' ? 'ONLY ON YOUR TURN' : 'NOT RIGHT NOW' };
      if (C.pending) chk = { ok: false, reason: 'SENDING…' };
      return { uid: inv.uid, id: inv.id, item: it, usable: chk.ok, reason: chk.reason };
    });
  }

  function handsView(p) {
    return p.hands.map(function (h) {
      var hv = Cards.handValue(h.cards);
      return {
        cards: h.cards, mystery: h.cards.filter(function (c) { return c.mystery; }).length,
        total: hv.total, soft: hv.soft, bust: hv.total > 21, stood: h.stood, natural: isNatural(p)
      };
    });
  }

  function buildView() {
    var S = C.S, me = C.myIdx, spectating = me < 0;
    var p = spectating ? S.players[0] : S.players[me];
    var myTurn = !spectating && S.phase === 'play' && S.turn === me && alive(p) && !isDone(p) && !C.pending &&
      !S.asks.some(function (a) { return a.p === me; });
    var acts = myTurn ? availableActions(S, me, true) : [];
    var sh = S.fx.sh[me];
    function btn(a) { var lock = sh === a; return { enabled: myTurn && acts.indexOf(a) >= 0 && !lock, shackled: lock }; }
    var inv = spectating ? [] : myInventoryView();
    var turnName = S.turn !== null && S.turn !== undefined ? nameOf(S.turn) : '';

    var status = 'STANDBY', turnTag = '—';
    if (!alive(p)) { status = 'ELIMINATED · SPECTATING'; turnTag = 'OUT'; }
    else if (S.phase === 'play') {
      if (S.asks.some(function (a) { return a.p === me; })) { status = 'ANSWER THE PROMPT'; turnTag = 'YOU'; }
      else if (myTurn) { status = (C.local ? p.name + ' · ' : '') + 'YOUR TURN' + cd(S.deadline); turnTag = 'YOU'; }
      else if (C.pending) { status = 'SENDING…'; turnTag = 'YOU'; }
      else if (isDone(p)) { status = 'YOU ARE DONE · ' + turnName + ' PLAYING'; turnTag = turnName; }
      else { status = turnName + ' IS DECIDING' + cd(S.deadline); turnTag = turnName; }
    } else if (S.phase === 'resolve') { status = S.asks.length ? 'WAITING FOR SEALED CARDS' : 'RESOLVING ROUND'; turnTag = 'REVEAL'; }
    else if (S.phase === 'inter') {
      var al = aliveIdx(S), rdy = al.filter(function (j) { return S.players[j].ready; }).length;
      status = 'INTERMISSION' + cd(S.deadline) + ' · ' + rdy + '/' + al.length + ' READY'; turnTag = 'BREAK';
    } else if (S.phase === 'over') { status = 'MATCH OVER'; turnTag = 'END'; }

    var effects = [];
    if (!spectating) {
      if (S.fx.tq[me]) effects.push({ t: 'TOURNIQUET ACTIVE · BLOCKS 1 LIFE', k: 'good' });
      if (S.fx.tqn[me]) effects.push({ t: 'TOURNIQUET READY FOR NEXT ROUND', k: 'good' });
      if (immune(S, me)) effects.push({ t: 'FLU SHOT · IMMUNE ' + S.fx.flu[me] + (S.fx.flu[me] > 1 ? ' ROUNDS' : ' ROUND'), k: 'good' });
      if (S.fx.hs[me]) effects.push({ t: 'HAND SAW ON YOU · BUST COSTS 2', k: 'bad' });
      if (S.fx.rp[me]) effects.push({ t: 'RAT POISON ON YOU · NEXT ITEM COSTS 1', k: 'bad' });
      if (sh) effects.push({ t: 'YOUR ' + ACTION_NAMES[sh] + ' IS SHACKLED', k: 'bad' });
      if (S.fx.cl[me]) effects.push({ t: 'YOUR ITEMS ARE CLAMPED', k: 'bad' });
    }
    S.players.forEach(function (q, j) {
      if (j === me || !alive(q)) return;
      if (S.fx.hs[j]) effects.push({ t: 'HAND SAW ON ' + q.name, k: 'good' });
      if (S.fx.rp[j]) effects.push({ t: 'RAT POISON ON ' + q.name, k: 'good' });
      if (S.fx.sh[j]) effects.push({ t: q.name + ' ' + ACTION_NAMES[S.fx.sh[j]] + ' LOCKED', k: 'good' });
      if (S.fx.cl[j]) effects.push({ t: q.name + ' ITEMS CLAMPED', k: 'good' });
    });
    if (S.players.some(function (q) { return q.doubled; }) && S.phase === 'play') effects.push({ t: 'STAKES DOUBLED · LOSERS LOSE 2', k: 'warn' });

    var hands = spectating ? [] : handsView(p);
    var reveal = S.phase === 'resolve' || S.phase === 'inter' || S.phase === 'over';
    var oppView, livesOpp, footer = null;
    if (S.mode === 'duel') {
      var oi = duelOpp(), o = S.players[oi];
      var xr = p.intel.x && p.intel.x.t === oi && hostTime(p.intel.x.u) > now() ? decList(p.intel.x.c) : null;
      var bn = p.intel.b && p.intel.b.t === oi ? p.intel.b.r + ' 15' + (p.intel.b.n !== cardCount(o) ? ' (STALE)' : '') : null;
      var ost = !alive(o) ? 'OUT' : S.phase === 'play' ? (allBusted(o) ? 'BUSTED' : isDone(o) ? 'STANDING' : S.turn === oi ? 'THINKING' : 'WAITING') : reveal ? 'REVEALED' : 'WAITING';
      oppView = {
        def: oppDef(oi), hands: o.hands.map(function (h) { return { count: h.cards.length, cards: h.cards, total: total(h), bust: total(h) > 21, stood: h.stood }; }),
        reveal: reveal, xray: xr, status: ost, shackled: S.fx.sh[oi] ? ACTION_NAMES[S.fx.sh[oi]] : null, burner: bn,
        cardCount: cardCount(o), itemCount: o.inventory.length, rage: 0, startLives: M().startLives, twins: false, doubled: o.doubled, split: o.split
      };
      livesOpp = o.lives;
    } else {
      oppView = { def: { id: 'ffa-' + S.id, name: 'FREE FOR ALL', alias: '', look: AVATARS[0], traits: {}, lines: {} }, hands: [], reveal: false, xray: null, status: '', shackled: null, burner: null, cardCount: 0, itemCount: 0, rage: 0, startLives: M().startLives, twins: false, doubled: false, split: false };
      livesOpp = aliveIdx(S).length;
      footer = S.players.map(function (q, j) {
        return '<span class="' + (alive(q) ? '' : 'dim') + '"><b>' + esc(j === me ? 'YOU' : q.name) + '</b> <em class="red">' + (alive(q) ? livesText(q.lives) : 'OUT') + '</em></span>';
      }).join('') + '<span><b>DECK</b> ' + deckSize(S) + '</span>';
    }

    var primary = null, primaryBusy = false;
    if (S.phase === 'inter' && alive(p) && !spectating) {
      primary = p.ready ? 'WAITING FOR OTHERS…' : 'READY ▸';
      primaryBusy = p.ready || !!C.pending;
    }

    return {
      phase: S.phase === 'inter' ? 'intermission' : S.phase,
      round: S.round, match: 1, matches: 1, matchLabel: (C.local ? 'LOCAL ' : 'ONLINE ') + (S.mode === 'duel' ? '1V1' : 'FFA'),
      maxLives: M().maxLives, startingLives: M().startLives,
      lives: { player: spectating ? 0 : p.lives, opp: livesOpp },
      tokens: spectating ? 0 : p.tokens, effects: effects, inventory: inv, invMax: M().inventoryMax,
      hands: hands,
      activeHand: !spectating && p.split && S.phase === 'play' && !isDone(p) ? focusIndex(p) : -1,
      split: !spectating && p.split, doubled: !spectating && p.doubled,
      buttons: {
        hit: btn('hit'), stand: { enabled: myTurn, shackled: false }, double: btn('double'), split: btn('split'),
        item: { enabled: myTurn && inv.some(function (x) { return x.usable; }) && sh !== 'item', shackled: sh === 'item' }
      },
      primary: primary, primaryBusy: primaryBusy, status: status, turnTag: turnTag, myTurn: myTurn,
      opp: oppView, log: C.log, footer: footer, logStatus: S.mode === 'duel' ? null : aliveIdx(S).length + ' STANDING',
      dread: !spectating && alive(p) && p.lives <= 1 ? 1 : (!spectating && p.lives === 2 ? 0.5 : 0)
    };
  }

  function render() {
    if (!C.S || C.stage !== 'match') return;
    var v = buildView();
    UI.render(v);
    var S = C.S;
    if (S.mode === 'duel') {
      var oi = duelOpp(), o = S.players[oi];
      $('oppName').textContent = o.name + (C.local ? '' : ' · ONLINE') + (o.left ? ' · LEFT' : '');
      if (!alive(o)) UI.oppEliminated();
    } else {
      $('oppName').textContent = 'FREE FOR ALL · ' + aliveIdx(S).length + ' OF ' + S.players.length + ' STANDING';
      $('oppLivesTop').innerHTML = '';
      renderFFA();
    }
    if (S.phase === 'inter') renderInter();
  }

  function renderFFA() {
    var S = C.S, me = C.myIdx;
    var stage = $('oppStage');
    stage.classList.add('ffa');
    $('mon5').classList.add('ffa-mode');
    var grid = $('ffaGrid');
    if (!grid) { grid = document.createElement('div'); grid.id = 'ffaGrid'; grid.className = 'ffa-grid'; stage.appendChild(grid); }
    var others = [];
    S.players.forEach(function (q, j) { if (j !== me) others.push(j); });
    grid.className = 'ffa-grid n' + others.length;
    var reveal = S.phase === 'resolve' || S.phase === 'inter' || S.phase === 'over';
    var mine = me >= 0 ? S.players[me] : null;
    others.forEach(function (j) {
      var q = S.players[j];
      var cell = C.ffaCells[q.peer];
      if (!cell || !grid.contains(cell.el)) {
        var d = document.createElement('div');
        d.className = 'ffa-cell';
        d.innerHTML = '<div class="ffa-face">' + Face.build(AVATARS[q.av] || AVATARS[0]) + '</div><div class="ffa-info"></div>';
        grid.appendChild(d);
        cell = C.ffaCells[q.peer] = { el: d, svg: d.querySelector('svg'), info: d.querySelector('.ffa-info'), expr: '' };
      }
      var xr = mine && mine.intel.x && mine.intel.x.t === j && hostTime(mine.intel.x.u) > now() ? decList(mine.intel.x.c) : null;
      var cards = q.hands.map(function (h, hi) {
        var inner = '';
        h.cards.forEach(function (c) {
          var x = null;
          if (xr) xr.forEach(function (y) { if (y.uid === c.uid) x = y; });
          if (reveal) inner += miniCard(c, '');
          else if (x) inner += miniCard(x, ' xr');
          else inner += '<span class="mc back"></span>';
        });
        return '<span class="ffa-hand' + (reveal && total(h) > 21 ? ' busted' : '') + '">' + inner + (reveal ? '<em>' + total(h) + '</em>' : '') + (q.hands.length > 1 ? '<sub>H' + (hi + 1) + '</sub>' : '') + '</span>';
      }).join('');
      var st = !alive(q) ? (q.left ? 'LEFT' : 'OUT') : S.phase === 'play' ? (allBusted(q) ? 'BUST' : isDone(q) ? 'STOOD' : S.turn === j ? 'TURN' + cd(S.deadline) : '') : reveal ? '' : '';
      if (S.phase === 'inter' && alive(q)) st = q.ready ? 'READY' : 'SHOPPING';
      var bn = mine && mine.intel.b && mine.intel.b.t === j ? '<span class="ffa-intel">BURNER: ' + mine.intel.b.r + ' 15' + (mine.intel.b.n !== cardCount(q) ? ' (STALE)' : '') + '</span>' : '';
      var flags = (S.fx.sh[j] ? ' <b class="red">⛓</b>' : '') + (S.fx.cl[j] ? ' <b class="red">CLAMPED</b>' : '') + (immune(S, j) ? ' <b class="amber">IMMUNE</b>' : '') + (q.doubled ? ' <b class="amber">×2</b>' : '');
      cell.el.className = 'ffa-cell' + (S.turn === j && S.phase === 'play' ? ' turn' : '') + (alive(q) ? '' : ' out');
      cell.info.innerHTML =
        '<div class="ffa-name">' + esc(q.name) + flags + '</div>' +
        '<div class="ffa-lives">' + (alive(q) ? '<span class="red">' + livesText(q.lives) + '</span>' : 'ELIMINATED') + ' <span class="dim">· ' + q.inventory.length + ' ITEMS</span></div>' +
        '<div class="ffa-cards">' + (cards || '<span class="dim">—</span>') + '</div>' +
        '<div class="ffa-status">' + esc(st) + '</div>' + bn;
      var expr = !alive(q) ? 'dead' : 'neutral';
      if (S.res && reveal && alive(q)) {
        if (S.res.w.indexOf(j) >= 0) expr = 'celebrate';
        else if (S.res.l.some(function (x) { return x[0] === j; })) expr = 'hurt';
      } else if (S.phase === 'play' && allBusted(q)) expr = 'frustrated';
      else if (S.phase === 'play' && S.turn === j) expr = 'thinking';
      if (expr !== cell.expr) { cell.expr = expr; Face.apply(cell.svg, expr); }
    });
  }

  function miniCard(c, extra) {
    var v = c.wild ? c.mod : Cards.rankLabel(c);
    var cls = 'mc' + (c.red ? ' red' : '') + (c.wild ? ' wild' : '') + (extra || '');
    return '<span class="' + cls + '">' + esc(String(v)) + '<i>' + (c.wild ? '✱' : c.sym) + '</i></span>';
  }

  function renderInter() {
    var S = C.S, me = C.myIdx;
    if (me < 0 || !alive(S.players[me])) { if (C.overlay) { UI.hideOverlay(); C.overlay = false; } return; }
    var p = S.players[me], r = S.res || { w: [], l: [], s: [], why: '' };
    var sig = [me, S.round, p.tokens, p.inventory.length, p.bought, (p.shop || []).join('|'), p.ready ? 1 : 0].join(';');
    if (sig === C.interSig && C.overlay) return;
    C.interSig = sig;
    var won = r.w.indexOf(me) >= 0, lostEntry = null;
    r.l.forEach(function (x) { if (x[0] === me) lostEntry = x; });
    var head = won ? 'ROUND WON' : lostEntry ? 'ROUND LOST' : (r.w.length ? 'SAFE THIS ROUND' : 'DRAW');
    var myLabel = '';
    r.s.forEach(function (x) { if (x[0] === me) myLabel = x[1]; });
    var oppHands = [];
    S.players.forEach(function (q, j) { if (j !== me && q.hands.length) q.hands.forEach(function (h) { oppHands.push(h.cards); }); });
    var fake = {
      round: S.round, tokens: p.tokens, player: { inventory: p.inventory },
      shop: { items: p.shop || [], bought: p.bought },
      lastResult: {
        head: head, why: r.why, winner: won ? 'player' : lostEntry ? 'opp' : null,
        applied: lostEntry ? lostEntry[1] : 0, tokens: won ? M().tokensPerWin : 0,
        pT: myLabel, pB: myLabel === 'BUST', oppHands: oppHands,
        line: won ? '+' + M().tokensPerWin + ' TOKEN' : lostEntry ? (lostEntry[1] ? 'YOU LOST ' + lostEntry[1] + (lostEntry[1] > 1 ? ' LIVES' : ' LIFE') : 'TOURNIQUET HELD') : 'NO LIVES LOST'
      }
    };
    UI.showIntermission(fake);
    C.overlay = true;
    var nextBtn = document.querySelector('#m5Overlay [data-overlay="next"]');
    if (nextBtn) { nextBtn.textContent = p.ready ? 'WAITING FOR OTHERS…' : 'READY ▸'; nextBtn.disabled = p.ready; }
  }

  /* ======================================================================
     6. INPUT (routed here by game.js while a match is on)
     ====================================================================== */
  function active() { return C.stage === 'match' && !!C.S; }

  function covered() { return C.local && C.curtainFor !== null; }
  function onAction(kind) {
    FX.unlockAudio();
    if (covered()) return;
    var v = buildView();
    if (!v.myTurn) return;
    if (kind === 'item') { onInspect(null); return; }
    if (kind !== 'stand' && !(v.buttons[kind] && v.buttons[kind].enabled)) { FX.sfx('error'); return; }
    FX.sfx(kind === 'stand' ? 'click' : 'deal');
    sendAct({ t: kind });
  }

  function onPrimary() {
    if (covered()) return;
    var S = C.S, me = C.myIdx;
    if (!S || me < 0) return;
    if (S.phase === 'inter' && !S.players[me].ready) sendAct({ t: 'ready' });
  }

  function onInspect(uid) {
    if (!C.S || C.myIdx < 0 || covered()) return;
    UI.openInventory(myInventoryView(), function (u) { useFlow(u); }, uid);
  }

  function onBuy(i) {
    var S = C.S, me = C.myIdx;
    if (!S || me < 0 || S.phase !== 'inter' || covered()) return;
    var p = S.players[me];
    if (p.bought >= 1) { UI.flashStatus('ONE PURCHASE PER BREAK'); return; }
    if (p.tokens < M().shopPrice) { UI.flashStatus('NOT ENOUGH TOKENS'); FX.sfx('error'); return; }
    if (p.inventory.length >= M().inventoryMax) { UI.flashStatus('INVENTORY FULL'); FX.sfx('error'); return; }
    FX.sfx('item');
    sendAct({ t: 'buy', i: i });
  }

  function onMenu() {
    UI.modal({
      title: 'MENU', cls: 'menu', dismiss: null,
      html: '<p class="modal-text dim">' + (C.local ? 'Same-screen match. Leaving ends it for everyone at this table.' : 'Online match. Leaving counts as being eliminated' + (C.isHost ? ', and because you are hosting, it ends the match for everyone.' : '.')) + '</p>',
      buttons: [
        { label: 'RESUME', value: null, isDefault: true },
        { label: 'HOW TO PLAY', value: 'how' },
        { label: 'SOUND: ' + (FX.settings.sound ? 'ON' : 'OFF'), value: 'sound' },
        { label: 'LEAVE MATCH', value: 'leave', cls: 'key-danger' }
      ]
    }).then(function (v) {
      if (v === 'sound') { FX.setSound(!FX.settings.sound); onMenu(); }
      else if (v === 'how') UI.showInfo('how', function () { UI.showScreen(null); });
      else if (v === 'leave') UI.confirm('LEAVE THE MATCH?', C.local ? 'The match ends for everyone.' : 'You will be eliminated from this table.', 'LEAVE').then(function (y) { if (y) leaveAll(true); });
    });
  }

  function onKey(ev) {
    var k = (ev.key || '').toLowerCase();
    if (k === 'escape') { onMenu(); ev.preventDefault(); return; }
    if (covered()) return;
    if (k === 'enter') { onPrimary(); return; }
    if (k === 'h') onAction('hit');
    else if (k === 's') onAction('stand');
    else if (k === 'd') onAction('double');
    else if (k === 'p') onAction('split');
    else if (k === 'i') onInspect(null);
    else if (/^[1-5]$/.test(k) && C.S && C.myIdx >= 0) {
      var inv = C.S.players[C.myIdx].inventory[parseInt(k, 10) - 1];
      if (inv) onInspect(inv.uid);
    }
  }

  /* ======================================================================
     7. MULTIPLAYER SCREENS (menu, searching, lobby)
     ====================================================================== */
  function avatarSVG(av) { return Face.build(AVATARS[av] || AVATARS[0]); }

  function renderMulti() {
    var body = $('multiBody');
    if (!body) return;
    var html = '';
    var note = C.notice ? '<p class="mp-notice" role="alert">' + esc(C.notice) + '</p>' : '';
    if (C.stage === 'connecting') {
      html = '<h2 class="mp-title">MULTIPLAYER</h2><p class="mp-sub blink">CONNECTING…</p>';
    } else if (C.stage === 'unavailable') {
      html = '<h2 class="mp-title">MULTIPLAYER</h2>' +
        '<div class="mp-card mp-off"><h3>ONLINE NOT AVAILABLE IN THIS COPY</h3>' +
        '<p>Online matches need the website version of House of 21.</p>' +
        '<p>This copy still plays the full single-player tournament offline.</p></div>' +
        '<div class="mp-actions"><button class="key" data-mp="back">BACK</button></div>';
    } else if (C.stage === 'menu') {
      var off = C.online ? '' : ' disabled';
      html = '<h2 class="mp-title">MULTIPLAYER</h2>' + note +
        '<div class="mp-grid">' +
          '<section class="mp-card mp-you"><h3>YOU</h3>' +
            '<div class="mp-avatar"><button class="key key-small" data-mp="av-prev" aria-label="Previous look">◀</button><div class="mp-face">' + avatarSVG(C.av) + '</div><button class="key key-small" data-mp="av-next" aria-label="Next look">▶</button></div>' +
            '<label class="mp-label" for="mpName">NAME</label><input id="mpName" class="mp-input" maxlength="12" autocomplete="off" spellcheck="false" value="' + esc(C.name) + '">' +
          '</section>' +
          '<section class="mp-card"><h3>MODE</h3>' +
            '<div class="mp-modes">' +
              '<button class="key mp-mode' + (C.mode === 'duel' ? ' on' : '') + '" data-mp="mode-duel" aria-pressed="' + (C.mode === 'duel') + '">1V1</button>' +
              '<button class="key mp-mode' + (C.mode === 'ffa' ? ' on' : '') + '" data-mp="mode-ffa" aria-pressed="' + (C.mode === 'ffa') + '">1V1V1V1</button>' +
            '</div>' +
            '<p class="mp-rules">' + (C.mode === 'duel'
              ? 'Head to head, one deck, 3 lives each. Lose the round, lose a life. Last one with lives wins.'
              : 'Four players, one deck, 3 lives each. Each round, anyone who busts loses a life, and so does the lowest hand. Last one standing wins.') + '</p>' +
            '<h3>SAME SCREEN · NO INTERNET</h3>' +
            '<button class="key' + (C.online ? '' : ' key-primary') + ' mp-wide" data-mp="local">PASS &amp; PLAY ON THIS DEVICE</button>' +
            '<h3>ONLINE' + (C.online ? '' : C.via === 'net' ? ' · NOT CONNECTED' : ' · WEBSITE ONLY') + '</h3>' +
            '<button class="key' + (C.online ? ' key-primary' : '') + ' mp-wide" data-mp="public"' + off + '>FIND PUBLIC MATCH</button>' +
            '<button class="key mp-wide" data-mp="create"' + off + '>CREATE PRIVATE ROOM</button>' +
            '<div class="mp-join"><label class="mp-label" for="mpCode">ROOM CODE</label><input id="mpCode" class="mp-input mp-code-input" maxlength="5" autocomplete="off" spellcheck="false" placeholder="K7Q2M"' + off + '><button class="key" data-mp="join"' + off + '>JOIN</button></div>' +
          '</section>' +
        '</div>' +
        '<p class="mp-note">' + onlineNote() + '</p>' +
        '<div class="mp-actions"><button class="key" data-mp="back">BACK</button></div>';
    } else if (C.stage === 'local') {
      var n = localCount();
      var seatHtml = '';
      for (var si = 0; si < n; si++) {
        var st = C.seats[si];
        seatHtml += '<li class="mp-seat mp-lseat"><span class="mp-lnum">P' + (si + 1) + '</span>' +
          '<button class="key key-small" data-mp="sav-' + si + '-prev" aria-label="Previous look for player ' + (si + 1) + '">◀</button>' +
          '<div class="mp-seat-face">' + avatarSVG(st.av) + '</div>' +
          '<button class="key key-small" data-mp="sav-' + si + '-next" aria-label="Next look for player ' + (si + 1) + '">▶</button>' +
          '<input id="mpSeat' + si + '" class="mp-input" data-seat="' + si + '" maxlength="12" autocomplete="off" spellcheck="false" aria-label="Player ' + (si + 1) + ' name" value="' + esc(st.name) + '"></li>';
      }
      html = '<h2 class="mp-title">PASS &amp; PLAY</h2>' + note +
        '<p class="mp-sub">' + (C.mode === 'duel' ? '1V1' : '1V1V1V1') + ' · ONE DEVICE · NO INTERNET</p>' +
        (C.mode === 'ffa' ? '<div class="mp-modes mp-count">' +
          '<button class="key mp-mode' + (n === 3 ? ' on' : '') + '" data-mp="cnt-3" aria-pressed="' + (n === 3) + '">3 PLAYERS</button>' +
          '<button class="key mp-mode' + (n === 4 ? ' on' : '') + '" data-mp="cnt-4" aria-pressed="' + (n === 4) + '">4 PLAYERS</button></div>' : '') +
        '<ul class="mp-seats mp-lseats">' + seatHtml + '</ul>' +
        '<p class="mp-note">Take turns on this screen. Between turns a cover hides everything until the next player taps, so nobody sees your cards or items. No turn timers.</p>' +
        '<div class="mp-actions"><button class="key key-primary" data-mp="lstart">START MATCH ▸</button><button class="key" data-mp="lback">BACK</button></div>';
    } else if (C.stage === 'queue') {
      html = '<h2 class="mp-title">FINDING A ' + (C.mode === 'duel' ? '1V1' : '4-PLAYER') + ' MATCH</h2>' +
        '<p class="mp-sub blink" id="mpWaiting">1 / ' + need() + ' PLAYERS</p>' +
        '<p class="mp-note">Waiting for other players searching on this page. Keep this tab open.</p>' +
        '<div class="mp-actions"><button class="key" data-mp="cancel">CANCEL</button></div>';
    } else if (C.stage === 'gathering' || C.stage === 'waiting') {
      html = '<h2 class="mp-title">MATCH FOUND</h2><p class="mp-sub blink">SEATING PLAYERS…</p>' + lobbyList(C.expect.length) +
        '<div class="mp-actions"><button class="key" data-mp="cancel">CANCEL</button></div>';
    } else if (C.stage === 'joining') {
      html = '<h2 class="mp-title">ROOM ' + esc(C.code) + '</h2><p class="mp-sub blink">LOOKING FOR THE ROOM…</p>' +
        '<div class="mp-actions"><button class="key" data-mp="cancel">CANCEL</button></div>';
    } else if (C.stage === 'lobby') {
      var cap = C.mode === 'duel' ? 2 : 4, min = C.mode === 'duel' ? 2 : 3;
      var count = roomPeers().length;
      var canStart = C.isHost && count >= min;
      html = '<h2 class="mp-title">PRIVATE ROOM</h2>' + note +
        '<div class="mp-codebox"><span class="mp-label">ROOM CODE</span><span class="mp-code" id="mpCodeShow">' + esc(C.code) + '</span>' +
          '<button class="key key-small" data-mp="copy">COPY</button></div>' +
        '<p class="mp-sub">' + (C.mode === 'duel' ? '1V1 · 2 PLAYERS' : '1V1V1V1 · 3 TO 4 PLAYERS') + '</p>' +
        lobbyList(cap) +
        (C.isHost
          ? '<p class="mp-note">Share the code. ' + (canStart ? 'Ready when you are.' : 'Waiting for ' + (min - count) + ' more.') + '</p>'
          : '<p class="mp-note">Waiting for the host to start.</p>') +
        '<div class="mp-actions">' + (C.isHost ? '<button class="key key-primary" data-mp="start"' + (canStart ? '' : ' disabled') + '>START MATCH ▸</button>' : '') +
        '<button class="key" data-mp="cancel">LEAVE ROOM</button></div>';
    }
    // Keep typed input when re-rendering the same screen.
    var nameEl = $('mpName'), codeEl = $('mpCode');
    var keepName = nameEl ? nameEl.value : null, keepCode = codeEl ? codeEl.value : null;
    var focused = document.activeElement && document.activeElement.id;
    if (body.getAttribute('data-stage') === C.stage && C.stage === 'menu' && body.getAttribute('data-sig') === C.mode + C.av + C.notice + C.online + C.via) return;
    body.innerHTML = html;
    body.setAttribute('data-stage', C.stage);
    body.setAttribute('data-sig', C.mode + C.av + C.notice + C.online + C.via);
    if (keepName !== null && $('mpName')) $('mpName').value = keepName;
    if (keepCode !== null && $('mpCode')) $('mpCode').value = keepCode;
    if (focused && $(focused)) $(focused).focus();
  }

  function onlineNote() {
    if (C.online && C.via === 'net') return 'Online rooms run through public relays: anyone with your room code can join, and public matches pair you with anyone searching. Use a nickname, not your real name.';
    if (C.online) return 'Pass &amp; play needs nothing but this screen. Online: only people this page is shared with can join, while signed in to Claude.';
    if (C.via === 'net') return 'Could not reach the online relays (no internet, or this network blocks them). Pass &amp; play still works. <button class="key key-small" data-mp="retry">TRY AGAIN</button>';
    return 'This copy runs from a file, so online rooms are switched off. Use the website for online play. Pass &amp; play works anywhere.';
  }
  function localCount() { return C.mode === 'duel' ? 2 : (C.seatCount === 3 ? 3 : 4); }
  function ensureSeats() {
    if (C.seats) return;
    C.seats = [];
    for (var i = 0; i < 4; i++) {
      C.seats.push(i === 0 ? { name: C.name, av: C.av } : { name: 'PLAYER ' + (i + 1), av: (C.av + i * 3) % AVATARS.length });
    }
  }
  function readSeats() {
    for (var i = 0; i < 4; i++) {
      var el = $('mpSeat' + i);
      if (el && C.seats) C.seats[i].name = el.value;
    }
  }
  function startLocal() {
    readSeats();
    var n = localCount();
    var roster = [], used = {};
    for (var i = 0; i < n; i++) {
      var nm = cleanName(C.seats[i].name) || 'PLAYER ' + (i + 1);
      if (used[nm]) nm = (nm.slice(0, 9) + ' ' + (i + 1)).trim();
      used[nm] = 1;
      roster.push({ peer: 'L' + i, name: nm, av: C.seats[i].av });
    }
    cleanupRooms(); resetMatchView();
    C.kind = 'local'; C.local = true; C.isHost = true; C.viewer = -1; C.curtainFor = null;
    hostCreate(null, C.mode, roster);
  }

  function lobbyList(cap) {
    var ps = roomPeers();
    var hostP = C.hostPeer;
    var me = C.match ? myPeer(C.match) : null;
    var rows = '';
    for (var i = 0; i < cap; i++) {
      var p = ps[i];
      if (p) {
        var pp = p.presence;
        rows += '<li class="mp-seat"><div class="mp-seat-face">' + avatarSVG(pp.av | 0) + '</div><span>' + esc(cleanName(pp.nm) || 'PLAYER') +
          (p.peer === me ? ' <em>(YOU)</em>' : '') + (p.peer === hostP ? ' <em class="amber">HOST</em>' : '') + '</span></li>';
      } else rows += '<li class="mp-seat empty"><div class="mp-seat-face"></div><span>OPEN SEAT</span></li>';
    }
    var extra = ps.length > cap ? '<p class="mp-note">' + (ps.length - cap) + ' more waiting. The room is full.</p>' : '';
    return '<ul class="mp-seats">' + rows + '</ul>' + extra;
  }

  function bindMulti() {
    var scr = $('scrMulti');
    scr.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-mp]') : null;
      if (!b || b.disabled) return;
      FX.unlockAudio();
      FX.sfx('click');
      var a = b.getAttribute('data-mp');
      readInputs();
      C.notice = '';
      if (a === 'back') { cleanupRooms(); UI.showScreen('title'); return; }
      if (a === 'av-prev') { C.av = (C.av + AVATARS.length - 1) % AVATARS.length; saveProfile(); renderMulti(); return; }
      if (a === 'av-next') { C.av = (C.av + 1) % AVATARS.length; saveProfile(); renderMulti(); return; }
      if (a === 'mode-duel') { C.mode = 'duel'; renderMulti(); return; }
      if (a === 'mode-ffa') { C.mode = 'ffa'; renderMulti(); return; }
      if (a === 'local') { ensureSeats(); C.seats[0].name = C.name; C.seats[0].av = C.av; C.stage = 'local'; renderMulti(); return; }
      if (a === 'lback') { readSeats(); C.stage = 'menu'; renderMulti(); return; }
      if (a === 'cnt-3' || a === 'cnt-4') { readSeats(); C.seatCount = a === 'cnt-3' ? 3 : 4; renderMulti(); return; }
      if (a.indexOf('sav-') === 0) {
        readSeats();
        var parts = a.split('-'), si = parseInt(parts[1], 10), st = C.seats[si];
        st.av = (st.av + (parts[2] === 'next' ? 1 : AVATARS.length - 1)) % AVATARS.length;
        if (si === 0) { C.av = st.av; saveProfile(); }
        renderMulti(); return;
      }
      if (a === 'lstart') { startLocal(); return; }
      if (a === 'retry') { openMulti(); return; }
      if ((a === 'public' || a === 'create' || a === 'join') && !C.online) { C.notice = C.via === 'net' ? 'Not connected to the online relays. Try again, or use PASS & PLAY.' : 'Online rooms need the website version. Use PASS & PLAY here.'; renderMulti(); return; }
      if (a === 'public') { findPublic(); return; }
      if (a === 'create') { createPrivate(); return; }
      if (a === 'join') { joinPrivate(($('mpCode') || {}).value); return; }
      if (a === 'cancel') { cleanupRooms(); resetMatchView(); C.stage = 'menu'; renderMulti(); return; }
      if (a === 'start') { startPrivate(); return; }
      if (a === 'copy') {
        var code = C.code;
        try {
          navigator.clipboard.writeText(code).then(function () { b.textContent = 'COPIED'; }, function () { selectCode(); });
        } catch (e) { selectCode(); }
      }
    });
    scr.addEventListener('input', function (ev) {
      if (ev.target.id === 'mpName') { C.name = cleanName(ev.target.value) || C.name; saveProfile(); }
      if (ev.target.id === 'mpSeat0') { var v0 = cleanName(ev.target.value); if (v0) { C.name = v0; saveProfile(); } }
      if (ev.target.id === 'mpCode') ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    });
    scr.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target.id === 'mpCode' && C.online) { readInputs(); joinPrivate(ev.target.value); }
    });
  }
  function readInputs() {
    var n = $('mpName');
    if (n) { var v = cleanName(n.value); if (v) { C.name = v; saveProfile(); } }
  }
  function selectCode() {
    var el = $('mpCodeShow');
    if (!el || !window.getSelection) return;
    var r = document.createRange();
    r.selectNodeContents(el);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function init(ui) {
    UI = ui;
    loadProfile();
    buildCurtain();
    var btn = $('tMulti');
    if (btn) btn.addEventListener('click', function () { FX.sfx('click'); openMulti(); });
    bindMulti();
  }

  H.MP = {
    init: init,
    active: active,
    onAction: onAction,
    onPrimary: onPrimary,
    onInspect: onInspect,
    onBuy: onBuy,
    onMenu: onMenu,
    onKey: onKey,
    open: openMulti,
    AVATARS: AVATARS,
    // test hooks
    _t: {
      C: C, host: function () { return HOST; }, enc: enc, dec: dec, mpCanUse: mpCanUse,
      view: function () { return C.S ? buildView() : null; }, reveal: revealForCurtain, startLocal: startLocal, ensureSeats: ensureSeats, sendAct: sendAct, wire: function () { return HOST ? wire() : null; }
    }
  };
})(window.H21 = window.H21 || {});
