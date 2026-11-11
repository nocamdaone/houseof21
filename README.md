# House of 21

A blackjack survival game that runs in the browser: beat three competitors with three lives each, using 22 items across five rarities.

**Play it:** https://www.houseof21.com

**Offline copy:** download `house-of-21-standalone.html` and open it in Chrome. It runs single player and pass & play with no internet.

## Modes
- **Single player:** a tournament against 15 possible competitors (and, one time in a million, The Conductor).
- **Pass & play:** 1v1 or 1v1v1v1 on one device. A cover hides each player's hand between turns. It needs no internet.
- **Online:** 1v1 or 1v1v1v1 through **Find public match** or a private 5-letter room code.

## How online works
GitHub Pages only serves static files, so there is no game server. The host player's browser runs the table, and the browsers exchange small signed messages through free public [Nostr](https://nostr.com) relays over secure WebSockets (`net.js`). Relays pass these messages on without storing them. Anyone with a room code can join, so use a nickname.

## Chromebook-friendly
- Plain HTML, CSS and JavaScript.
- No build step, no installs, no external libraries or fonts.
- Works in Chrome 84+, and has a low-effects mode.

All tokens are fictional. No real money is involved.
