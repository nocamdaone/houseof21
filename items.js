/* ==========================================================================
   HOUSE OF 21 — items.js
   The 22 items. Each item is data + two functions:
     canUse(E, who, win)     -> { ok, reason }
     apply(E, who, params)   -> effect (may return a Promise)
   `E` is the engine API exposed by game.js, so every item works for both
   the player ('player') and the AI ('opp').

   rarity:   common | uncommon | rare | veryrare | contraband  (see config.js)
   windows:  'turn'    = during your own turn in a hand
             'between' = preparation / intermission, before a deal
             'rescue'  = the moment you bust (only items listing it)
   costsAction: true -> using it ends your turn (may be a function of params)
   hostile:  true -> it targets the opponent, so FLU SHOT blocks it
   tags:     'chance' / 'value' item families (Bryan and Phil use these)
   ask:      what the player must choose before the item is consumed
   ========================================================================== */
(function (H) {
  'use strict';
  var C = function () { return H.CONFIG; };
  var Cards = H.Cards;

  function ok() { return { ok: true, reason: '' }; }
  function no(reason) { return { ok: false, reason: reason }; }

  /* Simple 24x24 line icons. Replace `icon` with an <img> tag later. */
  var I = {
    leftovers: '<path d="M4 10h16l-2 9H6z"/><path d="M8 10c0-3 2-5 4-5s4 2 4 5"/><path d="M10 6c-1-2 0-3 1-4M14 6c1-2 0-3-1-4"/>',
    contraband: '<rect x="3" y="8" width="18" height="12" rx="1"/><path d="M9 8V5h6v3"/><path d="M3 13h18"/><path d="M11 13v2h2v-2"/>',
    deadweight: '<path d="M7 9h10l3 11H4z"/><circle cx="12" cy="6" r="2.5"/><path d="M10 15h4"/>',
    xray: '<path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2"/>',
    ratpoison: '<path d="M9 3h6v4l2 3v11H7V10l2-3z"/><path d="M10 13l4 4M14 13l-4 4"/>',
    shackles: '<circle cx="7" cy="13" r="4"/><circle cx="17" cy="13" r="4"/><path d="M11 13h2"/><rect x="5" y="3" width="4" height="4"/>',
    handsaw: '<path d="M3 16L17 5l4 4-12 11H3z"/><path d="M6 16l1 2M9 14l1 2M12 11l1 2M15 9l1 2"/>',
    rewind: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 3v5h5"/><path d="M12 8v4l3 2"/>',
    burner: '<rect x="7" y="2" width="10" height="20" rx="2"/><rect x="9" y="5" width="6" height="7"/><path d="M10 16h4M10 19h4"/>',
    gas: '<rect x="7" y="6" width="10" height="15" rx="2"/><path d="M10 6V3h4v3"/><path d="M14 3h4v2"/><path d="M10 12h4"/>',
    placebo: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-30 12 12)"/><path d="M9 7l6 10"/>',
    tourniquet: '<rect x="3" y="9" width="18" height="6" rx="1"/><path d="M12 4v16"/><circle cx="12" cy="12" r="2"/>',
    ziplock: '<path d="M4 6h16v14H4z"/><path d="M4 9h16"/><path d="M8 4v4M16 4v4"/>',
    guillotine: '<path d="M5 2v20M19 2v20"/><path d="M5 8l14-3v5L5 13z"/><path d="M3 22h18"/>',
    viceclamp: '<path d="M3 6h6v12H3zM15 6h6v12h-6z"/><path d="M9 12h6"/><path d="M1 21h22"/><path d="M12 9v6"/>',
    chokehold: '<path d="M6 3c-3 6-3 12 0 18"/><path d="M18 3c3 6 3 12 0 18"/><path d="M5 9h14M5 15h14"/>',
    flushot: '<path d="M14 3l7 7"/><path d="M17.5 6.5L8 16l-3 1 1-3 9.5-9.5"/><path d="M11 9l2 2M9 11l2 2"/><path d="M5 17l-3 4"/>',
    russiandoll: '<ellipse cx="12" cy="15" rx="6" ry="6.5"/><circle cx="12" cy="6.5" r="4"/><circle cx="12" cy="6.5" r="1.5"/><path d="M7 14h10"/>',
    coinflip: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><path d="M12 9.5v5"/>',
    pandora: '<rect x="3" y="11" width="18" height="10"/><path d="M3 11l2-4h14l2 4"/><path d="M10 15h4"/><path d="M7 4l1 2M17 4l-1 2M12 1v3"/>',
    schrodinger: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M10 9a2 2 0 1 1 3 1.7c-1 .6-1 1.3-1 2.3"/><circle cx="12" cy="17" r=".6"/>',
    gloves: '<path d="M7 21v-7l-3-4V6h2v4"/><path d="M9 10V3h2v7"/><path d="M11 10V2h2v8"/><path d="M13 10V3h2v8l2-2 2 1-4 6v5"/>'
  };
  function icon(id) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (I[id] || '') + '</svg>';
  }

  /* Helpers shared by several items --------------------------------------- */
  function findCardIndex(hand, uid) {
    for (var i = 0; i < hand.cards.length; i++) if (hand.cards[i].uid === uid) return i;
    return -1;
  }
  function isReal(c) { return !!c && !c.wild && !c.mystery; }
  /** Most recently drawn real (deck) card still in the hand. */
  function lastDrawnReal(hand) {
    for (var i = hand.drawn.length - 1; i >= 0; i--) {
      var idx = findCardIndex(hand, hand.drawn[i]);
      if (idx >= 0 && isReal(hand.cards[idx])) return { idx: idx, d: i };
    }
    return null;
  }
  /** Most recent real card, falling back to the opening cards. */
  function lastRealCard(hand) {
    var r = lastDrawnReal(hand);
    if (r) return r;
    for (var i = hand.cards.length - 1; i >= 0; i--) if (isReal(hand.cards[i])) return { idx: i, d: -1 };
    return null;
  }
  function knownCards(hand) { return hand.cards.filter(function (c) { return !c.mystery; }); }
  function otherItems(E, who) { return E.inventory(who).length > 1; }
  /* Online matches pass logBoth so each side sees its own wording. */
  function say(E, who, mine, theirs, kind) {
    if (E.logBoth) { E.logBoth(who, mine, theirs, kind || 'item'); return; }
    E.log(who, who === 'player' ? mine : theirs, kind || 'item');
  }
  function lbl(c) { return c ? Cards.label(c) : '—'; }

  var ITEMS = {
    /* 1 ------------------------------------------------------------------ */
    leftovers: {
      name: 'LEFTOVERS', rarity: 'rare',
      desc: 'Gain +1 Life.',
      usage: 'Your turn or between rounds. Free action. Max ' + C().maxLives + ' lives.',
      windows: ['turn', 'between'], costsAction: false,
      canUse: function (E, who) {
        return E.lives(who) < E.maxLives(who) ? ok() : no('ALREADY AT MAXIMUM LIVES');
      },
      apply: function (E, who) {
        E.gainLife(who, 1);
        say(E, who, 'LEFTOVERS: +1 LIFE', 'LEFTOVERS: OPPONENT GAINS 1 LIFE');
      }
    },

    /* 2 ------------------------------------------------------------------ */
    contraband: {
      name: 'CONTRABAND', rarity: 'uncommon', tags: ['value'],
      desc: 'Swap your cards with the initial cards of the last round.',
      usage: 'Your turn, before you draw any extra card. Not after a split. Costs your action.',
      windows: ['turn'], costsAction: true,
      canUse: function (E, who) {
        var s = E.side(who);
        if (!s.prevInitial || s.prevInitial.length !== 2) return no('NO PREVIOUS ROUND TO SWAP WITH');
        if (s.split) return no('NOT AFTER A SPLIT');
        var h = s.hands[0];
        if (!h || h.drawn.length > 0) return no('ONLY BEFORE DRAWING EXTRA CARDS');
        for (var i = 0; i < s.initial.length; i++) {
          if (findCardIndex(h, s.initial[i].uid) < 0) return no('YOUR OPENING CARDS HAVE CHANGED');
        }
        return ok();
      },
      apply: function (E, who) {
        var s = E.side(who), h = s.hands[0];
        for (var i = 0; i < s.initial.length; i++) {
          var idx = findCardIndex(h, s.initial[i].uid);
          if (idx >= 0) { E.returnToDeck(h.cards[idx]); h.cards.splice(idx, 1); }
        }
        // Last round's opening cards come back from the deck when possible,
        // otherwise as a marked copy (the original is in play elsewhere).
        var incoming = [];
        for (var j = 0; j < s.prevInitial.length; j++) {
          var want = s.prevInitial[j];
          var card = E.takeFromDeck(want.uid);
          if (!card) {
            card = Cards.cloneCard(want);
            card.mod = null;
            card.mystery = false;
            card.uid = want.uid + '*' + E.nextSerial();
            card.smuggled = true;
          }
          incoming.push(card);
        }
        h.cards = incoming.concat(h.cards);
        s.initial = incoming.map(Cards.cloneCard);
        E.shuffleDeck();
        say(E, who, 'CONTRABAND: OPENING CARDS SWAPPED FOR ' + incoming.map(Cards.label).join(' '), 'CONTRABAND: OPENING CARDS SWAPPED (HIDDEN)');
      }
    },

    /* 3 ------------------------------------------------------------------ */
    deadweight: {
      name: 'DEAD WEIGHT', rarity: 'uncommon', tags: ['value'],
      desc: 'Gives you two cards, whichever card you pick is dealt to you, and the other is dealt to the opponent.',
      usage: 'Your turn. You must keep one card. Costs your action.',
      windows: ['turn'], costsAction: true,
      canUse: function (E) { return E.deckSize() >= 2 ? ok() : no('NOT ENOUGH CARDS IN THE DECK'); },
      apply: function (E, who) {
        var a = E.drawCard(), b = E.drawCard();
        return Promise.resolve(E.chooseDeadWeight(who, [a, b])).then(function (keepIndex) {
          var keep = keepIndex === 1 ? b : a;
          var give = keepIndex === 1 ? a : b;
          var target = E.other(who);
          E.addCard(who, keep, { drawn: true });
          if (E.immune(target)) {
            E.returnToDeck(give);
            E.shuffleDeck();
            say(E, who, 'DEAD WEIGHT: YOU KEPT ' + lbl(keep) + ' · FLU SHOT SENT THE OTHER BACK TO THE DECK',
              'DEAD WEIGHT: THEY KEPT A CARD · YOUR FLU SHOT SENT THE OTHER BACK', 'trap');
            return;
          }
          E.addCardToOther(target, give);
          say(E, who, 'DEAD WEIGHT: YOU KEPT ' + lbl(keep) + ' — OPPONENT GETS A CARD (HIDDEN)',
            'DEAD WEIGHT: OPPONENT KEPT A CARD (HIDDEN) — YOU RECEIVED ' + lbl(give));
        });
      }
    },

    /* 4 ------------------------------------------------------------------ */
    xray: {
      name: 'X-RAY', rarity: 'common', hostile: true,
      desc: 'Reveals both opponent cards temporarily.',
      usage: 'Your turn. Shows their opening cards for ' + (C().xrayDurationMs / 1000) + ' seconds. Costs your action.',
      windows: ['turn'], costsAction: true,
      canUse: function () { return ok(); },
      apply: function (E, who) {
        E.xray(who, E.other(who));
        say(E, who, 'X-RAY: OPPONENT OPENING CARDS EXPOSED', 'X-RAY: YOUR OPENING CARDS WERE EXPOSED TO THEM', 'reveal');
      }
    },

    /* 5 ------------------------------------------------------------------ */
    ratpoison: {
      name: 'RAT POISON', rarity: 'uncommon', hostile: true,
      desc: 'If the opponent uses an item this round, they lose one life.',
      usage: 'Your turn or before a deal. Passive trap for one round. Free action.',
      windows: ['turn', 'between'], costsAction: false,
      canUse: function (E, who) { return E.fx().ratPoison[E.other(who)] ? no('ALREADY SET THIS ROUND') : ok(); },
      apply: function (E, who) {
        E.fx().ratPoison[E.other(who)] = true;
        say(E, who, 'RAT POISON SET: THEIR NEXT ITEM COSTS THEM A LIFE', 'RAT POISON SET AGAINST YOU: YOUR NEXT ITEM COSTS A LIFE', 'trap');
      }
    },

    /* 6 ------------------------------------------------------------------ */
    shackles: {
      name: 'LOCKED SHACKLES', rarity: 'common', hostile: true,
      desc: 'Denies the opponent from using a random action this round.',
      usage: 'Your turn, while the opponent is still playing. Never locks STAND. Costs your action.',
      windows: ['turn'], costsAction: true,
      canUse: function (E, who) {
        var target = E.other(who);
        if (E.fx().shackled[target]) return no('THEY ARE ALREADY SHACKLED');
        if (E.isDone(target)) return no('OPPONENT HAS FINISHED THEIR HAND');
        return E.availableActions(target, true).length ? ok() : no('NOTHING LEFT TO LOCK');
      },
      apply: function (E, who) {
        var target = E.other(who);
        var action = H.RNG.pick(E.availableActions(target, true));
        E.fx().shackled[target] = action;
        say(E, who, 'SHACKLED: OPPONENT ' + E.actionName(action) + ' IS LOCKED THIS ROUND',
          'SHACKLED: YOUR ' + E.actionName(action) + ' IS LOCKED THIS ROUND', 'trap');
      }
    },

    /* 7 ------------------------------------------------------------------ */
    handsaw: {
      name: 'HAND SAW', rarity: 'rare', hostile: true,
      desc: 'If the opponent busts this round, they lose two lives.',
      usage: 'Your turn or before a deal. Passive trap for one round. Free action.',
      windows: ['turn', 'between'], costsAction: false,
      canUse: function (E, who) { return E.fx().handSaw[E.other(who)] ? no('ALREADY SET THIS ROUND') : ok(); },
      apply: function (E, who) {
        E.fx().handSaw[E.other(who)] = true;
        say(E, who, 'HAND SAW SET: IF THEY BUST, THEY LOSE 2', 'HAND SAW SET AGAINST YOU: IF YOU BUST, YOU LOSE 2', 'trap');
      }
    },

    /* 8 ------------------------------------------------------------------ */
    rewind: {
      name: 'REWIND', rarity: 'common', tags: ['chance'],
      desc: 'Returns your most recently drawn card to the deck and redraws.',
      usage: 'Your turn, or the moment you bust. Needs a drawn card. Costs your action (free when rescuing a bust).',
      windows: ['turn', 'rescue'], costsAction: true,
      canUse: function (E, who) {
        var h = E.focusHand(who);
        if (!h || !lastDrawnReal(h)) return no('YOU HAVE NOT DRAWN AN EXTRA CARD');
        return E.deckSize() >= 1 ? ok() : no('THE DECK IS EMPTY');
      },
      apply: function (E, who) {
        var h = E.focusHand(who), r = lastDrawnReal(h), removed = null;
        if (r) {
          removed = h.cards.splice(r.idx, 1)[0];
          h.drawn.splice(r.d, 1);
          E.returnToDeck(removed);
        }
        E.shuffleDeck();
        var fresh = E.drawCard();
        if (fresh) E.addCard(who, fresh, { drawn: true, hand: h });
        say(E, who, 'REWIND: ' + lbl(removed) + ' RETURNED, DREW ' + lbl(fresh), 'REWIND: A CARD WAS RETURNED AND REDRAWN (HIDDEN)');
      }
    },

    /* 9 ------------------------------------------------------------------ */
    burner: {
      name: 'BURNER PHONE', rarity: 'common', hostile: true, tags: ['value'],
      desc: 'Reveals whether your opponent\'s total is above or below 15.',
      usage: 'Your turn. The reading goes stale if they draw again. Costs your action.',
      windows: ['turn'], costsAction: true,
      canUse: function () { return ok(); },
      apply: function (E, who) {
        var target = E.other(who);
        var t = Cards.handValue(E.focusHand(target).cards).total;
        var th = C().burnerThreshold;
        var reading = t < th ? 'BELOW' : (t === th ? 'EXACTLY' : 'ABOVE');
        E.recordBurner(who, target, reading);
        say(E, who, 'BURNER PHONE: OPPONENT TOTAL IS ' + reading + ' ' + th + ' (AT ' + E.cardCount(target) + ' CARDS)',
          'BURNER PHONE: THEY LEARNED IF YOUR TOTAL IS ABOVE OR BELOW ' + th, 'reveal');
      }
    },

    /* 10 ----------------------------------------------------------------- */
    gas: {
      name: 'GAS CANISTER', rarity: 'uncommon', tags: ['value'],
      desc: 'Removes a card from your current hand.',
      usage: 'Your turn, or the moment you bust. Keep at least one card. Costs your action (free when rescuing a bust).',
      windows: ['turn', 'rescue'], costsAction: true,
      ask: 'card', askTitle: 'GAS CANISTER — choose a card to remove',
      canUse: function (E, who) {
        var h = E.focusHand(who);
        return h && knownCards(h).length >= 2 ? ok() : no('YOU MUST KEEP AT LEAST ONE CARD');
      },
      cardFilter: function (card) { return !card.mystery; },
      apply: function (E, who, params) {
        var h = E.focusHand(who);
        var idx = findCardIndex(h, params.cardUid);
        if (idx < 0 || h.cards[idx].mystery || knownCards(h).length < 2) return;
        var gone = h.cards.splice(idx, 1)[0];
        var d = h.drawn.indexOf(gone.uid);
        if (d >= 0) h.drawn.splice(d, 1);
        E.discard(gone);
        say(E, who, 'GAS CANISTER: ' + lbl(gone) + ' REMOVED', 'GAS CANISTER: A CARD WAS REMOVED (HIDDEN)');
      }
    },

    /* 11 ----------------------------------------------------------------- */
    placebo: {
      name: 'PLACEBO', rarity: 'rare', tags: ['value'],
      desc: 'A wild card that acts as any value from 1-5.',
      usage: 'Your turn. You pick the value; it stays fixed. Costs your action.',
      windows: ['turn'], costsAction: true,
      ask: 'value', askTitle: 'PLACEBO — choose the wild card value',
      askMin: C().placeboMin, askMax: C().placeboMax,
      canUse: function () { return ok(); },
      apply: function (E, who, params) {
        var v = Math.max(C().placeboMin, Math.min(C().placeboMax, params.value | 0 || 1));
        E.addCard(who, Cards.makeWild(v, 'placebo'), { drawn: false });
        say(E, who, 'PLACEBO: WILD CARD ADDED AS ' + v, 'PLACEBO: A WILD CARD WAS ADDED (VALUE HIDDEN)');
      }
    },

    /* 12 ----------------------------------------------------------------- */
    tourniquet: {
      name: 'TOURNIQUET', rarity: 'veryrare',
      desc: 'Prevents you from losing a life in the next round at the cost of discarding another item.',
      usage: 'Between rounds only. Sacrifice another item. Blocks 1 point of life loss next round. Free action.',
      windows: ['between'], costsAction: false,
      ask: 'item', askTitle: 'TOURNIQUET — choose an item to sacrifice',
      canUse: function (E, who) {
        if (E.tourniquetNext()[who]) return no('ALREADY APPLIED FOR NEXT ROUND');
        return otherItems(E, who) ? ok() : no('YOU NEED ANOTHER ITEM TO SACRIFICE');
      },
      apply: function (E, who, params) {
        var gone = E.removeInventory(who, params.itemUid);
        E.tourniquetNext()[who] = true;
        say(E, who, 'TOURNIQUET APPLIED (SACRIFICED ' + (gone ? ITEMS[gone.id].name : 'ITEM') + ')', 'TOURNIQUET APPLIED (AN ITEM WAS SACRIFICED)');
      }
    },

    /* 13 ----------------------------------------------------------------- */
    ziplock: {
      name: 'ZIPLOCK BAG', rarity: 'common', aiExclude: true,
      desc: 'Choose an item, that item will be held for you until the next match and replace one of the three new items.',
      usage: 'Your turn or between rounds. The sealed item returns as one of your 3 items next match. Free action.',
      windows: ['turn', 'between'], costsAction: false,
      ask: 'item', askTitle: 'ZIPLOCK BAG — choose an item to seal',
      canUse: function (E, who) {
        if (who !== 'player') return no('NO NEXT MATCH FOR THEM');
        if (E.sealedCount() >= C().maxSealedItems) return no('THE BAG IS FULL');
        if (E.isLastMatch()) return no('THERE IS NO NEXT MATCH');
        return otherItems(E, who) ? ok() : no('YOU NEED ANOTHER ITEM TO SEAL');
      },
      apply: function (E, who, params) {
        var it = E.removeInventory(who, params.itemUid);
        if (it) E.seal(it.id);
        E.log(who, 'ZIPLOCK BAG: ' + (it ? ITEMS[it.id].name : 'ITEM') + ' SEALED FOR NEXT MATCH', 'item');
      }
    },

    /* 14 ----------------------------------------------------------------- */
    guillotine: {
      name: 'GUILLOTINE', rarity: 'common', tags: ['chance', 'value'],
      desc: 'Subtracts a random number 1-5 from the value of a card in your hand.',
      usage: 'Your turn, or the moment you bust. Cards never drop below 1. Costs your action (free when rescuing a bust).',
      windows: ['turn', 'rescue'], costsAction: true,
      ask: 'card', askTitle: 'GUILLOTINE — choose a card to cut',
      canUse: function (E, who) {
        var h = E.focusHand(who);
        if (!h) return no('NO HAND');
        for (var i = 0; i < h.cards.length; i++) if (!h.cards[i].mystery && Cards.cardValue(h.cards[i]) > 1) return ok();
        return no('NO CARD CAN BE CUT FURTHER');
      },
      cardFilter: function (card) { return !card.mystery && Cards.cardValue(card) > 1; },
      apply: function (E, who, params) {
        var h = E.focusHand(who);
        var idx = findCardIndex(h, params.cardUid);
        if (idx < 0 || h.cards[idx].mystery) return;
        var card = h.cards[idx];
        var before = Cards.cardValue(card);
        var cut = H.RNG.int(C().guillotineMin, C().guillotineMax);
        card.mod = Math.max(1, before - cut);
        say(E, who, 'GUILLOTINE: ' + Cards.label(card) + ' CUT BY ' + cut + ' (' + before + ' → ' + card.mod + ')',
          'GUILLOTINE: ONE OF THEIR CARDS WAS CUT (HIDDEN)');
      }
    },

    /* 15 ----------------------------------------------------------------- */
    viceclamp: {
      name: 'VICE CLAMP', rarity: 'rare', hostile: true,
      desc: 'Prevents your opponent from using items for the remainder of the round.',
      usage: 'Your turn. Also stops their bust rescues. Costs your action.',
      windows: ['turn'], costsAction: true,
      canUse: function (E, who) { return E.fx().clamped[E.other(who)] ? no('ALREADY CLAMPED') : ok(); },
      apply: function (E, who) {
        E.fx().clamped[E.other(who)] = true;
        say(E, who, 'VICE CLAMP: OPPONENT CANNOT USE ITEMS THIS ROUND', 'VICE CLAMP: YOU CANNOT USE ITEMS THIS ROUND', 'trap');
      }
    },

    /* 16 ----------------------------------------------------------------- */
    chokehold: {
      name: 'CHOKEHOLD', rarity: 'uncommon', hostile: true, tags: ['chance'],
      desc: 'Forces your opponent to return their most recently drawn card to the deck and draw another.',
      usage: 'Your turn. Works even after they stand, and can bust them. Costs your action.',
      windows: ['turn'], costsAction: true,
      canUse: function (E, who) {
        var h = E.focusHand(E.other(who));
        if (!h || !lastRealCard(h)) return no('NO CARD TO TAKE');
        return E.deckSize() >= 1 ? ok() : no('THE DECK IS EMPTY');
      },
      apply: function (E, who) {
        var target = E.other(who), h = E.focusHand(target), r = lastRealCard(h);
        if (!r) return;
        var removed = h.cards.splice(r.idx, 1)[0];
        if (r.d >= 0) h.drawn.splice(r.d, 1);
        E.returnToDeck(removed);
        E.shuffleDeck();
        var fresh = E.drawCard();
        if (fresh) { h.cards.push(fresh); h.drawn.push(fresh.uid); }
        say(E, who, 'CHOKEHOLD: OPPONENT RETURNED A CARD AND DREW ANOTHER (HIDDEN)',
          'CHOKEHOLD: YOUR ' + lbl(removed) + ' WAS TAKEN · YOU DREW ' + lbl(fresh), 'trap');
      }
    },

    /* 17 ----------------------------------------------------------------- */
    flushot: {
      name: 'FLU SHOT', rarity: 'veryrare',
      desc: 'Become invulnerable to any items played against you for 3 rounds.',
      usage: 'Your turn or between rounds. Counts the current round and clears traps already set on you. Free action.',
      windows: ['turn', 'between'], costsAction: false,
      canUse: function (E, who) { return E.immune(who) ? no('ALREADY IMMUNE') : ok(); },
      apply: function (E, who) {
        E.startFluShot(who);
        var n = C().fluShotRounds;
        say(E, who, 'FLU SHOT: THEIR ITEMS CANNOT TOUCH YOU FOR ' + n + ' ROUNDS', 'FLU SHOT: YOUR ITEMS CANNOT TOUCH THEM FOR ' + n + ' ROUNDS');
      }
    },

    /* 18 ----------------------------------------------------------------- */
    russiandoll: {
      name: 'RUSSIAN DOLL', rarity: 'common', tags: ['chance', 'value'],
      desc: 'Choose a value. There is a 50% chance it is added to your hand and a 50% chance it is added to your opponent\'s hand.',
      usage: 'Your turn. Pick ' + C().russianDollMin + '-' + C().russianDollMax + ', then the doll decides who gets it. Costs your action.',
      windows: ['turn'], costsAction: true,
      ask: 'value', askTitle: 'RUSSIAN DOLL — choose a value',
      askMin: C().russianDollMin, askMax: C().russianDollMax,
      askText: 'Pick a value. The doll then opens: 50% it lands in your hand, 50% in your opponent\'s.',
      canUse: function () { return ok(); },
      apply: function (E, who, params) {
        var v = Math.max(C().russianDollMin, Math.min(C().russianDollMax, params.value | 0 || 1));
        var card = Cards.makeWild(v, 'doll');
        var target = E.other(who);
        var mine = H.RNG.chance(0.5);
        if (mine) {
          E.addCard(who, card, { drawn: false });
          if (who === 'player') E.announce('player', 'THE DOLL IS YOURS · ' + v, true);
          say(E, who, 'RUSSIAN DOLL (' + v + '): IT OPENED IN YOUR HAND', 'RUSSIAN DOLL: IT OPENED IN THEIR OWN HAND (VALUE HIDDEN)');
        } else if (E.immune(target)) {
          E.discard(card);
          say(E, who, 'RUSSIAN DOLL (' + v + '): IT ROLLED TO THEM · FLU SHOT BLOCKED IT', 'RUSSIAN DOLL: IT ROLLED TO YOU · YOUR FLU SHOT BLOCKED IT', 'trap');
        } else {
          E.addCardToOther(target, card);
          if (who === 'player') E.announce('player', 'THE DOLL IS THEIRS · ' + v, false);
          else E.announce('player', 'THEIR DOLL IS YOURS · ' + v, false);
          say(E, who, 'RUSSIAN DOLL (' + v + '): IT OPENED IN THE OPPONENT\'S HAND', 'RUSSIAN DOLL: IT OPENED IN YOUR HAND (' + v + ')');
        }
      }
    },

    /* 19 ----------------------------------------------------------------- */
    coinflip: {
      name: 'COIN FLIP', rarity: 'uncommon', tags: ['chance'],
      desc: 'Flip a coin. Heads grants +1 life. Tails remove 1 life.',
      usage: 'Your turn or between rounds. Tails can eliminate you. Free action.',
      windows: ['turn', 'between'], costsAction: false,
      canUse: function () { return ok(); },
      apply: function (E, who) {
        var heads = H.RNG.chance(0.5);
        E.announce(who, heads ? 'HEADS' : 'TAILS', heads);
        if (heads) {
          if (E.lives(who) < E.maxLives(who)) {
            E.gainLife(who, 1);
            say(E, who, 'COIN FLIP: HEADS · +1 LIFE', 'COIN FLIP: HEADS · OPPONENT GAINS 1 LIFE');
          } else {
            say(E, who, 'COIN FLIP: HEADS · ALREADY AT MAXIMUM LIVES', 'COIN FLIP: HEADS · NO EFFECT');
          }
        } else {
          var lost = E.loseLives(who, 1);
          say(E, who, 'COIN FLIP: TAILS · ' + (lost ? '-1 LIFE' : 'TOURNIQUET HELD'), 'COIN FLIP: TAILS · ' + (lost ? 'OPPONENT LOSES 1 LIFE' : 'THEIR TOURNIQUET HELD'), 'trap');
        }
      }
    },

    /* 20 ----------------------------------------------------------------- */
    pandora: {
      name: 'PANDORA\'S BOX', rarity: 'contraband', tags: ['chance'],
      desc: 'Select one item from three random items for free, and use it immediately.',
      usage: 'Your turn or between rounds. The chosen item takes effect at once and follows its own action rules.',
      windows: ['turn', 'between'],
      costsAction: function (params) {
        var inner = params && ITEMS[params.choice];
        return inner ? costsOf(inner, params.inner) : false;
      },
      ask: 'pandora', askTitle: 'PANDORA\'S BOX — take one',
      canUse: function () { return ok(); },
      apply: function (E, who, params) {
        var inner = ITEMS[params.choice];
        if (!inner) return;
        say(E, who, 'PANDORA\'S BOX: YOU TOOK ' + inner.name, 'PANDORA\'S BOX: THEY TOOK ' + inner.name);
        return E.applyVirtual(who, params.choice, params.inner || {});
      }
    },

    /* 21 ----------------------------------------------------------------- */
    schrodinger: {
      name: 'SCHRÖDINGER\'S CARD', rarity: 'rare', tags: ['chance'],
      desc: 'Draw a mystery card. Its value remains hidden until the round concludes. You can choose to keep it or discard it before resolving your hand.',
      usage: 'Your turn. It does not count toward your total (or a bust) until you keep it at the end of the round. Costs your action.',
      windows: ['turn'], costsAction: true,
      canUse: function (E) { return E.deckSize() >= 1 ? ok() : no('THE DECK IS EMPTY'); },
      apply: function (E, who) {
        var c = E.drawCard();
        if (!c) return;
        c.mystery = true;
        E.addCard(who, c, { drawn: true });
        say(E, who, 'SCHRÖDINGER\'S CARD: A SEALED CARD JOINS YOUR HAND', 'SCHRÖDINGER\'S CARD: THEY DREW A SEALED CARD');
      }
    },

    /* 22 ----------------------------------------------------------------- */
    gloves: {
      name: 'GLOVES', rarity: 'rare', hostile: true,
      desc: 'Steal an item from the opponents inventory. If you have 5 items you must replace the item you take with one of yours.',
      usage: 'Your turn or between rounds. Takes one of their items at random. Free action.',
      windows: ['turn', 'between'], costsAction: false,
      canUse: function (E, who) { return E.inventory(E.other(who)).length ? ok() : no('THEY HAVE NOTHING TO STEAL'); },
      apply: function (E, who) {
        var target = E.other(who), mine = E.inventory(who), theirs = E.inventory(target);
        if (!theirs.length) return;
        // The gloves (or the box they came from) were already used up, so
        // a full hand at the moment of playing means mine.length + 1 >= max.
        var wasFull = mine.length + 1 >= C().inventoryMax;
        var stolen = theirs.splice(Math.floor(H.RNG.next() * theirs.length), 1)[0];
        stolen.offer = null;
        mine.push(stolen);
        say(E, who, 'GLOVES: YOU STOLE THEIR ' + ITEMS[stolen.id].name, 'GLOVES: THEY STOLE YOUR ' + ITEMS[stolen.id].name, 'trap');
        if (!wasFull) return;
        var options = mine.filter(function (x) { return x.uid !== stolen.uid; });
        if (!options.length) return;
        return Promise.resolve(E.chooseGiveBack(who, options)).then(function (uid) {
          var back = E.removeInventory(who, uid) || E.removeInventory(who, options[0].uid);
          if (!back) return;
          back.offer = null;
          theirs.push(back);
          say(E, who, 'GLOVES: HANDS FULL · YOU GAVE THEM ' + ITEMS[back.id].name, 'GLOVES: HANDS FULL · THEY GAVE YOU ' + ITEMS[back.id].name);
        });
      }
    }
  };

  function costsOf(it, params) {
    return typeof it.costsAction === 'function' ? !!it.costsAction(params || {}) : !!it.costsAction;
  }

  // Attach ids + icons.
  Object.keys(ITEMS).forEach(function (id) {
    ITEMS[id].id = id;
    ITEMS[id].icon = icon(id);
    ITEMS[id].tags = ITEMS[id].tags || [];
  });

  var ALL_IDS = Object.keys(ITEMS);

  /* Weighted drops ---------------------------------------------------------
     opts: ai (skip aiExclude), pool (ids), tiers (rarity keys),
           window (must be usable then), exclude (ids), distinct (no repeats) */
  function candidates(opts) {
    return ALL_IDS.filter(function (id) {
      var it = ITEMS[id];
      if (opts.ai && it.aiExclude) return false;
      if (opts.pool && opts.pool.indexOf(id) < 0) return false;
      if (opts.tiers && opts.tiers.indexOf(it.rarity) < 0) return false;
      if (opts.window && it.windows.indexOf(opts.window) < 0) return false;
      if (opts.exclude && opts.exclude.indexOf(id) >= 0) return false;
      return true;
    });
  }
  function weightOf(id) {
    var r = C().rarities[ITEMS[id].rarity];
    return r ? r.weight : 1;
  }
  function pickWeighted(cands) {
    var total = 0, i;
    for (i = 0; i < cands.length; i++) total += weightOf(cands[i]);
    var roll = H.RNG.next() * total;
    for (i = 0; i < cands.length; i++) {
      roll -= weightOf(cands[i]);
      if (roll < 0) return cands[i];
    }
    return cands[cands.length - 1];
  }
  function randomIds(n, opts) {
    if (typeof opts === 'boolean') opts = { ai: opts };
    opts = opts || {};
    var cands = candidates(opts), out = [];
    for (var i = 0; i < n && cands.length; i++) {
      var id = pickWeighted(cands);
      out.push(id);
      if (opts.distinct) cands = cands.filter(function (x) { return x !== id; });
    }
    return out;
  }
  function withTag(tag) { return ALL_IDS.filter(function (id) { return ITEMS[id].tags.indexOf(tag) >= 0; }); }
  function rarityOf(id) { return C().rarities[ITEMS[id].rarity]; }
  function byRarity(a, b) {
    var o = C().rarityOrder;
    return o.indexOf(ITEMS[a].rarity) - o.indexOf(ITEMS[b].rarity);
  }

  H.Items = {
    ITEMS: ITEMS,
    ALL_IDS: ALL_IDS,
    get: function (id) { return ITEMS[id]; },
    icon: icon,
    randomIds: randomIds,
    withTag: withTag,
    rarityOf: rarityOf,
    byRarity: byRarity,
    costsOf: costsOf,
    findCardIndex: findCardIndex,
    lastDrawnReal: lastDrawnReal,
    isReal: isReal
  };
})(window.H21 = window.H21 || {});
