/* ==========================================================================
   HOUSE OF 21 — cards.js
   Deck generation, shuffling, randomness and blackjack hand maths.
   Pure logic: no DOM access.
   ========================================================================== */
(function (H) {
  'use strict';

  var SUITS = [
    { key: 'S', sym: '♠', name: 'Spades', red: false },
    { key: 'H', sym: '♥', name: 'Hearts', red: true },
    { key: 'D', sym: '♦', name: 'Diamonds', red: true },
    { key: 'C', sym: '♣', name: 'Clubs', red: false }
  ];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var RANK_NAMES = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };

  /* ---------------- Randomness ---------------- */
  var RNG = {
    next: function () {
      try {
        if (window.crypto && window.crypto.getRandomValues) {
          var a = new Uint32Array(1);
          window.crypto.getRandomValues(a);
          return a[0] / 4294967296;
        }
      } catch (e) { /* fall through */ }
      return Math.random();
    },
    int: function (min, max) { return min + Math.floor(RNG.next() * (max - min + 1)); },
    pick: function (arr) { return arr[Math.floor(RNG.next() * arr.length)]; },
    chance: function (p) { return RNG.next() < p; },
    shuffle: function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(RNG.next() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
  };

  function suitOf(key) {
    for (var i = 0; i < SUITS.length; i++) if (SUITS[i].key === key) return SUITS[i];
    return SUITS[0];
  }

  function makeCard(rank, suitKey) {
    var s = suitOf(suitKey);
    return { uid: rank + s.key, rank: rank, suit: s.key, sym: s.sym, red: s.red, mod: null, wild: false, smuggled: false };
  }

  /** A fresh, ordered standard 52-card deck. */
  function createDeck() {
    var d = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < RANKS.length; r++) d.push(makeCard(RANKS[r], SUITS[s].key));
    }
    return d;
  }

  function freshShuffledDeck() { return RNG.shuffle(createDeck()); }

  var wildCounter = 0;
  /** PLACEBO wild card. Not part of the 52-card deck. */
  function makeWild(value, kind) {
    wildCounter += 1;
    return { uid: 'W' + Date.now().toString(36) + wildCounter, rank: 'W', suit: 'W', sym: '✱', red: false, mod: value, wild: true, smuggled: false, kind: kind || 'placebo' };
  }

  /* ---------------- Values ---------------- */
  function baseValue(card) {
    if (card.wild) return card.mod;
    if (card.rank === 'A') return 11;
    if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
    return parseInt(card.rank, 10);
  }

  /** Ace that can still flip between 11 and 1 (not modified by GUILLOTINE). */
  function isFlexibleAce(card) { return card.rank === 'A' && !card.wild && card.mod === null; }

  /** Face value used for display, split checks and GUILLOTINE. Aces = 11. */
  function cardValue(card) { return card.mod !== null ? card.mod : baseValue(card); }

  /** Best blackjack total of a list of cards. */
  function handValue(cards) {
    var total = 0, soft = 0;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.mystery) continue; // SCHRODINGER'S CARD: sealed until the round ends
      if (isFlexibleAce(c)) { total += 11; soft += 1; } else { total += cardValue(c); }
    }
    while (total > 21 && soft > 0) { total -= 10; soft -= 1; }
    return { total: total, soft: soft > 0 };
  }

  function isNatural(cards) {
    if (cards.length !== 2) return false;
    for (var i = 0; i < 2; i++) if (cards[i].wild || cards[i].mod !== null) return false;
    return handValue(cards).total === 21;
  }

  /** Probability that one more card from `pool` busts this hand. */
  function bustProbability(cards, pool) {
    if (!pool.length) return 1;
    var busts = 0;
    for (var i = 0; i < pool.length; i++) {
      if (handValue(cards.concat([pool[i]])).total > 21) busts += 1;
    }
    return busts / pool.length;
  }

  /* ---------------- Labels ---------------- */
  function rankLabel(card) { return card.wild ? (card.kind === 'doll' ? 'D' : 'W') : card.rank; }
  function label(card) {
    if (card.mystery) return '??';
    return card.wild ? ((card.kind === 'doll' ? 'DOLL ' : 'WILD ') + card.mod) : card.rank + card.sym;
  }
  function fullName(card) {
    if (card.mystery) return "Schrodinger's card (sealed until the round ends)";
    if (card.wild) return (card.kind === 'doll' ? 'Russian doll card' : 'Placebo wild card') + ' (counts as ' + card.mod + ')';
    var n = (RANK_NAMES[card.rank] || card.rank) + ' of ' + suitOf(card.suit).name;
    if (card.mod !== null) n += ' (cut to ' + card.mod + ')';
    if (card.smuggled) n += ' [contraband copy]';
    return n;
  }
  function describeValue(card) {
    if (card.mystery) return 'Value hidden. Keep or discard it when the round ends.';
    if (card.wild) return 'Counts as ' + card.mod + '.';
    if (card.mod !== null) return 'Fixed value ' + card.mod + '.';
    if (card.rank === 'A') return 'Counts as 11, or 1 if 11 would bust you.';
    return 'Counts as ' + baseValue(card) + '.';
  }

  function cloneCard(c) {
    return { uid: c.uid, rank: c.rank, suit: c.suit, sym: c.sym, red: c.red, mod: c.mod, wild: c.wild, smuggled: c.smuggled, kind: c.kind, mystery: !!c.mystery };
  }

  H.RNG = RNG;
  H.Cards = {
    SUITS: SUITS,
    RANKS: RANKS,
    createDeck: createDeck,
    freshShuffledDeck: freshShuffledDeck,
    makeCard: makeCard,
    makeWild: makeWild,
    baseValue: baseValue,
    cardValue: cardValue,
    handValue: handValue,
    isNatural: isNatural,
    isFlexibleAce: isFlexibleAce,
    bustProbability: bustProbability,
    rankLabel: rankLabel,
    label: label,
    fullName: fullName,
    describeValue: describeValue,
    cloneCard: cloneCard
  };
})(window.H21 = window.H21 || {});
