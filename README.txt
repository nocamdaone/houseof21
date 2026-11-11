HOUSE OF 21 — functional prototype
===================================

A 2D browser blackjack survival game: three competitors, three lives each,
14 items, six CRT monitors. Plain HTML + CSS + JavaScript.


PLAYING ON A CHROMEBOOK
-----------------------
Option A — one file (easiest)
  1. Download  house-of-21-standalone.html
  2. Open the Files app, find it in Downloads, and double-click it
     (or right-click > Open with > Chrome).
  It runs fully offline. Nothing to install, no extensions, no account.

Option B — the project folder
  1. Download  house-of-21.zip  and open it in the Files app
     (ChromeOS opens zip files natively), then copy the folder out.
  2. Open index.html in Chrome.

Option C — host it (if your school blocks local files)
  Some managed Chromebooks block opening files from Downloads
  (file:// pages). In that case put the files on any static host your
  network allows, for example:
    - GitHub Pages: create a repo, upload the files, Settings > Pages.
    - Google Sites: Insert > Embed > Embed code, and paste the whole
      contents of house-of-21-standalone.html.
  Saving progress may be disabled inside some embeds; the game still works.

Why it should not trip Chromebook filters
  - No downloads, executables, extensions, pop-ups or plug-ins.
  - No network requests at all: no CDNs, web fonts, trackers or analytics.
  - No ES modules (those fail from file://), only classic scripts.
  - Written for Chrome 84 and newer, so older school Chromebooks work.
  - Sound is generated in code; nothing is fetched.
  An administrator can still block any site or file type by policy, and
  some web filters flag anything mentioning blackjack. No game file can
  override an admin policy.

Slow Chromebook?  Title screen > EFFECTS: LOW (or Esc > Menu in game).
It also turns off automatically if "reduce motion" is on in ChromeOS
accessibility settings.


CONTROLS
--------
Mouse, touchpad or touchscreen.
  H hit · S stand · D double down · P split · I use item
  1-5 inspect inventory slot · Enter deal / continue · Esc menu


FILES
-----
  index.html     page structure: the six monitors and screens
  style.css      look, layout, CRT effects, responsive stacking
  config.js      every tunable rule (lives, prices, penalties, timings)
  cards.js       deck, shuffling, blackjack hand maths
  items.js       the 22 items with rarities (each: canUse + apply)
  opponents.js   the 15 competitors (data, quirks, dialogue, AI)
  story.js       all narrative text and Conductor lines
  face.js        placeholder SVG portraits (swap for real art here)
  fx.js          parallax, static, glitches, procedural sound
  ui.js          renders the monitors, dialogs and screens
  net.js         online rooms for the website (public Nostr relays)
  mp.js          multiplayer: matchmaking, rooms, pass & play, shared table
  game.js        state, round engine, tournament flow, save/load, input


MULTIPLAYER (1V1 and 1V1V1V1)
-----------------------------
Title screen > MULTIPLAYER. Pick a name and a face, then a mode:
  1V1        two players, one dealer deck.
  1V1V1V1    four players at one table.
Then either:
  FIND PUBLIC MATCH    pairs you with whoever else is searching right
                       now (2 for 1V1, 4 for 1V1V1V1; if one of the four
                       drops out while the table loads, it starts with 3).
  CREATE PRIVATE ROOM  gives you a 5-letter code. Friends type it in the
                       ROOM CODE box and press JOIN. The host presses
                       START MATCH (1V1 needs 2 players, 1V1V1V1 needs 3-4).

PASS & PLAY (same screen, works in the offline file)
  MULTIPLAYER > pick 1V1 or 1V1V1V1 > PASS & PLAY ON THIS DEVICE.
  Type each player's name, pick faces (3 or 4 players for 1V1V1V1),
  then START MATCH. Players take turns on one Chromebook. Whenever it
  is someone else's go, a "PASS TO <NAME>" cover hides every card and
  item until that player taps SHOW ME. No internet, no server, no turn
  timers, nothing for a school filter to block.

Online rooms (FIND PUBLIC MATCH / private codes)
- Online rooms work on the website version (GitHub Pages or any web
  host). Opened as a downloaded file, those buttons are switched off;
  single player and PASS & PLAY still work.
- There is no game server. Each browser sends small signed messages
  through free public Nostr relays (net.js) over secure WebSockets on
  port 443. Messages are "ephemeral": relays pass them on and do not
  store them. If one relay is down, the others carry the game.
- Anyone who has a room code can join that room, and the messages are
  public in transit, so use a nickname rather than a real name.
- If a network blocks the relays, the menu says ONLINE · NOT CONNECTED
  with a TRY AGAIN button. Pass & play keeps working.
- The same build also runs as a claude.ai page, where it uses Claude's
  own rooms instead of the relays.

Multiplayer rules (online and pass & play)
- 3 lives each, 3 starting items, same 22 items (ZIPLOCK BAG is not
  used online). Targeted items ask you who to aim at in 1V1V1V1.
- Each round everyone plays one hand in turn (online: 30 s per turn,
  then you auto-stand). Anyone who busts loses a life; the lowest non-bust hand
  also loses a life if it is below the best. Best hand(s) earn a token.
  Double Down or a HAND SAW still makes it cost 2.
- Between rounds there is a shop (25 s online). Last one standing wins.
- The first player in the room hosts the table. If the host leaves or
  closes the tab, the match ends.
- It is a friendly prototype: hidden cards travel to every player's
  browser, so a determined cheater with developer tools could peek.


ITEM RARITY (22 items)
----------------------
Drop chance per item is set by tier weights in config.js (rarities).
  COMMON      white      X-RAY, LOCKED SHACKLES, REWIND, BURNER PHONE,
                         ZIPLOCK BAG, GUILLOTINE, RUSSIAN DOLL
  UNCOMMON    grey       CONTRABAND, DEAD WEIGHT, RAT POISON, GAS CANISTER,
                         CHOKEHOLD, COIN FLIP
  RARE        light red  LEFTOVERS, PLACEBO, HAND SAW, VICE CLAMP,
                         SCHRODINGER'S CARD, GLOVES
  VERY RARE   dark red   TOURNIQUET, FLU SHOT
  CONTRABAND  black      PANDORA'S BOX
(The item called CONTRABAND is only Uncommon; the black CONTRABAND tier
is a separate thing.)

COMPETITORS
-----------
Each run draws one competitor per match, easiest tier first
(config.js lineupTiers):
  Tier 1  Betty, Bob, Dennis, Cassie, Mark
  Tier 2  Bryan, Elaine, Chuck, Luisa, Phil
  Tier 3  Jack, Sandra, Hugo, Fuchsia & Trish
The Conductor replaces the drawn competitor with a 1 in 1,000,000 chance
per match (config.js conductorChance). To test him, open the game with
#conductor at the end of the address (index.html#conductor).
Mark has a generic "tech founder" placeholder look rather than a real
person's likeness.

RULE DECISIONS MADE FOR THE PROTOTYPE
-------------------------------------
- Turns alternate one action at a time. Items marked "costs your action"
  end your turn; passive traps (RAT POISON, HAND SAW), LEFTOVERS,
  TOURNIQUET and ZIPLOCK BAG are free.
- When you bust, REWIND, GAS CANISTER or GUILLOTINE can be used at once
  to save the hand (the "unless an item changes the result" rule). The AI
  gets the same chance.
- GUILLOTINE on an Ace treats it as 11, and the cut value is fixed.
- CONTRABAND pulls last round's opening cards from the deck. If one of
  them is already in play, a marked copy (C) is used instead.
- TOURNIQUET is applied between rounds and blocks 1 point of life loss
  in the next round, from any source.
- ZIPLOCK BAG takes the item out of your inventory until next match,
  where it fills one of the 3 incoming slots. Up to 3 can be sealed.
- FLU SHOT blocks the opponent's hostile items (and traps already set on
  you) for 3 rounds, counting the round it was used in. Sandra's grabbing
  is a quirk, not an item, so it still works.
- SCHRODINGER'S CARD does not count toward your total or a bust until the
  round ends; then you choose to keep it (it counts) or discard it.
- RUSSIAN DOLL values are 1-10. PANDORA'S BOX rolls its three offers once
  and keeps them, so closing the lid can't be used to re-roll.
- GLOVES: if your inventory was full when you played them, the steal
  becomes a swap and you hand one of your items back.
- Fuchsia & Trish are dealt two hands every round; natural blackjack does
  not apply to them. Their better hand counts.
- Saves from the earlier version are not compatible and are ignored.
- Progress saves automatically (browser localStorage). CONTINUE on the
  title screen resumes; RESTART in the menu wipes it.

All tokens are fictional. No real money is used anywhere.
