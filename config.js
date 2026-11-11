/* ==========================================================================
   HOUSE OF 21 — config.js
   Every tunable rule lives here so designers can rebalance without touching
   game logic. Classic script (no ES modules) so the game runs from file://
   on Chromebooks and offline.
   ========================================================================== */
(function (H) {
  'use strict';

  H.CONFIG = {
    // ---- Lives -----------------------------------------------------------
    startingLives: 3,          // both participants at the start of each match
    maxLives: 4,               // cap that LEFTOVERS can raise lives to

    // ---- Tournament ------------------------------------------------------
    matches: 3,                // competitors to defeat

    // ---- Inventory -------------------------------------------------------
    inventoryMax: 5,
    itemsPerMatch: 3,          // incoming items at the start of every match
    maxSealedItems: 3,         // ZIPLOCK BAG can hold at most this many

    // ---- Tokens / shop (fictional currency, no real money) ---------------
    startingTokens: 0,
    tokensPerWin: 1,
    shopSize: 3,
    shopPrice: 2,
    shopPurchasesPerIntermission: 1,

    // ---- Round penalties -------------------------------------------------
    basePenalty: 1,
    doubleDownPenalty: 2,
    handSawPenalty: 2,
    maxRoundPenalty: 2,        // a round result never costs more than this

    // ---- Item tuning -----------------------------------------------------
    xrayDurationMs: 5000,
    burnerThreshold: 15,
    placeboMin: 1,
    placeboMax: 5,
    guillotineMin: 1,
    guillotineMax: 5,
    allowBustRescue: true,     // offer REWIND / GAS / GUILLOTINE when you bust

    // ---- Pacing ----------------------------------------------------------
    opponentThinkMs: [750, 1350],
    dealStepMs: 260,
    revealHoldMs: 2400,
    maxActionsPerRound: 60,    // safety valve: forces both sides to stand

    // ---- Item rarity -----------------------------------------------------
    // weight = relative chance of each item of that tier being rolled.
    // color  = the tier colour used everywhere in the UI.
    rarities: {
      common:     { name: 'COMMON',     color: '#ece8dc', weight: 10 },
      uncommon:   { name: 'UNCOMMON',   color: '#8f938d', weight: 6 },
      rare:       { name: 'RARE',       color: '#e38a7e', weight: 3 },
      veryrare:   { name: 'VERY RARE',  color: '#a3342a', weight: 1.2 },
      contraband: { name: 'CONTRABAND', color: '#000000', weight: 0.4 }
    },
    rarityOrder: ['common', 'uncommon', 'rare', 'veryrare', 'contraband'],

    // ---- New item tuning -------------------------------------------------
    fluShotRounds: 3,
    russianDollMin: 1,
    russianDollMax: 10,
    pandoraChoices: 3,

    // ---- Competitors -----------------------------------------------------
    // One competitor per match is drawn from each tier (easier first).
    lineupTiers: [
      ['betty', 'bob', 'dennis', 'cassie', 'mark'],
      ['bryan', 'elaine', 'chuck', 'luisa', 'phil'],
      ['jack', 'sandra', 'hugo', 'twins']
    ],
    conductorChance: 0.000001,   // per match: one in a million
    sandraStealChance: 0.3,      // per Sandra turn, at most once per round

    // ---- Online multiplayer ----------------------------------------------
    mp: {
      startLives: 3, maxLives: 4, startItems: 3, inventoryMax: 5,
      turnMs: 30000,      // a turn left idle this long auto-stands
      askMs: 20000,       // time to answer a prompt (Dead Weight, mystery card)
      rescueMs: 15000,    // time to save a bust with an item
      interMs: 25000,     // break between rounds (shop open)
      revealMs: 4000,     // how long the round result stays on screen
      gatherMs: 15000,    // public match: wait this long for everyone to arrive
      shopSize: 3, shopPrice: 2, tokensPerWin: 1,
      logWindow: 8,       // log lines carried in each table update
      wireLimit: 3600     // bytes; the shared table must fit the 4 KiB presence
    },

    // ---- Storage ---------------------------------------------------------
    saveKey: 'house21.save.v1',
    settingsKey: 'house21.settings.v1'
  };
})(window.H21 = window.H21 || {});
