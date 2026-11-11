/* ==========================================================================
   HOUSE OF 21 — game.js
   Game state, the round engine, tournament progression, saving and input.
   Rendering lives in ui.js; this file builds a plain "view" object for it.
   ========================================================================== */
(function (H) {
  'use strict';

  var CONFIG = H.CONFIG, Cards = H.Cards, RNG = H.RNG, Items = H.Items, ITEMS = H.Items.ITEMS;
  var AI = H.AI, Opp = H.Opponents, Story = H.Story, FX = H.FX;
  var UI = null; // assigned at boot

  /* ======================================================================
     1. STATE
     ====================================================================== */
  var G = null;                // serialisable game state
  var RT = {                   // runtime-only (never saved)
    epoch: 0, busy: false, rescue: false, oppTimer: 0,
    xrayUntil: 0, xrayCards: null, xrayTimer: 0,
    revealOpp: false, overlay: null, lowLifeSaid: false
  };

  function newFx() {
    return {
      ratPoison: { player: false, opp: false },   // trap set AGAINST that side
      handSaw: { player: false, opp: false },     // trap set AGAINST that side
      shackled: { player: null, opp: null },      // locked action for that side
      tourniquet: { player: 0, opp: 0 },          // charges active this round
      clamped: { player: false, opp: false }      // VICE CLAMP: no items this round
    };
  }

  function newSide() {
    return {
      lives: CONFIG.startingLives, inventory: [], hands: [], initial: [], prevInitial: null,
      doubled: false, split: false, itemsUsedThisRound: 0, spree: false, stoleThisRound: false,
      intel: { xray: null, burner: null, burnerCount: 0 }, aiTarget: 17
    };
  }

  function newHand(cards) { return { cards: cards || [], stood: false, drawn: [] }; }

  function newState() {
    return {
      v: 2, phase: 'title', matchIndex: 0, round: 0,
      tokens: CONFIG.startingTokens, sealed: [], incoming: [],
      shop: { items: [], bought: 0 },
      player: newSide(), opp: newSide(),
      deck: [], discardPile: [], turn: null, firstTurn: 'player',
      fx: newFx(), tourniquetNext: { player: false, opp: false },
      log: [], actions: 0, lastResult: null, oppDefId: Opp.LIST[0].id,
      serial: 0, result: null, stats: { won: 0, lost: 0, drawn: 0 },
      lineup: buildLineup(), fluShot: { player: 0, opp: 0 }, beatConductor: false
    };
  }

  function nextSerial() { G.serial += 1; return G.serial; }
  function newInv(id) { return { uid: 'i' + nextSerial(), id: id }; }
  function other(w) { return w === 'player' ? 'opp' : 'player'; }
  function def() { return Opp.byId(G.oppDefId); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function stale(ep) { return ep !== RT.epoch; }

  /** One competitor per match, drawn from each difficulty tier. */
  function buildLineup() {
    var tiers = CONFIG.lineupTiers, out = [];
    for (var i = 0; i < CONFIG.matches; i++) {
      var tier = tiers[Math.min(i, tiers.length - 1)].filter(function (id) { return out.indexOf(id) < 0; });
      out.push(tier.length ? RNG.pick(tier) : RNG.pick(tiers[0]));
    }
    return out;
  }
  function traits() { return def().traits || {}; }
  function immune(w) { return !!(G.fluShot && G.fluShot[w] > 0); }
  function startLivesFor() { return def().lives || CONFIG.startingLives; }
  function maxLivesFor(w) { return w === 'player' ? CONFIG.maxLives : Math.max(CONFIG.maxLives, startLivesFor()); }
  function rage() { return traits().impatient ? Math.min(1, Math.max(0, (G.round - 1) / 7)) : 0; }
  function costsOf(it, params) { return Items.costsOf(it, params); }
  function oppItemOpts() {
    var d = def(), o = { ai: true };
    if (d.items) { if (d.items.pool) o.pool = d.items.pool; if (d.items.tiers) o.tiers = d.items.tiers; }
    return o;
  }

  /* ======================================================================
     2. HAND HELPERS
     ====================================================================== */
  function total(hand) { return Cards.handValue(hand.cards).total; }
  function finished(hand) { return hand.stood || total(hand) > 21; }
  function isDone(w) {
    var hs = G[w].hands;
    if (!hs.length) return false;
    for (var i = 0; i < hs.length; i++) if (!finished(hs[i])) return false;
    return true;
  }
  function allBusted(w) {
    var hs = G[w].hands;
    if (!hs.length) return false;
    for (var i = 0; i < hs.length; i++) if (total(hs[i]) <= 21) return false;
    return true;
  }
  function focusHandIndex(w) {
    var hs = G[w].hands, i;
    for (i = 0; i < hs.length; i++) if (!finished(hs[i])) return i;
    for (i = hs.length - 1; i >= 0; i--) if (total(hs[i]) > 21) return i;
    return Math.max(0, hs.length - 1);
  }
  function focusHand(w) { return G[w].hands[focusHandIndex(w)]; }
  function bestTotal(w) {
    var best = -1, hs = G[w].hands;
    for (var i = 0; i < hs.length; i++) { var t = total(hs[i]); if (t <= 21 && t > best) best = t; }
    if (best < 0) { // all bust: show the lowest bust total
      best = 99;
      for (var j = 0; j < hs.length; j++) best = Math.min(best, total(hs[j]));
    }
    return best;
  }
  function cardCount(w) {
    var n = 0; G[w].hands.forEach(function (h) { n += h.cards.length; }); return n;
  }

  /* ======================================================================
     3. DECK
     ====================================================================== */
  function drawCard() { return G.deck.length ? G.deck.pop() : null; }
  function takeFromDeck(uid) {
    for (var i = 0; i < G.deck.length; i++) if (G.deck[i].uid === uid) return G.deck.splice(i, 1)[0];
    return null;
  }
  function returnToDeck(card) {
    if (!card || card.wild || card.smuggled) { if (card) G.discardPile.push(card); return; }
    card.mod = null;
    G.deck.push(card);
  }
  function addCard(w, card, opts) {
    opts = opts || {};
    var h = opts.hand || focusHand(w);
    h.cards.push(card);
    if (opts.drawn) h.drawn.push(card.uid);
  }
  /* A card dealt to a side outside its own turn (DEAD WEIGHT). */
  function addCardToOther(w, card) {
    var hs = G[w].hands, target = null, i;
    for (i = 0; i < hs.length; i++) if (!finished(hs[i])) { target = hs[i]; break; }
    if (!target) for (i = 0; i < hs.length; i++) if (total(hs[i]) <= 21) { target = hs[i]; break; }
    if (!target) target = hs[hs.length - 1];
    target.cards.push(card);
    target.drawn.push(card.uid);
  }

  /* ======================================================================
     4. ACTIONS AVAILABLE
     ====================================================================== */
  var ACTION_NAMES = { hit: 'HIT', stand: 'STAND', double: 'DOUBLE DOWN', split: 'SPLIT', item: 'USE ITEM' };

  /** Non-STAND actions currently open to `w`. STAND is always allowed. */
  function availableActions(w, ignoreShackle) {
    if (!G || G.phase !== 'play' || isDone(w)) return [];
    var s = G[w], h = focusHand(w), out = [];
    if (G.deck.length > 0) out.push('hit');
    var fresh = !s.split && s.hands.length === 1 && h.drawn.length === 0 && h.cards.length === 2;
    if (fresh && G.deck.length >= 1) out.push('double');
    if (fresh && G.deck.length >= 2 && Cards.cardValue(h.cards[0]) === Cards.cardValue(h.cards[1])) out.push('split');
    if (s.inventory.length > 0) out.push('item');
    if (!ignoreShackle && G.fx.shackled[w]) out = out.filter(function (a) { return a !== G.fx.shackled[w]; });
    return out;
  }

  /* ======================================================================
     5. LOG
     ====================================================================== */
  function log(w, text, kind) {
    G.log.push({ who: w, text: text, kind: kind || 'act' });
    if (G.log.length > 120) G.log.splice(0, G.log.length - 120);
  }

  /* ======================================================================
     6. LIVES
     ====================================================================== */
  function loseLives(w, n, source) {
    if (n <= 0) return 0;
    if (G.fx.tourniquet[w] > 0) {
      G.fx.tourniquet[w] = 0;
      n -= 1;
      log(w, w === 'player' ? 'YOUR TOURNIQUET ABSORBED 1 LIFE' : 'THEIR TOURNIQUET ABSORBED 1 LIFE', 'trap');
    }
    n = Math.min(n, G[w].lives);
    if (n <= 0) return 0;
    G[w].lives -= n;
    FX.sfx('lose');
    if (w === 'player') FX.staticBurst(300, 0.2 + 0.1 * n);
    UI.lifeFlash(w);
    return n;
  }
  function gainLife(w, n) {
    G[w].lives = Math.min(maxLivesFor(w), G[w].lives + n);
    FX.sfx('heart');
  }

  /* ======================================================================
     7. ITEMS
     ====================================================================== */
  function findInv(w, uid) {
    var inv = G[w].inventory;
    for (var i = 0; i < inv.length; i++) if (inv[i].uid === uid) return inv[i];
    return null;
  }
  function removeInventory(w, uid) {
    var inv = G[w].inventory;
    for (var i = 0; i < inv.length; i++) if (inv[i].uid === uid) return inv.splice(i, 1)[0];
    return null;
  }

  function canUseItem(w, uid, win) {
    var inv = findInv(w, uid);
    if (!inv) return { ok: false, reason: 'ITEM NOT FOUND' };
    var it = ITEMS[inv.id];
    if (!win) return { ok: false, reason: 'NOT RIGHT NOW' };
    if (it.windows.indexOf(win) < 0) {
      if (win === 'between') return { ok: false, reason: 'ONLY DURING YOUR TURN IN A HAND' };
      if (win === 'rescue') return { ok: false, reason: 'CANNOT SAVE A BUST' };
      return { ok: false, reason: 'ONLY BETWEEN ROUNDS' };
    }
    if (win === 'turn') {
      if (G.phase !== 'play' || G.turn !== w || isDone(w)) return { ok: false, reason: 'ONLY ON YOUR TURN' };
    }
    if (win === 'between' && G.phase !== 'prep' && G.phase !== 'intermission') return { ok: false, reason: 'NOT RIGHT NOW' };
    if (win === 'rescue' && !allBusted(w)) return { ok: false, reason: 'YOU HAVE NOT BUSTED' };
    if ((win === 'turn' || win === 'rescue') && G.fx.shackled[w] === 'item') return { ok: false, reason: 'ITEMS ARE SHACKLED THIS ROUND' };
    if ((win === 'turn' || win === 'rescue') && G.fx.clamped[w]) return { ok: false, reason: 'ITEMS CLAMPED THIS ROUND' };
    return it.canUse(E, w, win);
  }

  /** The item window the player is currently in (or null). */
  function playerWindow() {
    if (!G) return null;
    if (RT.rescue) return 'rescue';
    if (G.phase === 'prep' || G.phase === 'intermission') return RT.busy ? null : 'between';
    if (G.phase === 'play' && G.turn === 'player' && !RT.busy && !isDone('player')) return 'turn';
    return null;
  }

  /** Consume + apply. Returns false if the item could not be used. */
  function useItem(w, uid, params, win) {
    var chk = canUseItem(w, uid, win);
    if (!chk.ok) return Promise.resolve(false);
    var inv = removeInventory(w, uid);
    var it = ITEMS[inv.id];
    G[w].itemsUsedThisRound += 1;
    if (w === 'opp') {
      log('opp', 'ITEM USED: ' + it.name, 'item');
      reactOpp('oppItem');
    } else {
      log('player', 'ITEM USED: ' + it.name, 'item');
    }
    FX.sfx('item');

    // RAT POISON triggers before the effect.
    if (G.fx.ratPoison[w]) {
      G.fx.ratPoison[w] = false;
      if (immune(w)) {
        log(w, 'FLU SHOT: RAT POISON HAD NO EFFECT', 'trap');
      } else {
        log(w, w === 'player' ? 'RAT POISON: YOU LOSE 1 LIFE' : 'RAT POISON: OPPONENT LOSES 1 LIFE', 'trap');
        loseLives(w, 1, 'lifeloss');
        if (w === 'opp') reactOpp('oppLose');
        if (G[w].lives <= 0) {
          render();
          return Promise.resolve(true);
        }
      }
    }
    return applyItem(w, inv.id, params || {}).then(function () {
      render();
      return true;
    });
  }

  /** Run an item's effect. FLU SHOT on the target blocks hostile items. */
  function applyItem(w, id, params) {
    var it = ITEMS[id];
    if (it.hostile && immune(other(w))) {
      log(w, 'FLU SHOT: ' + it.name + ' HAD NO EFFECT', 'trap');
      return Promise.resolve();
    }
    return Promise.resolve(it.apply(E, w, params || {}));
  }

  /** Ask the player for an item's choice. Resolves params, or null if cancelled. */
  function gatherParams(it, usingUid, win) {
    if (!it.ask) return Promise.resolve({});
    if (it.ask === 'card') {
      var h = focusHand('player');
      var cards = h.cards.filter(function (c) { return !c.mystery && (it.cardFilter ? it.cardFilter(c) : true); });
      return UI.chooseCard(cards, it.askTitle).then(function (uid) { return uid ? { cardUid: uid } : null; });
    }
    if (it.ask === 'value') {
      var lo = it.askMin || CONFIG.placeboMin, hi = it.askMax || CONFIG.placeboMax;
      return UI.chooseValue(lo, hi, it.askTitle, it.askText).then(function (v) { return v ? { value: v } : null; });
    }
    if (it.ask === 'item') {
      var others = G.player.inventory.filter(function (x) { return x.uid !== usingUid; });
      return UI.chooseItem(others, it.askTitle, it.id).then(function (uid) { return uid ? { itemUid: uid } : null; });
    }
    if (it.ask === 'pandora') {
      var box = findInv('player', usingUid);
      if (!box) return Promise.resolve(null);
      // The three offers are rolled once and kept, so closing the lid
      // cannot be used to re-roll them.
      if (!box.offer || !box.offer.length) { box.offer = rollOffer(win, false); save(); }
      var opts = box.offer.map(function (id) {
        var c = virtualCanUse('player', id, win);
        return { id: id, item: ITEMS[id], ok: c.ok, reason: c.reason };
      });
      return UI.choosePandora(opts, it.askTitle).then(function (id) {
        if (!id) return null;
        return gatherParams(ITEMS[id], usingUid, win).then(function (inner) {
          return inner === null ? null : { choice: id, inner: inner };
        });
      });
    }
    return Promise.resolve({});
  }

  function rollOffer(win, ai) {
    return Items.randomIds(CONFIG.pandoraChoices, { ai: ai, window: win === 'between' ? 'between' : 'turn', exclude: ['pandora'], distinct: true });
  }
  function virtualCanUse(w, id, win) {
    var it = ITEMS[id];
    if (!it) return { ok: false, reason: 'UNKNOWN ITEM' };
    if (it.windows.indexOf(win) < 0) return { ok: false, reason: win === 'between' ? 'ONLY DURING A HAND' : 'ONLY BETWEEN ROUNDS' };
    return it.canUse(E, w, win);
  }

  /* ======================================================================
     8. ENGINE API FOR ITEMS + AI
     ====================================================================== */
  var E = {
    side: function (w) { return G[w]; },
    other: other,
    lives: function (w) { return G[w].lives; },
    gainLife: gainLife,
    inventory: function (w) { return G[w].inventory; },
    removeInventory: removeInventory,
    focusHand: focusHand,
    isDone: isDone,
    cardCount: cardCount,
    drawCard: drawCard,
    deckSize: function () { return G.deck.length; },
    takeFromDeck: takeFromDeck,
    returnToDeck: returnToDeck,
    shuffleDeck: function () { RNG.shuffle(G.deck); },
    discard: function (c) { G.discardPile.push(c); },
    addCard: addCard,
    addCardToOther: addCardToOther,
    log: log,
    fx: function () { return G.fx; },
    tourniquetNext: function () { return G.tourniquetNext; },
    availableActions: availableActions,
    actionName: function (a) { return ACTION_NAMES[a] || a; },
    canUseItem: canUseItem,
    nextSerial: nextSerial,
    sealedCount: function () { return G.sealed.length; },
    seal: function (id) { G.sealed.push(id); },
    isLastMatch: function () { return G.matchIndex >= CONFIG.matches - 1; },
    xray: function (who, target) {
      var cards = G[target].initial.map(Cards.cloneCard);
      if (who === 'player') {
        RT.xrayCards = cards;
        RT.xrayUntil = Date.now() + CONFIG.xrayDurationMs;
        clearTimeout(RT.xrayTimer);
        RT.xrayTimer = setTimeout(function () { RT.xrayCards = null; render(); }, CONFIG.xrayDurationMs);
        FX.glitch(document.getElementById('mon5'), 260);
      } else {
        G.opp.intel.xray = cards;
      }
    },
    recordBurner: function (who, target, reading) {
      G[who].intel.burner = reading;
      G[who].intel.burnerCount = cardCount(target);
    },
    chooseDeadWeight: function (who, cards) {
      if (who === 'player') return UI.chooseDeadWeight(cards);
      return AI.chooseDeadWeight(E, cards);
    },
    immune: immune,
    startFluShot: function (w) {
      G.fluShot[w] = CONFIG.fluShotRounds;
      G.fx.ratPoison[w] = false; G.fx.handSaw[w] = false; G.fx.shackled[w] = null; G.fx.clamped[w] = false;
    },
    loseLives: function (w, n) {
      var r = loseLives(w, n, 'item');
      if (w === 'opp' && r) reactOpp('oppLose');
      return r;
    },
    maxLives: maxLivesFor,
    startLives: startLivesFor,
    announce: function (who, text, good) {
      if (who === 'player') UI.banner(text, good ? 'good' : 'bad');
      else UI.banner('THEY FLIP ' + text, good ? 'bad' : 'good');
    },
    chooseGiveBack: function (who, invs) {
      if (who === 'player') return UI.chooseGiveBack(invs);
      return AI.chooseGiveBack(E, def(), invs);
    },
    applyVirtual: function (who, id, params) { return applyItem(who, id, params); },
    rollOffer: rollOffer,
    virtualCanUse: virtualCanUse,
    bestTotal: bestTotal,
    allBusted: allBusted,
    rage: rage,
    unknownPool: function (w) {
      var known = {};
      var intel = G[w].intel.xray || [];
      intel.forEach(function (c) { known[c.uid] = true; });
      var pool = G.deck.slice();
      G[other(w)].hands.forEach(function (h) {
        h.cards.forEach(function (c) { if (!known[c.uid]) pool.push(c); });
      });
      return pool;
    }
  };

  /* ======================================================================
     9. REACTIONS
     ====================================================================== */
  function reactOpp(event) {
    if (!G || !G.opp.hands) return;
    var ctx = {
      oppTotal: G.opp.hands.length ? Cards.handValue(focusHand('opp').cards).total : 0,
      playerTotal: G.player.hands.length ? Cards.handValue(focusHand('player').cards).total : 0,
      oppLives: G.opp.lives,
      rage: rage()
    };
    var r = AI.react(def(), event, ctx);
    UI.setExpression(r.expr);
    if (r.line) UI.say(r.line, 'opp');
  }

  /* ======================================================================
     10. TOURNAMENT FLOW
     ====================================================================== */
  function newGame() {
    cancelAsync();
    clearSave();
    G = newState();
    G.phase = 'story';
    UI.showScreen('story');
    UI.playSequence(Story.intro).then(function () { startMatch(0); });
  }

  function startMatch(i) {
    cancelAsync();
    G.matchIndex = i;
    G.round = 0;
    if (!G.lineup) G.lineup = buildLineup();
    var forced = RT.forceConductor;
    RT.forceConductor = false;
    G.oppDefId = (forced || RNG.next() < CONFIG.conductorChance) ? 'conductor' : G.lineup[i];
    G.player.lives = CONFIG.startingLives;
    G.player.hands = []; G.player.initial = [];
    var keepPrev = G.player.prevInitial;
    var pInv = G.player.inventory;
    G.player = newSide();
    G.player.inventory = pInv;
    G.player.prevInitial = keepPrev;
    G.opp = newSide();
    G.opp.lives = startLivesFor();
    G.opp.inventory = Items.randomIds(CONFIG.itemsPerMatch, oppItemOpts()).map(newInv);
    G.fluShot = { player: 0, opp: 0 };
    G.fx = newFx();
    G.tourniquetNext = { player: false, opp: false };
    G.log = [];
    G.lastResult = null;
    // Incoming items: sealed (ZIPLOCK BAG) items first, then random fill.
    var incoming = G.sealed.splice(0, CONFIG.itemsPerMatch);
    var fill = Items.randomIds(CONFIG.itemsPerMatch - incoming.length, false);
    G.incoming = incoming.concat(fill);
    G.sealedReturned = incoming.length;
    G.phase = 'matchIntro';
    RT.lowLifeSaid = false;
    save();
    showMatchIntro();
  }

  function showMatchIntro() {
    UI.showScreen(null);
    UI.setOpponent(def());
    UI.setExpression('neutral');
    log('sys', 'MATCH ' + pad(G.matchIndex + 1) + ' / ' + pad(CONFIG.matches) + ': ' + def().alias, 'sys');
    render();
    FX.staticBurst(500, 0.35);
    UI.showMatchIntro(def(), def().id === 'conductor' ? Story.conductor.selfIntro : (Story.conductor.matchIntro[G.matchIndex] || ''), G);
  }

  function beginIntake() {
    G.phase = 'intake';
    save();
    UI.hideOverlay();
    render();
    showIntake();
  }

  function showIntake() {
    render();
    UI.showIntake(G, function (sacrificeUids) {
      sacrificeUids.forEach(function (uid) { removeInventory('player', uid); });
      G.incoming.forEach(function (id) { G.player.inventory.push(newInv(id)); });
      G.player.inventory = G.player.inventory.slice(0, CONFIG.inventoryMax);
      G.incoming = [];
      log('sys', 'ITEMS ISSUED TO BOTH COMPETITORS', 'sys');
      log('opp', 'OPPONENT RECEIVED ' + G.opp.inventory.length + ' ITEMS (HIDDEN)', 'act');
      startPrep();
    });
  }

  function startPrep() {
    G.round += 1;
    G.phase = 'prep';
    ['player', 'opp'].forEach(function (w) {
      var s = G[w];
      s.hands = []; s.initial = []; s.doubled = false; s.split = false;
      s.itemsUsedThisRound = 0;
      s.stoleThisRound = false;
      s.intel = { xray: null, burner: null, burnerCount: 0 };
    });
    G.turn = null;
    G.actions = 0;
    G.deck = [];
    G.discardPile = [];
    RT.revealOpp = false;
    RT.xrayCards = null;
    log('sys', '— ROUND ' + pad(G.round) + ' —', 'round');
    save();
    showPrep();
  }

  function showPrep() {
    UI.showScreen(null);
    UI.hideOverlay();
    UI.setOpponent(def());
    RT.revealOpp = false;
    render();
    UI.banner('ROUND ' + pad(G.round));
    reactOpp('roundStart');
    if (G.player.lives === 1 && !RT.lowLifeSaid) {
      RT.lowLifeSaid = true;
      setTimeout(function () { UI.conductorWhisper(RNG.pick(Story.conductor.lowLife)); }, 900);
    }
  }

  /* ---------------------------- THE DEAL ---------------------------- */
  function deal() {
    if (!G || G.phase !== 'prep' || RT.busy) return;
    var ep = RT.epoch;
    RT.busy = true;
    render();
    // Opponent pre-round items.
    var prep = AI.decidePrep(E, def());
    var chain = Promise.resolve();
    prep.forEach(function (c) {
      chain = chain.then(function () {
        if (stale(ep) || G.phase !== 'prep') return;
        log('opp', 'PRE-ROUND:', 'act');
        return useItem('opp', c.uid, c.params, 'between').then(function () { render(); return sleep(500); });
      });
    });
    chain.then(function () {
      if (stale(ep)) return;
      if (G.opp.lives <= 0 || G.player.lives <= 0) { RT.busy = false; finishMatchCheck(); return; }
      G.fx.tourniquet.player = G.tourniquetNext.player ? 1 : 0;
      G.fx.tourniquet.opp = G.tourniquetNext.opp ? 1 : 0;
      G.tourniquetNext = { player: false, opp: false };
      G.deck = Cards.freshShuffledDeck();
      G.phase = 'play';
      var twins = !!traits().twins;
      G.player.hands = [newHand()];
      G.opp.hands = twins ? [newHand(), newHand()] : [newHand()];
      G.opp.split = twins;
      G.opp.aiTarget = RNG.int(def().ai.standMin, def().ai.standMax);
      log('sys', 'DECK SHUFFLED: 52 CARDS', 'sys');
      var order = twins ? ['player', 'opp', 'opp2', 'player', 'opp', 'opp2'] : ['player', 'opp', 'player', 'opp'];
      var step = Promise.resolve();
      order.forEach(function (w) {
        step = step.then(function () {
          if (stale(ep)) return;
          var side = w === 'opp2' ? 'opp' : w;
          G[side].hands[w === 'opp2' ? 1 : 0].cards.push(drawCard());
          FX.sfx('deal');
          render();
          return sleep(CONFIG.dealStepMs);
        });
      });
      return step.then(function () {
        if (stale(ep)) return;
        G.player.initial = G.player.hands[0].cards.map(Cards.cloneCard);
        G.opp.initial = [].concat.apply([], G.opp.hands.map(function (h) { return h.cards; })).map(Cards.cloneCard);
        log('opp', twins ? 'INITIAL DEAL: COMPLETE · 2 HANDS · 4 CARDS (HIDDEN)' : 'INITIAL DEAL: COMPLETE · 2 CARDS (HIDDEN)', 'act');
        reactOpp('dealt');
        var pN = Cards.isNatural(G.player.hands[0].cards), oN = !G.opp.split && Cards.isNatural(G.opp.hands[0].cards);
        if (pN || oN) {
          log('sys', 'NATURAL BLACKJACK!', 'reveal');
          RT.busy = false;
          return resolveRound('natural');
        }
        G.firstTurn = RNG.chance(0.5) ? 'player' : 'opp';
        log('sys', 'FIRST TURN: ' + (G.firstTurn === 'player' ? 'YOU' : 'OPPONENT'), 'sys');
        RT.busy = false;
        nextTurn(null);
      });
    });
  }

  /* --------------------------- TURN LOOP ---------------------------- */
  function nextTurn(prev) {
    if (!G || G.phase !== 'play') return;
    clearTimeout(RT.oppTimer);
    if (G.actions > CONFIG.maxActionsPerRound) {
      ['player', 'opp'].forEach(function (w) { G[w].hands.forEach(function (h) { h.stood = true; }); });
      log('sys', 'THE HOUSE CALLS TIME', 'sys');
    }
    if (isDone('player') && isDone('opp')) { resolveRound('compare'); return; }
    var next = prev === null ? G.firstTurn : other(prev);
    if (isDone(next)) next = other(next);
    G.turn = next;
    save();
    render();
    if (next === 'opp') {
      RT.busy = true;
      var ms = Math.round(RNG.int(CONFIG.opponentThinkMs[0], CONFIG.opponentThinkMs[1]) * (1 - 0.6 * rage()));
      if (RNG.chance(0.35) && !traits().stoneFace) UI.setExpression(rage() >= 0.55 ? 'frustrated' : 'thinking');
      RT.oppTimer = setTimeout(oppTurn, ms);
    } else {
      RT.busy = false;
      render();
    }
  }

  function oppTurn() {
    RT.oppTimer = 0;
    var ep = RT.epoch;
    if (!G || G.phase !== 'play' || G.turn !== 'opp') return;
    if (isDone('opp')) { nextTurn('opp'); return; }
    sandraGrab();
    var choice = AI.decideItem(E, def());
    var p = Promise.resolve(false);
    if (choice) {
      p = useItem('opp', choice.uid, choice.params, 'turn').then(function (used) {
        if (!used || stale(ep)) return used;
        render();
        return sleep(650).then(function () { return used; });
      });
    }
    p.then(function (used) {
      if (stale(ep) || G.phase !== 'play') return;
      if (G.opp.lives <= 0) { resolveRound('lifeloss'); return; }
      return checkBusts().then(function (ended) {
        if (ended || stale(ep)) return;
        if (used && costsOf(ITEMS[choice.id], choice.params)) { nextTurn('opp'); return; }
        if (isDone('opp')) { nextTurn('opp'); return; }
        return doAction('opp', AI.decideAction(E, def()));
      });
    });
  }

  /** SANDRA: nervous hands, at most once per round. Not an item. */
  function sandraGrab() {
    if (!traits().thief || G.opp.stoleThisRound || !G.player.inventory.length) return;
    if (!RNG.chance(CONFIG.sandraStealChance)) return;
    G.opp.stoleThisRound = true;
    var inv = G.player.inventory.splice(RNG.int(0, G.player.inventory.length - 1), 1)[0];
    var kept = G.opp.inventory.length < CONFIG.inventoryMax;
    inv.offer = null;
    if (kept) G.opp.inventory.push(inv);
    log('opp', def().name + ' SNATCHED YOUR ' + ITEMS[inv.id].name + (kept ? '' : ' AND DROPPED IT'), 'trap');
    FX.sfx('hit');
    FX.glitch(document.getElementById('mon2'), 260);
    UI.say(RNG.pick(def().lines.steal || ['Sorry.']), 'opp');
    render();
  }

  function doAction(w, kind) {
    var ep = RT.epoch;
    var s = G[w];
    var acts = availableActions(w, false);
    if (kind !== 'stand' && acts.indexOf(kind) < 0) kind = 'stand';
    var h = focusHand(w);
    var hi = focusHandIndex(w);
    var tag = s.split ? ' [HAND ' + (hi + 1) + ']' : '';
    G.actions += 1;
    var c;

    if (kind === 'hit') {
      c = drawCard();
      if (!c) { h.stood = true; log(w, 'DECK EMPTY: STANDS', 'act'); }
      else {
        addCard(w, c, { drawn: true, hand: h });
        if (w === 'opp') { log('opp', 'ACTION: HIT' + tag, 'act'); log('opp', 'CARD DRAWN: HIDDEN · ' + cardCount('opp') + ' CARDS', 'dim'); }
        else log('player', 'HIT' + tag + ' → ' + Cards.label(c) + ' (' + total(h) + ')', 'act');
      }
      FX.sfx('deal');
    } else if (kind === 'stand') {
      h.stood = true;
      log(w, w === 'opp' ? 'ACTION: STAND' + tag : 'STAND' + tag + ' ON ' + total(h), 'act');
      FX.sfx('click');
    } else if (kind === 'double') {
      s.doubled = true;
      c = drawCard();
      if (c) addCard(w, c, { drawn: true, hand: h });
      h.stood = true;
      if (w === 'opp') { log('opp', 'ACTION: DOUBLE DOWN', 'act'); log('opp', 'CARD DRAWN: HIDDEN · STANDS · ROUND NOW COSTS 2', 'dim'); }
      else log('player', 'DOUBLE DOWN → ' + (c ? Cards.label(c) : '—') + ' (' + total(h) + ') · ROUND NOW COSTS 2', 'act');
      FX.sfx('deal');
    } else if (kind === 'split') {
      var a = h.cards[0], b = h.cards[1];
      s.split = true;
      s.hands = [newHand([a]), newHand([b])];
      var c1 = drawCard(), c2 = drawCard();
      s.hands[0].cards.push(c1); s.hands[0].drawn.push(c1.uid);
      s.hands[1].cards.push(c2); s.hands[1].drawn.push(c2.uid);
      if (w === 'opp') { log('opp', 'ACTION: SPLIT', 'act'); log('opp', 'NOW PLAYING 2 HANDS · ' + cardCount('opp') + ' CARDS', 'dim'); }
      else log('player', 'SPLIT → ' + Cards.label(a) + ' ' + Cards.label(c1) + ' | ' + Cards.label(b) + ' ' + Cards.label(c2), 'act');
      FX.sfx('deal');
    }

    // Split hand busted but another hand remains: announce it.
    if (s.split && total(h) > 21 && !allBusted(w)) {
      log(w, (w === 'opp' ? 'OPPONENT ' : 'YOUR ') + 'HAND ' + (hi + 1) + ': BUST', 'trap');
    }

    // Reactions
    if (w === 'player') {
      if (kind === 'stand') reactOpp('playerStand');
      else reactOpp('playerHit');
    } else if (kind === 'stand') reactOpp('oppStand');
    else reactOpp('oppDraw');

    render();
    return sleep(w === 'opp' ? 420 : 220).then(function () {
      if (stale(ep) || G.phase !== 'play') return;
      return checkBusts().then(function (ended) {
        if (ended || stale(ep)) return;
        nextTurn(w);
      });
    });
  }

  /* ----------------------- BUSTS + RESCUE --------------------------- */
  function hasRescue(w) {
    if (!CONFIG.allowBustRescue) return false;
    return G[w].inventory.some(function (inv) { return canUseItem(w, inv.uid, 'rescue').ok; });
  }

  function rescuePlayer() {
    var ep = RT.epoch;
    if (!allBusted('player') || !hasRescue('player') || G.phase !== 'play') return Promise.resolve();
    RT.rescue = true;
    render();
    var opts = G.player.inventory.filter(function (inv) { return canUseItem('player', inv.uid, 'rescue').ok; });
    return UI.rescuePrompt(Cards.handValue(focusHand('player').cards).total, opts).then(function (uid) {
      if (stale(ep)) return;
      if (!uid) { RT.rescue = false; return; }
      var it = ITEMS[findInv('player', uid).id];
      return gatherParams(it, uid, 'rescue').then(function (params) {
        if (stale(ep)) return;
        if (params === null) return rescuePlayer();
        return useItem('player', uid, params, 'rescue').then(function () {
          RT.rescue = false;
          if (G.player.lives <= 0 || stale(ep)) return;
          return rescuePlayer();
        });
      });
    }).then(function () { RT.rescue = false; });
  }

  function rescueOpp(tries) {
    tries = tries || 0;
    if (tries > 3 || !allBusted('opp') || G.phase !== 'play') return Promise.resolve();
    var choice = AI.decideRescue(E, def());
    if (!choice) return Promise.resolve();
    return useItem('opp', choice.uid, choice.params, 'rescue').then(function (used) {
      render();
      if (!used || G.opp.lives <= 0) return;
      return sleep(500).then(function () { return rescueOpp(tries + 1); });
    });
  }

  /** Resolves true if the round ended. */
  function checkBusts() {
    var ep = RT.epoch;
    if (!G || G.phase !== 'play') return Promise.resolve(true);
    return rescuePlayer().then(function () {
      if (stale(ep)) return true;
      return rescueOpp(0);
    }).then(function (r) {
      if (r === true || stale(ep)) return true;
      if (G.phase !== 'play') return true;
      if (G.player.lives <= 0 || G.opp.lives <= 0) { resolveRound('lifeloss'); return true; }
      if (allBusted('player') || allBusted('opp')) { resolveRound('bust'); return true; }
      render();
      return false;
    });
  }

  /* --------------------------- RESOLUTION --------------------------- */
  function resolveRound(reason) {
    if (!G || G.phase === 'resolve' || RT.settling) return;
    var pending = mysteries('player').length + mysteries('opp').length;
    if (pending && reason !== 'natural' && reason !== 'lifeloss') {
      var ep0 = RT.epoch;
      RT.settling = true; RT.busy = true; RT.rescue = false;
      clearTimeout(RT.oppTimer);
      G.turn = null;
      UI.closeModal();
      render();
      settleMysteries(ep0).then(function () {
        RT.settling = false;
        if (stale(ep0)) return;
        doResolve(reason);
      });
      return;
    }
    doResolve(reason);
  }

  /* ---------------- SCHRODINGER'S CARD ---------------- */
  function mysteries(w) {
    var out = [];
    (G[w].hands || []).forEach(function (h) { h.cards.forEach(function (c) { if (c.mystery) out.push({ hand: h, card: c }); }); });
    return out;
  }
  function settleOne(w, m, keep) {
    if (keep) {
      m.card.mystery = false;
      log(w, w === 'player' ? 'SCHRÖDINGER\'S CARD KEPT: ' + Cards.label(m.card) : 'OPPONENT KEPT THEIR SEALED CARD', 'reveal');
      return;
    }
    var i = Items.findCardIndex(m.hand, m.card.uid);
    if (i >= 0) m.hand.cards.splice(i, 1);
    var d = m.hand.drawn.indexOf(m.card.uid);
    if (d >= 0) m.hand.drawn.splice(d, 1);
    m.card.mystery = false;
    G.discardPile.push(m.card);
    log(w, (w === 'player' ? 'SCHRÖDINGER\'S CARD DISCARDED' : 'OPPONENT DISCARDED THEIR SEALED CARD') + ' (IT WAS ' + Cards.label(m.card) + ')', 'reveal');
  }
  function settleMysteries(ep) {
    var chain = Promise.resolve();
    mysteries('player').forEach(function (m) {
      chain = chain.then(function () {
        if (stale(ep)) return;
        return UI.chooseMystery(Cards.handValue(m.hand.cards).total).then(function (keep) {
          if (stale(ep)) return;
          settleOne('player', m, keep);
          render();
        });
      });
    });
    return chain.then(function () {
      if (stale(ep)) return;
      mysteries('opp').forEach(function (m) { settleOne('opp', m, AI.decideMystery(E, def(), m.hand)); });
      render();
    });
  }

  function doResolve(reason) {
    if (!G || G.phase === 'resolve') return;
    var ep = RT.epoch;
    if (reason === 'lifeloss') {
      ['player', 'opp'].forEach(function (w) { mysteries(w).forEach(function (m) { settleOne(w, m, false); }); });
    }
    clearTimeout(RT.oppTimer);
    G.phase = 'resolve';
    G.turn = null;
    RT.busy = true;
    RT.rescue = false;
    UI.closeModal();
    RT.revealOpp = true;
    FX.sfx('flip');
    render();

    var pB = allBusted('player'), oB = allBusted('opp');
    var pT = bestTotal('player'), oT = bestTotal('opp');
    var winner = null, why = '';

    if (reason === 'lifeloss') {
      winner = G.opp.lives <= 0 ? 'player' : 'opp';
      why = 'A LIFE LOST TO AN ITEM';
    } else if (reason === 'natural') {
      var pN = Cards.isNatural(G.player.hands[0].cards), oN = !G.opp.split && Cards.isNatural(G.opp.hands[0].cards);
      if (pN && oN) { winner = null; why = 'DOUBLE NATURAL'; }
      else { winner = pN ? 'player' : 'opp'; why = 'NATURAL BLACKJACK'; }
    } else if (pB && oB) { winner = null; why = 'BOTH BUST'; }
    else if (pB) { winner = 'opp'; why = 'YOU BUST'; }
    else if (oB) { winner = 'player'; why = 'OPPONENT BUSTS'; }
    else if (pT > oT) { winner = 'player'; why = pT + ' BEATS ' + oT; }
    else if (oT > pT) { winner = 'opp'; why = oT + ' BEATS ' + pT; }
    else { winner = null; why = 'TIED AT ' + pT; }

    var loser = winner ? other(winner) : null;
    var penalty = 0, applied = 0;
    if (loser && reason !== 'lifeloss') {
      penalty = CONFIG.basePenalty;
      if (G.player.doubled || G.opp.doubled) penalty = Math.max(penalty, CONFIG.doubleDownPenalty);
      if (G.fx.handSaw[loser] && !immune(loser) && allBusted(loser) && !allBusted(winner)) {
        penalty = Math.max(penalty, CONFIG.handSawPenalty);
        log(winner, 'HAND SAW: BUST COSTS ' + CONFIG.handSawPenalty + ' LIVES', 'trap');
      }
      penalty = Math.min(penalty, CONFIG.maxRoundPenalty);
      applied = loseLives(loser, penalty, 'round');
    }

    var earned = CONFIG.tokensPerWin * (traits().doubleEarnings ? 2 : 1);
    if (winner === 'player') { G.tokens += earned; G.stats.won += 1; FX.sfx('win'); }
    else if (winner === 'opp') { G.stats.lost += 1; }
    else { G.stats.drawn += 1; }

    var head = winner === 'player' ? 'ROUND WON' : winner === 'opp' ? 'ROUND LOST' : 'DRAW';
    G.lastResult = {
      head: head, why: why, winner: winner, penalty: penalty, applied: applied,
      pT: pT, oT: oT, pB: pB, oB: oB,
      oppHands: G.opp.hands.map(function (h) { return h.cards.map(Cards.cloneCard); }),
      tokens: winner === 'player' ? earned : 0
    };
    log('sys', 'OPPONENT REVEALS: ' + G.opp.hands.map(function (h) { return h.cards.map(Cards.label).join(' ') + ' (' + total(h) + ')'; }).join(' | '), 'reveal');
    log('sys', head + ' — ' + why + (applied ? ' · ' + (loser === 'player' ? 'YOU LOSE ' : 'OPPONENT LOSES ') + applied + (applied > 1 ? ' LIVES' : ' LIFE') : ''), winner === 'player' ? 'win' : winner === 'opp' ? 'lose' : 'sys');

    if (winner === 'opp') reactOpp(pB ? 'oppWin' : 'oppWin');
    else if (winner === 'player') reactOpp(oB ? 'oppBust' : 'oppLose');
    else reactOpp('draw');
    if (winner === 'player' && oB) setTimeout(function () { if (!stale(ep)) reactOpp('oppLose'); }, 1200);

    // Remember opening cards for CONTRABAND.
    G.player.prevInitial = G.player.initial.map(Cards.cloneCard);
    G.opp.prevInitial = G.opp.initial.map(Cards.cloneCard);

    // FLU SHOT counts down one round at a time.
    ['player', 'opp'].forEach(function (w) {
      if (G.fluShot[w] > 0) {
        G.fluShot[w] -= 1;
        if (!G.fluShot[w]) log(w, w === 'player' ? 'YOUR FLU SHOT HAS WORN OFF' : 'THEIR FLU SHOT HAS WORN OFF', 'sys');
      }
    });

    UI.banner(head, winner === 'player' ? 'good' : winner === 'opp' ? 'bad' : '');
    render();

    sleep(CONFIG.revealHoldMs).then(function () {
      if (stale(ep)) return;
      G.fx = newFx();
      RT.busy = false;
      finishMatchCheck();
    });
  }

  function finishMatchCheck() {
    if (G.opp.lives <= 0) return matchWon();
    if (G.player.lives <= 0) return tournamentLost();
    intermission();
  }

  /* --------------------------- INTERMISSION -------------------------- */
  function intermission() {
    G.phase = 'intermission';
    G.shop = { items: Items.randomIds(CONFIG.shopSize, { distinct: true }), bought: 0 };
    if (traits().hoarder && G.opp.inventory.length < CONFIG.inventoryMax) {
      G.opp.inventory.push(newInv(Items.randomIds(1, oppItemOpts())[0]));
      log('opp', def().name + ' SCAVENGED AN ITEM (HIDDEN) · NOW HOLDING ' + G.opp.inventory.length, 'item');
    }
    save();
    showIntermission();
    if (RNG.chance(0.35)) {
      setTimeout(function () { if (G.phase === 'intermission') UI.conductorWhisper(RNG.pick(Story.conductor.intermission)); }, 700);
    }
  }

  function showIntermission() {
    UI.showScreen(null);
    UI.setOpponent(def());
    RT.revealOpp = true;
    render();
    UI.showIntermission(G);
  }

  function buy(index) {
    if (!G || G.phase !== 'intermission') return;
    var id = G.shop.items[index];
    if (!id) return;
    if (G.shop.bought >= CONFIG.shopPurchasesPerIntermission) { UI.flashStatus('ONE PURCHASE PER BREAK'); return; }
    if (G.tokens < CONFIG.shopPrice) { UI.flashStatus('NOT ENOUGH TOKENS'); FX.sfx('error'); return; }
    if (G.player.inventory.length >= CONFIG.inventoryMax) { UI.flashStatus('INVENTORY FULL'); FX.sfx('error'); return; }
    G.tokens -= CONFIG.shopPrice;
    G.shop.bought += 1;
    G.shop.items[index] = null;
    G.player.inventory.push(newInv(id));
    log('player', 'BOUGHT ' + ITEMS[id].name, 'item');
    FX.sfx('item');
    save();
    render();
    UI.showIntermission(G);
  }

  /* --------------------------- MATCH END ---------------------------- */
  function matchWon() {
    var ep = RT.epoch;
    G.phase = 'matchResult';
    G.defeatedCount = G.matchIndex + 1;
    if (def().id === 'conductor') G.beatConductor = true;
    reactOpp('eliminated');
    FX.staticBurst(900, 0.5);
    UI.oppEliminated();
    render();
    sleep(1600).then(function () {
      if (stale(ep)) return;
      var last = G.matchIndex >= CONFIG.matches - 1;
      if (last) { tournamentWon(); return; }
      UI.showResult({
        kicker: 'MATCH ' + pad(G.matchIndex + 1) + ' / ' + pad(CONFIG.matches),
        title: 'VICTORY',
        sub: def().name + ' · ' + def().alias + ' HAS BEEN ELIMINATED. ' + (Story.conductor.matchWon[G.matchIndex] || ''),
        portrait: 'conductor',
        btn: 'NEXT COMPETITOR ▸'
      }).then(function () {
        if (stale(ep)) return;
        startMatch(G.matchIndex + 1);
      });
    });
  }

  function tournamentLost() {
    var ep = RT.epoch;
    G.phase = 'defeat';
    G.result = 'lose';
    clearSave();
    reactOpp('oppWin');
    FX.staticBurst(1200, 0.6);
    render();
    sleep(1600).then(function () {
      if (stale(ep)) return;
      UI.showResult({
        kicker: 'TOURNAMENT OVER · DEFEATED IN MATCH ' + pad(G.matchIndex + 1),
        title: 'DEFEAT',
        sub: Story.conductor.defeat,
        portrait: 'conductor',
        btn: 'RESTART',
        btn2: 'TITLE'
      }).then(function (which) {
        if (stale(ep)) return;
        if (which === 2) toTitle(); else newGame();
      });
    });
  }

  function tournamentWon() {
    var ep = RT.epoch;
    G.phase = 'final';
    G.result = 'win';
    clearSave();
    UI.showScreen('story');
    UI.playSequence((G.beatConductor ? Story.conductor.beatHim : []).concat(Story.conductor.final)).then(function () {
      if (stale(ep)) return;
      UI.showResult({
        kicker: 'TOURNAMENT COMPLETE · ' + G.stats.won + ' ROUNDS WON',
        title: 'YOU SURVIVED',
        sub: 'All three competitors eliminated. The House lets you go. This time.',
        portrait: 'conductor',
        btn: 'RESTART',
        btn2: 'TITLE'
      }).then(function (which) {
        if (stale(ep)) return;
        if (which === 2) toTitle(); else newGame();
      });
    });
  }

  /* ======================================================================
     11. PLAYER INPUT
     ====================================================================== */
  function playerAct(kind) {
    FX.unlockAudio();
    if (!G || G.phase !== 'play' || G.turn !== 'player' || RT.busy || RT.rescue) return;
    if (kind === 'item') { openItemPicker(); return; }
    var acts = availableActions('player', false);
    if (kind !== 'stand' && acts.indexOf(kind) < 0) { FX.sfx('error'); return; }
    if (isDone('player')) return;
    RT.busy = true;
    render();
    doAction('player', kind);
  }

  function openItemPicker() {
    if (!G) return;
    UI.openInventory(viewInventory(), function (uid) { playerUseItem(uid); });
  }

  function inspectItem(uid) {
    if (!G) return;
    UI.openInventory(viewInventory(), function (u) { playerUseItem(u); }, uid);
  }

  function playerUseItem(uid) {
    var win = playerWindow();
    var chk = canUseItem('player', uid, win);
    if (!chk.ok) { UI.flashStatus(chk.reason); FX.sfx('error'); return; }
    var it = ITEMS[findInv('player', uid).id];
    var ep = RT.epoch;
    gatherParams(it, uid, win).then(function (params) {
      if (params === null || stale(ep)) return;
      // Re-check: the situation may have changed while choosing.
      if (!canUseItem('player', uid, win).ok) return;
      RT.busy = true;
      render();
      return useItem('player', uid, params, win).then(function () {
        if (stale(ep)) return;
        if (G.phase === 'play') {
          if (G.player.lives <= 0) { resolveRound('lifeloss'); return; }
          return checkBusts().then(function (ended) {
            if (ended || stale(ep)) return;
            if (costsOf(it, params)) { nextTurn('player'); return; }
            RT.busy = false;
            save();
            render();
          });
        }
        RT.busy = false;
        if (G.opp.lives <= 0 || G.player.lives <= 0) { finishMatchCheck(); return; }
        save();
        render();
        if (G.phase === 'intermission') UI.showIntermission(G);
      });
    });
  }

  function primary() {
    FX.unlockAudio();
    if (!G) return;
    if (G.phase === 'matchIntro') beginIntake();
    else if (G.phase === 'prep') deal();
    else if (G.phase === 'intermission' && !RT.busy) { UI.hideOverlay(); startPrep(); }
  }

  /* ======================================================================
     12. VIEW MODEL (what ui.js draws)
     ====================================================================== */
  function viewInventory() {
    var win = playerWindow();
    return G.player.inventory.map(function (inv) {
      var it = ITEMS[inv.id];
      var chk = canUseItem('player', inv.uid, win);
      return { uid: inv.uid, id: inv.id, item: it, usable: chk.ok, reason: chk.reason };
    });
  }

  function buildView() {
    var d = def();
    var acts = availableActions('player', true);
    var shackled = G.fx.shackled.player;
    var myTurn = G.phase === 'play' && G.turn === 'player' && !RT.busy && !RT.rescue && !isDone('player');
    var inv = viewInventory();
    var anyUsable = inv.some(function (x) { return x.usable; });
    function btn(a) {
      var lock = shackled === a;
      return { enabled: myTurn && acts.indexOf(a) >= 0 && !lock, shackled: lock };
    }

    var primaryLabel = null;
    if (G.phase === 'matchIntro') primaryLabel = 'BEGIN MATCH ▸';
    else if (G.phase === 'prep') primaryLabel = RT.busy ? 'DEALING…' : 'DEAL ▸';
    else if (G.phase === 'intermission') primaryLabel = 'NEXT ROUND ▸';

    var status = 'STANDBY', turnTag = '—';
    if (G.phase === 'prep') { status = 'PRE-ROUND · ARM ITEMS OR DEAL'; turnTag = 'ROUND ' + pad(G.round); }
    else if (G.phase === 'play') {
      if (RT.rescue) { status = 'BUST · USE AN ITEM OR ACCEPT'; turnTag = 'BUST'; }
      else if (G.turn === 'player') {
        status = isDone('player') ? 'YOU ARE DONE' : (G.player.split ? 'YOUR TURN · HAND ' + (focusHandIndex('player') + 1) : 'YOUR TURN');
        turnTag = 'YOU';
      } else { status = isDone('player') ? 'YOU STOOD · OPPONENT PLAYING' : 'OPPONENT IS DECIDING…'; turnTag = 'OPPONENT'; }
    } else if (G.phase === 'resolve') { status = 'RESOLVING ROUND'; turnTag = 'REVEAL'; }
    else if (G.phase === 'intermission') { status = 'INTERMISSION · SHOP OPEN'; turnTag = 'BREAK'; }
    else if (G.phase === 'intake') { status = 'RECEIVE YOUR ITEMS'; turnTag = 'INTAKE'; }
    else if (G.phase === 'matchIntro') { status = 'NEW COMPETITOR'; turnTag = 'MATCH ' + pad(G.matchIndex + 1); }

    var effects = [];
    if (G.fx.tourniquet.player) effects.push({ t: 'TOURNIQUET ACTIVE · BLOCKS 1 LIFE', k: 'good' });
    if (G.tourniquetNext.player) effects.push({ t: 'TOURNIQUET READY FOR NEXT ROUND', k: 'good' });
    if (G.fx.handSaw.opp) effects.push({ t: 'HAND SAW SET ON OPPONENT', k: 'good' });
    if (G.fx.ratPoison.opp) effects.push({ t: 'RAT POISON SET ON OPPONENT', k: 'good' });
    if (G.fx.shackled.opp) effects.push({ t: 'OPPONENT ' + ACTION_NAMES[G.fx.shackled.opp] + ' LOCKED', k: 'good' });
    if (G.fx.handSaw.player) effects.push({ t: 'HAND SAW ON YOU · BUST COSTS 2', k: 'bad' });
    if (G.fx.ratPoison.player) effects.push({ t: 'RAT POISON ON YOU · NEXT ITEM COSTS 1', k: 'bad' });
    if (G.fx.shackled.player) effects.push({ t: 'YOUR ' + ACTION_NAMES[G.fx.shackled.player] + ' IS SHACKLED', k: 'bad' });
    if (immune('player')) effects.push({ t: 'FLU SHOT · IMMUNE ' + G.fluShot.player + (G.fluShot.player > 1 ? ' ROUNDS' : ' ROUND'), k: 'good' });
    if (immune('opp')) effects.push({ t: 'OPPONENT IMMUNE · ' + G.fluShot.opp + (G.fluShot.opp > 1 ? ' ROUNDS' : ' ROUND'), k: 'bad' });
    if (G.fx.clamped.opp) effects.push({ t: 'OPPONENT ITEMS CLAMPED', k: 'good' });
    if (G.fx.clamped.player) effects.push({ t: 'YOUR ITEMS ARE CLAMPED', k: 'bad' });
    if (traits().doubleEarnings) effects.push({ t: 'ROUND WINS PAY DOUBLE', k: 'warn' });
    if (G.player.doubled || G.opp.doubled) effects.push({ t: 'STAKES DOUBLED · ROUND COSTS 2', k: 'warn' });
    if (G.sealed.length) effects.push({ t: 'ZIPLOCK: ' + G.sealed.map(function (id) { return ITEMS[id].name; }).join(', '), k: 'warn' });

    var oppHands = G.opp.hands.map(function (h) {
      return { count: h.cards.length, cards: h.cards, total: total(h), bust: total(h) > 21, stood: h.stood };
    });
    var oppStatus = 'WAITING';
    if (G.phase === 'play') {
      if (allBusted('opp')) oppStatus = 'BUSTED';
      else if (isDone('opp')) oppStatus = 'STANDING';
      else if (G.turn === 'opp') oppStatus = 'THINKING';
      else oppStatus = 'WAITING';
    } else if (G.phase === 'resolve' || G.phase === 'intermission') oppStatus = 'REVEALED';
    else if (G.phase === 'matchResult') oppStatus = 'ELIMINATED';
    else if (G.phase === 'prep') oppStatus = 'WAITING FOR DEAL';

    var intel = G.player.intel;
    var burner = intel.burner ? (intel.burner + ' ' + CONFIG.burnerThreshold + (intel.burnerCount !== cardCount('opp') ? ' (STALE)' : '')) : null;

    return {
      phase: G.phase,
      round: G.round,
      match: G.matchIndex + 1,
      matches: CONFIG.matches,
      maxLives: CONFIG.maxLives,
      startingLives: CONFIG.startingLives,
      lives: { player: G.player.lives, opp: G.opp.lives },
      tokens: G.tokens,
      effects: effects,
      inventory: inv,
      invMax: CONFIG.inventoryMax,
      hands: G.player.hands.map(function (h, i) {
        var hv = Cards.handValue(h.cards);
        return { cards: h.cards, mystery: h.cards.filter(function (c) { return c.mystery; }).length, total: hv.total, soft: hv.soft, bust: hv.total > 21, stood: h.stood, natural: !G.player.split && i === 0 && Cards.isNatural(h.cards) && G.player.hands.length === 1 && h.drawn.length === 0 };
      }),
      activeHand: G.player.split && G.phase === 'play' && !isDone('player') ? focusHandIndex('player') : -1,
      split: G.player.split,
      doubled: G.player.doubled,
      buttons: {
        hit: btn('hit'), stand: { enabled: myTurn, shackled: false },
        double: btn('double'), split: btn('split'),
        item: { enabled: myTurn && anyUsable && shackled !== 'item', shackled: shackled === 'item' }
      },
      primary: primaryLabel,
      primaryBusy: RT.busy && G.phase === 'prep',
      status: status,
      turnTag: turnTag,
      myTurn: myTurn,
      opp: {
        def: d,
        hands: oppHands,
        reveal: RT.revealOpp,
        xray: RT.xrayCards,
        status: oppStatus,
        shackled: G.fx.shackled.opp ? ACTION_NAMES[G.fx.shackled.opp] : null,
        burner: burner,
        cardCount: cardCount('opp'),
        doubled: G.opp.doubled,
        split: G.opp.split,
        itemCount: G.opp.inventory.length,
        rage: rage(),
        startLives: startLivesFor(),
        twins: !!traits().twins
      },
      log: G.log,
      dread: G.player.lives <= 1 && G.phase !== 'title' ? 1 : (G.player.lives === 2 ? 0.5 : 0)
    };
  }

  function render() {
    if (!G || !UI) return;
    UI.render(buildView());
  }

  /* ======================================================================
     13. SAVE / LOAD
     ====================================================================== */
  var SAVEABLE = { matchIntro: 1, intake: 1, prep: 1, intermission: 1, play: 1 };
  function save() {
    if (!G || !SAVEABLE[G.phase]) return;
    try { window.localStorage.setItem(CONFIG.saveKey, JSON.stringify(G)); } catch (e) { /* storage unavailable */ }
  }
  function clearSave() {
    try { window.localStorage.removeItem(CONFIG.saveKey); } catch (e) { /* ignore */ }
  }
  function loadSave() {
    try {
      var raw = window.localStorage.getItem(CONFIG.saveKey);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== 2 || !SAVEABLE[s.phase] || !s.player || !s.opp) return null;
      return s;
    } catch (e) { return null; }
  }

  function continueGame() {
    var s = loadSave();
    if (!s) { UI.setTitleContinue(false); return; }
    cancelAsync();
    G = s;
    UI.showScreen(null);
    UI.setOpponent(def());
    if (G.phase === 'matchIntro') { showMatchIntro(); return; }
    if (G.phase === 'intake') { showIntake(); return; }
    if (G.phase === 'prep') { showPrep(); return; }
    if (G.phase === 'intermission') { showIntermission(); return; }
    if (G.phase === 'play') {
      RT.revealOpp = false;
      render();
      checkBusts().then(function (ended) {
        if (ended) return;
        if (isDone('player') && isDone('opp')) { resolveRound('compare'); return; }
        var t = G.turn && !isDone(G.turn) ? G.turn : other(G.turn || 'opp');
        nextTurn(other(t));
      });
    }
  }

  /* ======================================================================
     14. MENU / NAVIGATION
     ====================================================================== */
  function cancelAsync() {
    RT.epoch += 1;
    clearTimeout(RT.oppTimer);
    clearTimeout(RT.xrayTimer);
    RT.busy = false; RT.rescue = false; RT.xrayCards = null; RT.revealOpp = false; RT.settling = false;
    if (UI) { UI.closeModal(); UI.hideOverlay(); }
  }

  function toTitle() {
    save();
    cancelAsync();
    G = null;
    UI.showScreen('title');
    UI.setTitleContinue(!!loadSave());
  }

  function openMenu() {
    if (!G || G.phase === 'title' || G.phase === 'story') return;
    var safe = !!SAVEABLE[G.phase];
    UI.menu({
      sound: FX.settings.sound,
      fx: FX.settings.fx,
      canQuit: true,
      saveNote: safe ? 'Progress is saved automatically.' : 'Progress saves at the next round.'
    }).then(function (choice) {
      if (choice === 'how') UI.showInfo('how', function () { UI.showScreen(null); });
      else if (choice === 'restart') {
        UI.confirm('RESTART TOURNAMENT?', 'Your current run, lives, items and tokens will be lost.', 'RESTART').then(function (yes) { if (yes) newGame(); });
      } else if (choice === 'title') toTitle();
      else if (choice === 'sound') { FX.setSound(!FX.settings.sound); openMenu(); }
      else if (choice === 'fx') { FX.setFx(FX.settings.fx === 'full' ? 'low' : 'full'); openMenu(); }
    });
  }

  function onKey(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var k = (ev.key || '').toLowerCase();
    if (UI.handleKey(ev)) return;           // modal / story screens take priority
    if (!G) return;
    if (k === 'escape') { openMenu(); ev.preventDefault(); return; }
    if (k === 'enter') { primary(); return; }
    if (G.phase === 'play') {
      if (k === 'h') playerAct('hit');
      else if (k === 's') playerAct('stand');
      else if (k === 'd') playerAct('double');
      else if (k === 'p') playerAct('split');
      else if (k === 'i') openItemPicker();
    }
    if (/^[1-5]$/.test(k)) {
      var inv = G.player.inventory[parseInt(k, 10) - 1];
      if (inv) inspectItem(inv.uid);
    }
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ======================================================================
     15. BOOT
     ====================================================================== */
  function boot() {
    UI = H.UI;
    // Test hook: open the page with #conductor to face him next match.
    try { if (/conductor/i.test(window.location.hash || '')) RT.forceConductor = true; } catch (e) { /* ignore */ }
    FX.applyBodyClasses();
    // While an online match is on, input goes to mp.js instead.
    function online() { return !!(H.MP && H.MP.active()); }
    UI.init({
      onAction: function (k) { if (online()) H.MP.onAction(k); else playerAct(k); },
      onPrimary: function () { if (online()) H.MP.onPrimary(); else primary(); },
      onInspect: function (u) { if (online()) H.MP.onInspect(u); else inspectItem(u); },
      onUseItemFromPicker: playerUseItem,
      onBuy: function (i) { if (online()) H.MP.onBuy(i); else buy(i); },
      onIntro: beginIntake,
      onNewGame: function () { FX.unlockAudio(); newGame(); },
      onContinue: function () { FX.unlockAudio(); continueGame(); },
      onMenu: function () { if (online()) H.MP.onMenu(); else openMenu(); },
      onKey: function (ev) {
        if (online()) { if (ev.ctrlKey || ev.metaKey || ev.altKey) return; if (!UI.handleKey(ev)) H.MP.onKey(ev); }
        else onKey(ev);
      }
    });
    if (H.MP) H.MP.init(UI);
    UI.showScreen('title');
    UI.setTitleContinue(!!loadSave());
    FX.startAmbientGlitches(function () {
      return (G || online()) ? Array.prototype.slice.call(document.querySelectorAll('.monitor')) : [];
    }, function () { return G && G.player.lives <= 1 ? 1 : 0; });
  }

  // Debug / test hooks (harmless in production).
  H.Game = {
    get state() { return G; },
    runtime: RT,
    engine: E,
    newGame: newGame,
    startMatch: startMatch,
    beginIntake: beginIntake,
    deal: deal,
    playerAct: playerAct,
    playerUseItem: playerUseItem,
    primary: primary,
    buy: buy,
    view: function () { return G ? buildView() : null; },
    focusHand: focusHand,
    isDone: isDone,
    allBusted: allBusted,
    availableActions: availableActions,
    canUseItem: canUseItem,
    playerWindow: playerWindow,
    newInv: newInv,
    render: render,
    continueGame: continueGame,
    toTitle: toTitle,
    resolveRound: resolveRound,
    buildLineup: buildLineup
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.H21 = window.H21 || {});
