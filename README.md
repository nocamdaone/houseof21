# House of 21

A blackjack survival horror game that runs in the browser. You sit in a basement lit by one swinging bulb, facing four old TVs. Beat Dennis or Cassie, Bryan or Elaine, and then Jack, three lives each, using 22 items across five rarities. Lose, and you see how they go. Win, and they do.

**Play it:** open the GitHub Pages link for this repository (Settings → Pages).

## Modes
- **Single player:** a tournament against 15 possible competitors (and, one time in a million, The Conductor).
- **Pass & play:** 1v1 or 1v1v1v1 on one device. A cover hides each player's hand between turns. It needs no internet.
- **Online:** 1v1 or 1v1v1v1 through **Find public match** or a private 5-letter room code.

## How online works
GitHub Pages only serves static files, so there is no game server. The host player's browser runs the table, and the browsers exchange small signed messages through free public [Nostr](https://nostr.com) relays over secure WebSockets (`net.js`). Relays pass these messages on without storing them. Anyone with a room code can join, so use a nickname.

## Look
Photo cut-out art in black and white with red details. The cut-outs are assembled from separate eyes and noses, so faces blink, glance and flare. The screens are bent by a fisheye effect, the heart monitors speed up with every life lost, and the whole room has procedural basement sound. Contains cartoon gore.

## Music
Each battle has its own original piece, generated live in the browser like a worn record heard through a wall; it warps as lives run out. **Your music** (title screen or menu) lets each player pick their own audio file for any slot. The file stays in their browser and is never uploaded.

## Chromebook-friendly
- Plain HTML, CSS and JavaScript.
- No build step, no installs, no external libraries or fonts.
- Works in Chrome 84+, and has a low-effects mode.

All tokens are fictional. No real money is involved.
