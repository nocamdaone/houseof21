/* ==========================================================================
   HOUSE OF 21 — opponents.js
   The competitor roster (data, quirks, dialogue, look, AI tuning) and the
   AI brain. Edit OPPONENTS to rename, re-voice or rebalance anyone.

   traits (quirks the engine understands):
     stoneFace       never reacts; face and voice stay flat
     gambler         flips coins between rounds
     hoarder         hoards items, scavenges one every break, then unloads
     impatient       angrier, faster and more reckless every round
     thief           may snatch one of your items during their turn
     twins           plays two hands every round
     doubleEarnings  your round wins against them pay double tokens
     allSeeing       knows your real total (The Conductor)
   items: { pool, onlyPool, tiers } restricts what they receive and use.
   lives: starting lives (default 3).

   Fair play: apart from allSeeing, the AI only reads its OWN cards plus
   what the player could also learn (card counts, actions, item readings).
   ========================================================================== */
(function (H) {
  'use strict';
  var Cards = H.Cards, RNG = H.RNG, ITEMS = H.Items.ITEMS;
  var CHANCE = H.Items.withTag('chance');
  var VALUE = H.Items.withTag('value');

  function aiCfg(o) {
    var base = {
      style: 'standard',
      standMin: 17, standMax: 17, softHitMax: 17,
      maxBustRisk: 0.5, reckless: 0.2, riskBase: 0.42,
      doubleTotals: [10, 11], doubleChance: 0.4,
      splitRanks: ['A', '8'],
      itemChance: 0.55, itemThreshold: 0.35, maxItemsPerRound: 2,
      itemWeights: {}, randomItems: false,
      rescueChance: 0.9, bluffChance: 0.15, chaos: 0.05
    };
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) base[k] = o[k];
    return base;
  }

  var OPPONENTS = [
    /* ---------------------------- TIER 1 ------------------------------- */
    {
      id: 'betty', name: 'BETTY', alias: 'THE NEIGHBOUR', tier: 1, personality: 'Polite and lost',
      dossier: 'Thought the advertisement was for a church bingo night. Still thinks that, mostly.',
      traitText: 'Really bad at this. Stands too early, hits too late, wastes items.',
      look: { head: 'round', skin: '#cfb29b', hair: 'bob', hairColor: '#7a4d2c', shirt: '#6f5a6a', collar: 'peter', extras: ['blushlight'] },
      traits: {},
      ai: aiCfg({ style: 'bad-timid', doubleTotals: [6, 7, 8, 15], doubleChance: 0.25, itemChance: 0.5, randomItems: true, rescueChance: 0.3, bluffChance: 0.05 }),
      lines: {
        intro: ['Oh! Hello. Is this where the bingo is?'],
        roundStart: ['Here we go again, I suppose.', 'Is it my turn? Oh, it is not.'],
        playerHit: ['Ooh, brave.'], playerHigh: ['Oh dear. Oh dear oh dear.'], playerStand: ['Lovely.'],
        bust: ['Oh, fiddlesticks.', 'Was that bad? That felt bad.'],
        win: ['Oh! Did I win that one?'], lose: ['Well, never mind.'],
        nervous: ['I would very much like to go home now.'], item: ['What does this one do?'],
        eliminated: ['Somebody feed my cat—']
      }
    },
    {
      id: 'bob', name: 'BOB', alias: 'THE REGULAR GUY', tier: 1, personality: 'Overconfident',
      dossier: 'Assistant manager at a tyre shop. Says he "basically counts cards." He does not.',
      traitText: 'Also really bad. Keeps hitting long after he should stop.',
      look: { head: 'round', skin: '#b99e88', hair: 'short', hairColor: '#6b5b4b', shirt: '#55644f', collar: 'polo', extras: ['mustache'] },
      traits: {},
      ai: aiCfg({ style: 'bad-greedy', doubleTotals: [5, 6, 7, 12, 13, 14], doubleChance: 0.3, splitRanks: ['10', 'K', 'Q', 'J', '5', '4'], itemChance: 0.6, randomItems: true, rescueChance: 0.4, bluffChance: 0.1 }),
      lines: {
        intro: ['Relax, pal. I play a lot of online poker.'],
        roundStart: ['Big hand coming. I can feel it.', 'Hit me. Wait, not yet.'],
        playerHit: ['Ha. Rookie move.'], playerHigh: ['That is... fine. That is fine.'], playerStand: ['Scared?'],
        bust: ['That card was cursed.', 'Okay, that one does not count.'],
        win: ['Told ya. Numbers guy.'], lose: ['I was letting you have that.'],
        nervous: ['Hey, can we talk about this?'], item: ['Pro move, watch this.'],
        eliminated: ['I basically had it—']
      }
    },
    {
      id: 'dennis', name: 'DENNIS', alias: 'THE INSOMNIAC', tier: 1, personality: 'Absent',
      dossier: 'Has not slept in four days. The hood has not come down once. Nobody has heard him speak.',
      traitText: 'Shows no reaction to anything. His face tells you nothing.',
      look: { head: 'narrow', skin: '#a39a89', hair: 'messy', hairColor: '#2a2724', shirt: '#363b37', hood: '#363b37', collar: 'none', extras: ['hood', 'bags', 'stubble'] },
      traits: { stoneFace: true },
      ai: aiCfg({ style: 'standard', itemChance: 0.5, bluffChance: 0 }),
      lines: { intro: ['…'] }
    },
    {
      id: 'cassie', name: 'CASSIE', alias: 'THE COUNTRY GIRL', tier: 1, personality: 'Stubborn',
      dossier: 'Drove three states for a job interview that turned out to be this. Has a rule for everything.',
      traitText: 'Stands on anything from 15 to 18. Every single time.',
      look: { head: 'small', skin: '#d0b49c', hair: 'braids', hairColor: '#d8b45a', shirt: '#7a4038', collar: 'open', hat: '#8a6a3e', extras: ['cowboyhat', 'freckles'] },
      traits: {},
      ai: aiCfg({ style: 'threshold', standMin: 15, standMax: 15, doubleTotals: [11], doubleChance: 0.5, itemChance: 0.5, bluffChance: 0.1 }),
      lines: {
        intro: ['Daddy always said: fifteen and you sit tight.'],
        roundStart: ['Alright, sugar. Deal.', 'Same rule as always.'],
        playerHit: ['Bless your heart.'], playerHigh: ['Well, shoot.'], playerStand: ['Smart.'],
        bust: ['Dang it.', 'That was not fifteen.'],
        win: ['Rules are rules, hon.'], lose: ['Huh. Rules failed me.'],
        nervous: ['I just want to see the sky again.'], item: ['Try this on for size.'],
        eliminated: ['Fifteen and you sit ti—']
      }
    },
    {
      id: 'mark', name: 'MARK', alias: 'THE FOUNDER', tier: 1, personality: 'Detached',
      dossier: 'Says he is "disrupting the basement space." Keeps asking if this table has an API.',
      traitText: 'Pays double. Every round you win against him earns 2 tokens.',
      look: { head: 'round', skin: '#d2bba6', hair: 'cropped', hairColor: '#3b2c22', shirt: '#6a6d70', collar: 'tee', eyeScale: 1.05 },
      traits: { doubleEarnings: true },
      ai: aiCfg({ style: 'standard', itemChance: 0.55, bluffChance: 0.2 }),
      baseExpr: 'neutral',
      lines: {
        intro: ['Interesting. Let us iterate on this.'],
        roundStart: ['Ship it.', 'Moving fast.'],
        playerHit: ['Bold growth strategy.'], playerHigh: ['Concerning metrics.'], playerStand: ['Conservative. Noted.'],
        bust: ['A learning experience.', 'We will pivot.'],
        win: ['Scale achieved.'], lose: ['Here. Take double. I can afford it.'],
        nervous: ['This is not sustainable.'], item: ['New feature rollout.'],
        eliminated: ['Connection terminat—']
      }
    },

    /* ---------------------------- TIER 2 ------------------------------- */
    {
      id: 'bryan', name: 'BRYAN', alias: 'THE HIGH ROLLER', tier: 2, personality: 'Compulsive gambler',
      dossier: 'Lost a house, a boat and a marriage on one long weekend. Calls it a "learning streak."',
      traitText: 'Only carries chance items: coins, dolls, sealed cards, boxes.',
      look: { head: 'wide', skin: '#b39a86', hair: 'none', browColor: '#5a4a3e', shirt: '#4a3e35', collar: 'open', extras: ['shine', 'doublechin', 'stubble'] },
      traits: { gambler: true },
      items: { pool: CHANCE, onlyPool: true },
      ai: aiCfg({ style: 'aggressive', standMin: 18, standMax: 19, softHitMax: 18, reckless: 0.3, doubleTotals: [9, 10, 11, 12], doubleChance: 0.55, splitRanks: ['A', '8', '9', '7', '6'], itemChance: 0.85, itemThreshold: 0.15, maxItemsPerRound: 3, itemWeights: { coinflip: 1.6, pandora: 1.6, russiandoll: 1.4, schrodinger: 1.3 }, rescueChance: 0.8, bluffChance: 0.25, chaos: 0.12 }),
      lines: {
        intro: ['Heads I win. Tails... we flip again.'],
        roundStart: ['Let it ride!', 'Feeling lucky. Always feeling lucky.'],
        playerHit: ['Yeah! Gamble!'], playerHigh: ['Ooh, you are sweating now.'], playerStand: ['Boring!'],
        bust: ['Worth it.', 'Double or nothing next time.'],
        win: ['The streak is real!'], lose: ['Variance. Pure variance.'],
        nervous: ['One more flip. Just one more.'], item: ['Let us see what fate says.'],
        eliminated: ['Double or noth—']
      }
    },
    {
      id: 'elaine', name: 'ELAINE', alias: 'THE SCAVENGER', tier: 2, personality: 'Watchful',
      dossier: 'Picked up off a bench outside the bus station. Her coat pockets hold more than they should.',
      traitText: 'Hoards items. Scavenges one every break, then unloads them all at once.',
      look: { head: 'round', skin: '#9e8c78', hair: 'messy-long', hairColor: '#5d5448', shirt: '#4b4a3d', collar: 'scarf', beanie: '#4b3b33', extras: ['dirt', 'bags', 'beanie'] },
      traits: { hoarder: true },
      ai: aiCfg({ style: 'standard', standMin: 17, standMax: 17, itemChance: 1, itemThreshold: 0, maxItemsPerRound: 5, bluffChance: 0.2 }),
      lines: {
        intro: ['Finders keepers. Everything is finders keepers.'],
        roundStart: ['Mine. All mine.', 'I will keep this one for later.'],
        playerHit: ['Greedy, greedy.'], playerHigh: ['You have something good. I can smell it.'], playerStand: ['Hm.'],
        bust: ['Waste.', 'Should have saved that.'],
        win: ['I will take that too.'], lose: ['I have more. I always have more.'],
        nervous: ['Time to empty the pockets.'], item: ['Been saving this.', 'Here. And here. And here.'],
        eliminated: ['My things—']
      }
    },
    {
      id: 'chuck', name: 'CHUCK', alias: 'THE SHORT FUSE', tier: 2, personality: 'Impatient',
      dossier: 'A perfectly normal man who honks at green lights. He is already annoyed that you are reading this.',
      traitText: 'Gets angrier, faster and more reckless every round.',
      look: { head: 'round', skin: '#bba08a', hair: 'short', hairColor: '#4b3a2a', shirt: '#3e4a5a', collar: 'polo', extras: ['blush', 'vein'] },
      traits: { impatient: true },
      ai: aiCfg({ style: 'impatient', doubleTotals: [9, 10, 11], doubleChance: 0.35, itemChance: 0.6, bluffChance: 0.15 }),
      lines: {
        intro: ['Can we hurry this up? I have places to be.'],
        roundStart: ['Come on.', 'Deal already.'],
        rage: ['DEAL THE CARDS.', 'HOW LONG DOES THIS TAKE.', 'I AM SO DONE WITH THIS.'],
        playerHit: ['Pick faster.'], playerHigh: ['Oh, of course.'], playerStand: ['Finally.'],
        bust: ['UNBELIEVABLE.', 'This deck hates me.'],
        win: ['About time.'], lose: ['Are you KIDDING me?'],
        nervous: ['Do not. Push me.'], item: ['Here. Happy?'],
        eliminated: ['THIS IS RIGG—']
      }
    },
    {
      id: 'luisa', name: 'LUISA', alias: 'THE MATRIARCH', tier: 2, personality: 'Steady',
      dossier: 'Raised five children and buried two husbands. A basement does not frighten her.',
      traitText: 'Starts every match with an extra life (4 lives).',
      lives: 4,
      look: { head: 'small', skin: '#a77c5f', hair: 'bun', hairColor: '#1d1714', shirt: '#5a3c4a', collar: 'open', scale: 0.9, extras: ['earrings'] },
      traits: {},
      ai: aiCfg({ style: 'cautious', standMin: 17, standMax: 18, maxBustRisk: 0.45, itemChance: 0.55, itemWeights: { leftovers: 1.4, tourniquet: 1.4, burner: 1.3, xray: 1.3 }, bluffChance: 0.15 }),
      lines: {
        intro: ['Mijo, sit down. You look tired.'],
        roundStart: ['Despacio.', 'Patience wins.'],
        playerHit: ['Careful.'], playerHigh: ['Ay, look at you.'], playerStand: ['Good choice.'],
        bust: ['Ay, no.', 'That was greedy of me.'],
        win: ['Lo siento, mijo.'], lose: ['Bien jugado.'],
        nervous: ['I have been through worse.'], item: ['Something from my purse.'],
        eliminated: ['Cuídate—']
      }
    },
    {
      id: 'phil', name: 'PHIL', alias: 'THE CALCULATOR', tier: 2, personality: 'Analytical',
      dossier: 'Third-year maths dropout. Has run the numbers on this room and does not like them.',
      traitText: 'Only carries value items: wild cards, cuts, swaps and readings.',
      look: { head: 'small', skin: '#c2ab98', hair: 'shaggy', hairColor: '#4a3a2c', shirt: '#56604f', collar: 'tee', eyeScale: 1.45, extras: ['bigglasses', 'pimples'] },
      traits: {},
      items: { pool: VALUE, onlyPool: true },
      ai: aiCfg({ style: 'calculated', riskBase: 0.4, doubleChance: 0.7, splitRanks: ['A', '8', '9'], itemChance: 0.7, itemThreshold: 0.35, itemWeights: { placebo: 1.6, burner: 1.4, russiandoll: 1.3, contraband: 1.4 }, bluffChance: 0.1, chaos: 0.03 }),
      lines: {
        intro: ['Statistically, one of us is leaving. Probably me. Probably.'],
        roundStart: ['Recalculating.', 'Expected value: grim.'],
        playerHit: ['That is a 38 percent bust chance, you know.'], playerHigh: ['High variance. Concerning.'], playerStand: ['Optimal. Annoyingly.'],
        bust: ['That was within the margin of error.', 'Ugh, the outlier.'],
        win: ['As predicted.'], lose: ['Recounting. Recounting.'],
        nervous: ['My odds are... my odds are...'], item: ['Adjusting the numbers.'],
        eliminated: ['Division by zer—']
      }
    },

    /* ---------------------------- TIER 3 ------------------------------- */
    {
      id: 'jack', name: 'JACK', alias: 'THE LIAR', tier: 3, personality: 'Deceptive',
      dossier: 'Six foot five and built like a coat hanger. Has a different story about why he is here every time you ask.',
      traitText: 'His face lies on purpose. Read it backwards, mostly.',
      look: { head: 'long', skin: '#b2a493', hair: 'slick', hairColor: '#2b2420', shirt: '#33302c', collar: 'none', extras: ['stubble'], neck: 'long' },
      traits: {},
      ai: aiCfg({ style: 'calculated', riskBase: 0.44, doubleChance: 0.6, splitRanks: ['A', '8', '9'], itemChance: 0.6, bluffChance: 0.85, chaos: 0.12 }),
      lines: {
        intro: ['I am terrible at cards. Truly. Go easy.'],
        roundStart: ['Oh no, bad hand already.', 'This is going great for me.'],
        playerHit: ['Please do not.'], playerHigh: ['Oh good, you have nothing.'], playerStand: ['Oh no.'],
        bust: ['All according to plan.'], win: ['Beginner\'s luck.'], lose: ['Perfect. Just as I wanted.'],
        nervous: ['I am completely calm.'], item: ['This does nothing, by the way.'],
        eliminated: ['I meant to do th—']
      }
    },
    {
      id: 'sandra', name: 'SANDRA', alias: 'THE NERVE', tier: 3, personality: 'Anxious',
      dossier: 'Former bank teller. Counts things when she is scared, and she is always scared. Her hands move on their own.',
      traitText: 'Nervous hands: may snatch an item straight out of your inventory.',
      look: { head: 'narrow', skin: '#c7b2a0', hair: 'long', hairColor: '#6b4a2f', shirt: '#5c6470', collar: 'cardigan', eyeScale: 1.12, extras: ['bags'] },
      traits: { thief: true },
      baseExpr: 'nervous',
      ai: aiCfg({ style: 'cautious', standMin: 16, standMax: 17, maxBustRisk: 0.4, itemChance: 0.65, bluffChance: 0.2 }),
      lines: {
        intro: ['Sorry. Sorry. I am just... sorry.'],
        roundStart: ['Okay. Okay okay okay.', 'Breathe. Count to four.'],
        playerHit: ['Oh no oh no.'], playerHigh: ['Please be bad. Please be bad.'], playerStand: ['Oh thank god.'],
        bust: ['I knew it. I knew it.'], win: ['Sorry! Sorry.'], lose: ['Of course. Of course.'],
        nervous: ['I cannot do this. I cannot.'], item: ['Is this allowed?'],
        steal: ['Sorry! It was just... sitting there.', 'I will give it back. Probably.'],
        eliminated: ['I am sorr—']
      }
    },
    {
      id: 'hugo', name: 'HUGO', alias: 'THE CROUPIER', tier: 3, personality: 'Professional',
      dossier: 'Dealt cards in four countries under six names. Claims he volunteered for this. Nobody believes him.',
      traitText: 'Only ever receives Rare items.',
      look: { head: 'long', skin: '#b4ab9a', hair: 'slick', hairColor: '#151514', shirt: '#2c2f33', collar: 'bowtie', extras: ['visor', 'cigarette'] },
      traits: {},
      items: { tiers: ['rare'] },
      ai: aiCfg({ style: 'calculated', riskBase: 0.42, doubleChance: 0.7, splitRanks: ['A', '8', '9'], itemChance: 0.65, itemThreshold: 0.4, itemWeights: { placebo: 1.5, handsaw: 1.3, viceclamp: 1.3, gloves: 1.2 }, bluffChance: 0.4, chaos: 0.08 }),
      lines: {
        intro: ['Relax. The deck has no memory. I do.'],
        roundStart: ['Shall we?', 'Fresh deck. Fresh lies.', 'Watch my hands, not my face.'],
        playerHit: ['Interesting.', 'Mm. I would not have.'], playerHigh: ['Careful. Greed has a smell.'], playerStand: ['Standing already? How trusting.'],
        bust: ['Ah. The deck disagreed.'], win: ['As expected.', 'You telegraph, you know.'], lose: ['Well played. Do not get used to it.'],
        nervous: ['Tick. Tock.'], item: ['A small adjustment.', 'House rules.'],
        eliminated: ['Deal me out, then—']
      }
    },
    {
      id: 'twins', name: 'FUCHSIA & TRISH', alias: 'THE TWINS', tier: 3, personality: 'Inseparable',
      dossier: 'Identical twins who finish each other\'s sentences, and hands. They insisted on sitting together.',
      traitText: 'Two players, two hands, every round. Their better hand counts.',
      look: { twins: true, head: 'small', skin: '#cdb39f', hair: 'pigtails', hairColor: '#3b2a22', ribbons: ['#b0407a', '#7d9a8a'], shirt: '#463a4a', collar: 'peter' },
      traits: { twins: true },
      ai: aiCfg({ style: 'calculated', riskBase: 0.46, itemChance: 0.6, bluffChance: 0.3, chaos: 0.08 }),
      lines: {
        intro: ['We play together.', 'We always play together.'],
        roundStart: ['Two hands.', 'Twice the fun.'],
        playerHit: ['Ooh.'], playerHigh: ['She thinks you are bluffing.'], playerStand: ['Done already?'],
        bust: ['Your fault.', 'No, yours.'], win: ['Together!'], lose: ['That was her hand.'],
        nervous: ['Do not let go.'], item: ['Our turn.'],
        eliminated: ['Hold my ha—']
      }
    },

    /* --------------------------- THE HOUSE ----------------------------- */
    {
      id: 'conductor', name: 'THE CONDUCTOR', alias: 'THE HOUSE', tier: 0, personality: 'Unknowable',
      dossier: 'You were not supposed to draw this seat. Almost nobody does. He has never lost at his own table.',
      traitText: 'Five lives. Sees your real total. Only carries Rare items or better.',
      lives: 5,
      special: true,
      look: { head: 'narrow', skin: '#141513', hair: 'none', shirt: '#070807', collar: 'conductor', eyeWhite: '#23241e', pupil: '#e6d6a6', mouthColor: '#4a4636', browColor: '#050505', extras: ['cap'] },
      traits: { allSeeing: true },
      items: { tiers: ['rare', 'veryrare', 'contraband'] },
      baseExpr: 'smug',
      ai: aiCfg({ style: 'house', doubleTotals: [9, 10, 11], doubleChance: 0.8, splitRanks: ['A', '8'], itemChance: 0.8, itemThreshold: 0.3, maxItemsPerRound: 3, rescueChance: 1, bluffChance: 0.5 }),
      lines: {
        intro: ['Well. It seems the House has taken a personal interest in you.'],
        roundStart: ['Shall we?', 'The deck is mine. As are you.'],
        playerHit: ['Yes. Take another.'], playerHigh: ['I know exactly what you hold.'], playerStand: ['A wise choice. Not wise enough.'],
        bust: ['Even I enjoy a surprise.'], win: ['Of course.'], lose: ['Remarkable.'],
        nervous: ['Do not mistake this for fear.'], item: ['A small courtesy from the House.'],
        eliminated: ['The House... remembers—']
      }
    }
  ];

  function byId(id) {
    for (var i = 0; i < OPPONENTS.length; i++) if (OPPONENTS[i].id === id) return OPPONENTS[i];
    return OPPONENTS[0];
  }

  /* ------------------------------------------------------------------ */
  /* Reading the table                                                   */
  /* ------------------------------------------------------------------ */
  function estimatePlayer(E, def) {
    if (def && def.traits.allSeeing) {
      var b = E.bestTotal('player');
      return b > 21 ? 0 : b;
    }
    var intel = E.side('opp').intel;
    var pc = E.cardCount('player');
    var est;
    if (intel.xray) {
      est = Cards.handValue(intel.xray).total + Math.max(0, pc - intel.xray.length) * 5;
    } else {
      est = 16 + (E.isDone('player') ? 2 : 0) + (pc >= 3 ? 1 : 0);
    }
    if (E.side('player').doubled) est = Math.max(est, 18);
    if (intel.burner && intel.burnerCount === pc) {
      if (intel.burner === 'BELOW') est = Math.min(est, 14);
      else if (intel.burner === 'EXACTLY') est = 15;
      else est = Math.max(est, 18);
    }
    return Math.max(4, Math.min(21, est));
  }

  function shouldSplit(hand, ai) {
    if (hand.cards.length !== 2 || hand.cards[0].rank !== hand.cards[1].rank) return false;
    return ai.splitRanks.indexOf(hand.cards[0].rank) >= 0;
  }

  /* ------------------------------------------------------------------ */
  /* Main action: hit / stand / double / split                            */
  /* ------------------------------------------------------------------ */
  function decideAction(E, def) {
    var ai = def.ai;
    var s = E.side('opp');
    var h = E.focusHand('opp');
    var hv = Cards.handValue(h.cards), t = hv.total;
    var acts = E.availableActions('opp', false);
    function can(a) { return acts.indexOf(a) >= 0; }

    if (t >= 21) return 'stand';
    if (E.cardCount('opp') >= 11) return 'stand';
    if (ai.style === 'threshold') return (t < ai.standMin && can('hit')) ? 'hit' : 'stand';
    if (can('split') && shouldSplit(h, ai)) return 'split';
    var rage = E.rage();
    var dChance = ai.doubleChance + (ai.style === 'impatient' ? rage * 0.4 : 0);
    if (can('double') && ai.doubleTotals.indexOf(t) >= 0 && RNG.chance(dChance)) return 'double';
    if (!can('hit')) return 'stand';

    var pool = E.unknownPool('opp');
    var pb = Cards.bustProbability(h.cards, pool);
    var est = estimatePlayer(E, def);
    var playerDone = E.isDone('player');
    var target = s.aiTarget || ai.standMin;
    var hit = false;

    switch (ai.style) {
      case 'cautious':
        if (hv.soft && t <= ai.softHitMax) hit = true;
        else if (t <= 11) hit = true;
        else if (t < target) hit = pb <= ai.maxBustRisk || (playerDone && est > t);
        else if (playerDone && est > t && pb < 0.6) hit = true;
        break;
      case 'aggressive':
        if (hv.soft && t <= ai.softHitMax) hit = true;
        else if (t < target) hit = true;
        else if (t <= 19 && RNG.chance(ai.reckless)) hit = true;
        else if (t === 20 && RNG.chance(0.04)) hit = true;
        if (hit && t >= 12 && t <= 16 && RNG.chance(ai.chaos)) hit = false;
        break;
      case 'calculated':
        if (t <= 11) hit = true;
        else if (hv.soft && t <= ai.softHitMax) hit = true;
        else if (playerDone) {
          if (t > est) hit = false;
          else if (t < est) hit = pb < 0.85;
          else hit = pb < 0.4;
        } else {
          hit = pb < ai.riskBase + (est >= 19 ? 0.1 : 0) - (t >= 17 ? 0.15 : 0);
        }
        if (t >= 13 && t <= 17 && RNG.chance(ai.chaos)) hit = !hit;
        break;
      case 'impatient':
        hit = t < 17 || (hv.soft && t <= 18) || (t <= 19 && RNG.chance(0.08 + rage * 0.45));
        if (playerDone && est > t && pb < 0.8) hit = true;
        break;
      case 'bad-timid':
        if (t <= 11) hit = RNG.chance(0.85);
        else if (t <= 16) hit = RNG.chance(0.35);
        else if (t <= 19) hit = RNG.chance(0.2);
        else hit = RNG.chance(0.04);
        break;
      case 'bad-greedy':
        if (t <= 18) hit = RNG.chance(0.95);
        else if (t === 19) hit = RNG.chance(0.45);
        else hit = RNG.chance(0.1);
        break;
      case 'house': {
        var p = estimatePlayer(E, def);
        if (E.allBusted('player')) hit = false;
        else if (playerDone) {
          if (t > p) hit = false;
          else if (t < p) hit = true;
          else hit = pb < 0.3;
        } else {
          hit = t < 17 || (hv.soft && t <= 17) || (p > t && pb < 0.55);
        }
        break;
      }
      default: // standard
        hit = (hv.soft && t <= ai.softHitMax) || t < target || (playerDone && est > t && pb < 0.6);
    }
    return hit ? 'hit' : 'stand';
  }

  /* ------------------------------------------------------------------ */
  /* Items during a turn                                                 */
  /* ------------------------------------------------------------------ */
  function allowed(def, id) {
    return !(def.items && def.items.onlyPool && def.items.pool.indexOf(id) < 0);
  }

  function scoreItem(id, E, ctx, def) {
    if (ITEMS[id].hostile && E.immune('player')) return 0;
    switch (id) {
      case 'leftovers': return ctx.lives < E.startLives() ? 0.9 : 0.25;
      case 'contraband': {
        var prev = E.side('opp').prevInitial;
        if (!prev) return 0;
        var pt = Cards.handValue(prev).total;
        return (pt >= 17 && pt > ctx.t + 1 && ctx.t < 17) ? 0.85 : 0;
      }
      case 'deadweight':
        if (ctx.t <= 11) return 0.55;
        if (ctx.playerDone && ctx.t <= 16) return 0.45;
        return 0.08;
      case 'xray': return (!ctx.intel.xray && !ctx.playerDone) ? 0.45 : 0.05;
      case 'burner': return ((!ctx.intel.burner || ctx.intel.burnerCount !== ctx.pc) && ctx.pc >= 3) ? 0.5 : 0.12;
      case 'ratpoison': return E.inventory('player').length >= 2 ? 0.55 : 0.35;
      case 'shackles': return ctx.playerDone ? 0 : (ctx.pc === 2 ? 0.6 : 0.45);
      case 'handsaw': return ctx.playerDone ? 0.1 : (ctx.pc >= 3 ? 0.65 : 0.35);
      case 'rewind': return (ctx.t >= 12 && ctx.t <= 16) ? 0.35 : 0;
      case 'placebo': {
        var need = 21 - ctx.t;
        if (need >= 1 && need <= 5) return 0.95;
        return ctx.t <= 11 ? 0.1 : 0;
      }
      case 'viceclamp': return ctx.playerDone ? 0.15 : (E.inventory('player').length >= 2 ? 0.55 : 0.3);
      case 'chokehold': return ctx.playerDone ? (ctx.est >= ctx.t ? 0.6 : 0.2) : 0.15;
      case 'flushot': return E.inventory('player').length >= 2 ? 0.5 : 0.2;
      case 'russiandoll': { var nd = 21 - ctx.t; return (ctx.t >= 11 && nd >= 1 && nd <= 10) ? 0.45 : 0.1; }
      case 'coinflip': return ctx.lives <= 1 ? (def.traits.gambler ? 0.4 : 0.02) : 0.3;
      case 'pandora': return 0.6;
      case 'schrodinger': return ctx.t <= 11 ? 0.55 : (ctx.t <= 14 ? 0.3 : 0.1);
      case 'gloves': return E.inventory('player').length ? 0.5 : 0;
      default: return 0;
    }
  }

  function bestRemoval(cards) {
    var known = cards.filter(function (c) { return !c.mystery; });
    var bestUid = null, bestT = -1;
    known.forEach(function (c) {
      var rest = cards.filter(function (x) { return x.uid !== c.uid; });
      var nt = Cards.handValue(rest).total;
      if (nt <= 21 && nt > bestT) { bestT = nt; bestUid = c.uid; }
    });
    return bestUid || (known[0] && known[0].uid);
  }
  function biggestCard(cards) {
    var b = null;
    cards.forEach(function (c) {
      if (c.mystery || Cards.cardValue(c) <= 1) return;
      if (!b || Cards.cardValue(c) > Cards.cardValue(b)) b = c;
    });
    return b;
  }

  function paramsFor(id, E, ctx, def) {
    var h = E.focusHand('opp');
    if (id === 'placebo') {
      var need = 21 - ctx.t;
      return { value: (need >= 1 && need <= 5) ? need : 5 };
    }
    if (id === 'russiandoll') {
      return { value: Math.max(H.CONFIG.russianDollMin, Math.min(H.CONFIG.russianDollMax, 21 - ctx.t)) };
    }
    if (id === 'gas') { var u = bestRemoval(h.cards); return u ? { cardUid: u } : null; }
    if (id === 'guillotine') { var b = biggestCard(h.cards); return b ? { cardUid: b.uid } : null; }
    if (id === 'pandora') {
      var offers = E.rollOffer('turn', true), best = null, bs = -1;
      offers.forEach(function (oid) {
        if (!E.virtualCanUse('opp', oid, 'turn').ok) return;
        var sc = scoreItem(oid, E, ctx, def) + RNG.next() * 0.1;
        if (sc > bs) { bs = sc; best = oid; }
      });
      if (!best) return null;
      var inner = paramsFor(best, E, ctx, def);
      return inner === null ? null : { choice: best, inner: inner };
    }
    return {};
  }

  function decideItem(E, def) {
    var s = E.side('opp');
    var inv = E.inventory('opp');
    if (!inv.length) { s.spree = false; return null; }
    var hoarder = def.traits.hoarder;
    if (hoarder) {
      if (inv.length >= H.CONFIG.inventoryMax || E.lives('opp') <= 1) s.spree = true;
      if (!s.spree) return null;
    } else if (s.itemsUsedThisRound >= def.ai.maxItemsPerRound) return null;

    var h = E.focusHand('opp');
    var ctx = {
      t: Cards.handValue(h.cards).total,
      pc: E.cardCount('player'),
      playerDone: E.isDone('player'),
      lives: E.lives('opp'),
      intel: s.intel,
      est: estimatePlayer(E, def)
    };
    var best = null, bestScore = 0;
    inv.forEach(function (it) {
      if (!allowed(def, it.id)) return;
      if (!E.canUseItem('opp', it.uid, 'turn').ok) return;
      var sc = def.ai.randomItems ? RNG.next()
        : scoreItem(it.id, E, ctx, def) * (def.ai.itemWeights[it.id] || 1) + RNG.next() * 0.15;
      if (hoarder && s.spree) sc += 1;
      if (sc > bestScore) { bestScore = sc; best = it; }
    });
    if (!best) return null;
    if (!(hoarder && s.spree)) {
      if (bestScore < def.ai.itemThreshold) return null;
      if (!RNG.chance(def.ai.itemChance)) return null;
    }
    var params = paramsFor(best.id, E, ctx, def);
    if (params === null) return null;
    return { uid: best.uid, id: best.id, params: params };
  }

  /* Between rounds: healing, tourniquet, flu shot, coin flips. */
  function decidePrep(E, def) {
    var out = [], taken = [];
    var inv = E.inventory('opp');
    var lives = E.lives('opp');
    var tr = def.traits;
    if (tr.hoarder && !E.side('opp').spree && lives > 1) return out;
    function usable(id) {
      if (!allowed(def, id)) return null;
      for (var i = 0; i < inv.length; i++) {
        if (inv[i].id === id && taken.indexOf(inv[i].uid) < 0 && E.canUseItem('opp', inv[i].uid, 'between').ok) return inv[i];
      }
      return null;
    }
    function add(it, params) { taken.push(it.uid); out.push({ uid: it.uid, id: it.id, params: params || {} }); }
    var left = usable('leftovers');
    if (left && lives < E.startLives() && RNG.chance(def.ai.style === 'cautious' ? 1 : 0.6)) add(left);
    var tq = usable('tourniquet');
    if (tq && lives <= 1 && inv.length >= 2 && RNG.chance(def.ai.style === 'aggressive' ? 0.5 : 0.9)) {
      var sac = null, low = 99;
      inv.forEach(function (it) {
        if (it.uid === tq.uid || taken.indexOf(it.uid) >= 0) return;
        var w = def.ai.itemWeights[it.id] || 1;
        if (w < low) { low = w; sac = it; }
      });
      if (sac) { taken.push(sac.uid); add(tq, { itemUid: sac.uid }); }
    }
    var fs = usable('flushot');
    if (fs && E.inventory('player').length >= 2 && RNG.chance(0.45)) add(fs);
    var cf = usable('coinflip');
    if (cf && tr.gambler && lives > 1 && RNG.chance(0.6)) add(cf);
    return out;
  }

  /* When busting: try to save the hand. */
  function decideRescue(E, def) {
    if (!RNG.chance(def.ai.rescueChance)) return null;
    var h = E.focusHand('opp');
    var t = Cards.handValue(h.cards).total;
    var inv = E.inventory('opp');
    function find(id) {
      if (!allowed(def, id)) return null;
      for (var i = 0; i < inv.length; i++) {
        if (inv[i].id === id && E.canUseItem('opp', inv[i].uid, 'rescue').ok) return inv[i];
      }
      return null;
    }
    var gas = find('gas');
    if (gas) {
      var u = bestRemoval(h.cards);
      if (u) return { uid: gas.uid, id: 'gas', params: { cardUid: u } };
    }
    var g = find('guillotine');
    var big = biggestCard(h.cards);
    if (g && big && t - 21 <= 3) return { uid: g.uid, id: 'guillotine', params: { cardUid: big.uid } };
    var rw = find('rewind');
    if (rw) return { uid: rw.uid, id: 'rewind', params: {} };
    if (g && big) return { uid: g.uid, id: 'guillotine', params: { cardUid: big.uid } };
    return null;
  }

  /* DEAD WEIGHT: keep the card that helps most, the other goes to the player. */
  function chooseDeadWeight(E, cards) {
    var h = E.focusHand('opp');
    var scores = cards.map(function (c) {
      var nt = Cards.handValue(h.cards.concat([c])).total;
      return nt <= 21 ? nt : -nt;
    });
    return scores[1] > scores[0] ? 1 : 0;
  }

  /* GLOVES with a full hand: give back the least wanted item. */
  function chooseGiveBack(E, def, invs) {
    var pick = invs[0], low = 99;
    invs.forEach(function (it) {
      var w = (def.ai.itemWeights[it.id] || 1) * (allowed(def, it.id) ? 1 : 0.1);
      if (w < low) { low = w; pick = it; }
    });
    return pick.uid;
  }

  /* SCHRODINGER'S CARD at the end of the round: keep or discard. */
  function decideMystery(E, def, hand) {
    if (def.ai.style.indexOf('bad') === 0) return RNG.chance(0.5);
    var t = Cards.handValue(hand.cards).total;
    if (E.allBusted('player')) return false;
    if (t <= 11) return true;
    var known = hand.cards.filter(function (c) { return !c.mystery; });
    var pb = Cards.bustProbability(known, E.unknownPool('opp'));
    var est = estimatePlayer(E, def);
    if (t > est) return pb < 0.15;
    return pb < 0.6;
  }

  /* ------------------------------------------------------------------ */
  /* Reactions (with bluffing)                                           */
  /* ------------------------------------------------------------------ */
  function line(def, key, p) {
    var arr = def.lines[key];
    if (!arr || !arr.length) return null;
    return RNG.chance(p === undefined ? 1 : p) ? RNG.pick(arr) : null;
  }

  /**
   * event: string. ctx: { oppTotal, playerTotal, oppLives, rage }
   * Returns { expr, line }.
   */
  function react(def, event, ctx) {
    if (def.traits.stoneFace) return { expr: event === 'eliminated' ? 'dead' : 'tired', line: null };
    var base = def.baseExpr || 'neutral';
    var bluff = RNG.chance(def.ai.bluffChance);
    var t = ctx.oppTotal || 0;
    var rage = ctx.rage || 0;
    function honestHand() {
      if (t >= 19) return 'smug';
      if (t >= 13) return RNG.chance(0.5) ? 'thinking' : 'nervous';
      return base;
    }
    function flip(e) {
      if (e === 'smug') return RNG.pick(['concerned', 'nervous']);
      if (e === 'nervous' || e === 'thinking' || e === 'concerned') return 'smug';
      return RNG.pick(['smug', 'concerned']);
    }
    function angry(r) {
      if (rage >= 0.55 && (r.expr === 'neutral' || r.expr === 'watch' || r.expr === 'relieved' || r.expr === 'thinking')) r.expr = 'frustrated';
      return r;
    }
    var out;
    switch (event) {
      case 'roundStart':
        if (rage >= 0.5) out = { expr: 'frustrated', line: line(def, 'rage', 0.8) };
        else out = { expr: ctx.oppLives <= 1 ? 'nervous' : base, line: ctx.oppLives <= 1 ? line(def, 'nervous', 0.8) : line(def, 'roundStart', 0.7) };
        break;
      case 'dealt': out = { expr: bluff ? flip(honestHand()) : honestHand(), line: null }; break;
      case 'playerHit':
        if (ctx.playerTotal >= 19 && ctx.playerTotal <= 21) out = { expr: bluff ? 'relieved' : 'concerned', line: line(def, 'playerHigh', 0.5) };
        else out = { expr: 'watch', line: rage >= 0.5 ? line(def, 'rage', 0.3) : line(def, 'playerHit', 0.25) };
        break;
      case 'playerStand': out = { expr: bluff ? 'concerned' : 'relieved', line: line(def, 'playerStand', 0.4) }; break;
      case 'oppDraw':
      case 'oppStand': { var e = honestHand(); out = { expr: bluff ? flip(e) : e, line: null }; break; }
      case 'oppItem': out = { expr: 'smug', line: line(def, 'item', 0.6) }; break;
      case 'oppBust': out = { expr: 'frustrated', line: line(def, 'bust') }; break;
      case 'oppWin': out = { expr: 'celebrate', line: line(def, 'win') }; break;
      case 'oppLose': out = { expr: ctx.oppLives <= 1 ? 'nervous' : 'hurt', line: ctx.oppLives <= 1 ? line(def, 'nervous') : line(def, 'lose') }; break;
      case 'draw': out = { expr: 'thinking', line: null }; break;
      case 'eliminated': return { expr: 'dead', line: line(def, 'eliminated') };
      default: out = { expr: ctx.oppLives <= 1 ? 'nervous' : base, line: null };
    }
    return angry(out);
  }

  H.Opponents = {
    LIST: OPPONENTS,
    byId: byId,
    regular: function () { return OPPONENTS.filter(function (o) { return !o.special; }); }
  };
  H.AI = {
    decideAction: decideAction,
    decideItem: decideItem,
    decidePrep: decidePrep,
    decideRescue: decideRescue,
    chooseDeadWeight: chooseDeadWeight,
    chooseGiveBack: chooseGiveBack,
    decideMystery: decideMystery,
    estimatePlayer: estimatePlayer,
    react: react
  };
})(window.H21 = window.H21 || {});
