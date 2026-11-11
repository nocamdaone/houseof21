/* ==========================================================================
   HOUSE OF 21 — story.js
   All narrative text. Speaker 'narrator' or 'conductor'.
   ========================================================================== */
(function (H) {
  'use strict';

  H.Story = {
    intro: [
      { who: 'narrator', tag: 'I. ARREARS', text: 'The bills stopped arriving as envelopes. They became a sound: the phone, every hour, the same polite voice asking for money you do not have.' },
      { who: 'narrator', tag: 'II. THE ADVERTISEMENT', text: '3:12 A.M. Between two job listings, a banner glows. EASY SIGN-UP. INSTANT PAYOUTS. THE HOUSE ALWAYS PAYS YOU.' },
      { who: 'narrator', tag: 'III. INSTALLATION', glitch: true, text: 'You click. A progress bar opens that you never asked for. INSTALLING: CONDUCTOR.EXE. You pull the power cable. The bar keeps filling.' },
      { who: 'narrator', tag: 'IV. THE KNOCK', text: 'Later that night there is a knock you do not remember answering. A sweet chemical smell. The floor tilts away from you. Then nothing.' },
      { who: 'narrator', tag: 'V. THE CELLAR', text: 'You wake to the hum of transformers. Wet concrete. Pipes sweating in the dark. Six old monitors stare at you from a steel console.' },
      { who: 'conductor', tag: 'VI. THE CONDUCTOR', glitch: true, text: 'Ah. You are awake. Welcome to the House. You may call me the Conductor. Everyone does, eventually.' },
      { who: 'conductor', tag: 'VII. THE RULES', text: 'The game is twenty-one. Three lives each. Win a hand and your opponent loses a life. Lose one and you do. Three competitors stand between you and the door. Lose every life... and the House keeps you.' }
    ],

    conductor: {
      matchIntro: [
        'Your first competitor. Be gentle. Or do not. I enjoy either.',
        'Round two. The furnace is lit. Try not to stand too close.',
        'The final table. He has played this game before. He has never lost it.'
      ],
      intermission: [
        'Tick. Tock. The deck forgets. I do not.',
        'Interesting. Most people stop breathing around now.',
        'Spend your tokens wisely. They are the only currency down here.',
        'Every round you survive, the door gets a little closer.',
        'I have watched a thousand hands. Yours shake.',
        'Do keep going. The audience is enjoying this.'
      ],
      lowLife: [
        'One life left. How exciting for both of us.',
        'Careful now. The House is very patient.'
      ],
      matchWon: [
        'Signal lost. A shame. Next.',
        'The table is yours. For now.',
        'Two down. The basement grows quieter.'
      ],
      selfIntro: 'Well, well. The seat across from you is mine tonight. Five lives. I suggest you make yours count.',
      beatHim: [
        { who: 'conductor', glitch: true, text: 'You beat me. At my own table.' },
        { who: 'conductor', text: 'Nobody has done that. Not once, in all the years of this House.' }
      ],
      defeat: 'And that is the hand. The monitors will stay on a while longer. They always do.',
      final: [
        { who: 'conductor', glitch: true, text: 'Three for three. Remarkable. Truly.' },
        { who: 'conductor', text: 'The door at the top of the stairs is unlocked. It always was, for winners.' },
        { who: 'conductor', text: 'Go home. Pay your bills. And when the next advertisement finds you... remember who sent it.' },
        { who: 'narrator', tag: 'EPILOGUE', text: 'You climb into cold morning air. Your phone buzzes in your pocket. One new notification: THANK YOU FOR PLAYING. SEE YOU NEXT ROUND.' }
      ]
    },

    howTo: [
      ['THE GOAL', 'Beat three competitors in a row. Each match, both of you start with 3 lives. Win a round and they lose a life; lose one and you do. A draw costs nobody. Hit zero and your tournament is over.'],
      ['BLACKJACK', 'Get closer to 21 than your opponent without going over. 2-10 count face value, J/Q/K count 10, Aces count 11 or 1. Over 21 is a bust and you lose the round at once. A natural 21 on your first two cards wins immediately (two naturals is a draw).'],
      ['HIDDEN HANDS', 'You always see your own cards. Their cards stay face-down until the round ends. Watch the log under their monitor for what they do, and watch their face, but they bluff.'],
      ['ACTIONS', 'HIT draws a card. STAND locks your hand. DOUBLE DOWN draws exactly one card, stands, and makes the round cost 2 lives. SPLIT turns a pair into two hands; your best hand counts. Turns alternate; once one side stands the other keeps playing until done.'],
      ['THE COMPETITORS', 'Each run draws three of fourteen competitors, easier ones first. Every one has a quirk, shown on their file before the match: one never reacts, one steals, one plays two hands. Some say the Conductor himself takes a seat, about once in a million games.'],
      ['ITEMS', 'You get 3 random items each match and can carry up to 5. Each item has a rarity: COMMON (white), UNCOMMON (grey), RARE (light red), VERY RARE (dark red) and CONTRABAND (black). Rarer items turn up less often and hit harder. Click an item to read it and use it. Items that cost your action use up your turn. When you bust, REWIND, GAS CANISTER or GUILLOTINE can save you.'],
      ['TOKENS', 'Each round you win earns 1 token. Between rounds the shop offers 3 items at 2 tokens each, one purchase per break. Tokens are pretend; nothing here involves real money.'],
      ['CONTROLS', 'Mouse, touchpad or touchscreen. Keys: H hit, S stand, D double, P split, I use item, 1-5 inspect items, Enter continue / deal, Esc menu. The game saves between rounds; CONTINUE on the title screen resumes.']
    ],

    credits: [
      'HOUSE OF 21',
      'A functional prototype.',
      'Design brief: the HOUSE OF 21 game development prompt.',
      'Built with plain HTML, CSS and JavaScript. No downloads, no accounts, no network.',
      'All art and sound are placeholders generated in code, ready to be replaced.',
      'No real money is used or won anywhere in this game.'
    ]
  };
})(window.H21 = window.H21 || {});
