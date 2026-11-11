/* ==========================================================================
   HOUSE OF 21 — net.js
   Online rooms for a plain static website (GitHub Pages or any web host).

   There is no game server. Each browser signs small messages and swaps them
   through public Nostr relays: ordinary secure WebSockets (wss://, port 443).
   Messages are "ephemeral" events, which relays pass along but do not store.
   The table itself is still run by the host player's browser (see mp.js).

   This file offers the same calls mp.js already uses for rooms:
     room.join(name) -> Promise<room>;  room.presence(patch);  room.peers();
     room.onPeers(fn);  room.leave()
   Classic script, ES2017 syntax. BigInt is used at runtime (Chrome 67+),
   built with BigInt() calls so older parsers can still load the file.
   ========================================================================== */
/* global BigInt, WebSocket */
(function (H) {
  'use strict';

  var RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net',
    'wss://nostr.mom',
    'wss://relay.snort.social'
  ];
  var KIND = 25721;             // ephemeral range: relayed, never stored
  var PREFIX = 'house21-v1-';   // topic tag prefix, one topic per room
  var HEARTBEAT_MS = 4000;      // resend full presence this often
  var EXPIRE_MS = 15000;        // a peer silent this long has left
  var MIN_GAP_MS = 200;         // coalesce rapid presence changes
  var MAX_PRESENCE = 4096;      // same limit as the claude.ai room
  var CONNECT_WAIT_MS = 9000;

  function now() { return Date.now(); }
  function noop() {}

  function available() {
    try {
      return /^https?:$/.test(location.protocol) && typeof WebSocket === 'function' &&
        typeof BigInt === 'function' && typeof TextEncoder === 'function' &&
        !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues);
    } catch (e) { return false; }
  }

  /* ======================================================================
     1. Hashing and hex helpers
     ====================================================================== */
  var enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  function hexToBytes(h) {
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  function bytesToHex(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  function concat(list) {
    var n = 0, i;
    for (i = 0; i < list.length; i++) n += list[i].length;
    var out = new Uint8Array(n), o = 0;
    for (i = 0; i < list.length; i++) { out.set(list[i], o); o += list[i].length; }
    return out;
  }
  function sha256(bytes) {
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (d) { return new Uint8Array(d); });
  }
  var tagCache = {};
  function taggedHash(tag, msgBytes) {
    var th = tagCache[tag] ? Promise.resolve(tagCache[tag]) : sha256(enc.encode(tag)).then(function (h) { tagCache[tag] = h; return h; });
    return th.then(function (h) { return sha256(concat([h, h, msgBytes])); });
  }
  function randBytes(n) { var b = new Uint8Array(n); window.crypto.getRandomValues(b); return b; }

  /* ======================================================================
     2. secp256k1 + BIP-340 Schnorr signatures (what Nostr relays verify)
     ====================================================================== */
  var CV = null;
  function curve() {
    if (CV) return CV;
    var B = BigInt;
    CV = {
      P: B('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F'),
      N: B('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141'),
      GX: B('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798'),
      GY: B('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8'),
      Z: B(0), O: B(1), T: B(2), TH: B(3), F: B(4), E: B(8), S: B(7),
      table: null
    };
    return CV;
  }
  function md(a, m) { var r = a % m; return r < CV.Z ? r + m : r; }
  function inv(a, m) {
    var lm = CV.O, hm = CV.Z, low = md(a, m), high = m;
    while (low > CV.O) {
      var r = high / low;
      var nm = hm - lm * r, nw = high - low * r;
      hm = lm; high = low; lm = nm; low = nw;
    }
    return md(lm, m);
  }
  function powmod(b, e, m) {
    var r = CV.O; b = md(b, m);
    while (e > CV.Z) {
      if (e & CV.O) r = (r * b) % m;
      b = (b * b) % m;
      e >>= CV.O;
    }
    return r;
  }
  // Jacobian points {x, y, z}; z = 0 means the point at infinity.
  function jDouble(p) {
    var P = CV.P;
    if (p.z === CV.Z || p.y === CV.Z) return { x: CV.Z, y: CV.O, z: CV.Z };
    var xx = (p.x * p.x) % P, yy = (p.y * p.y) % P, yyyy = (yy * yy) % P;
    var s = md(CV.F * p.x * yy, P), m = md(CV.TH * xx, P);
    var x3 = md(m * m - CV.T * s, P);
    var y3 = md(m * (s - x3) - CV.E * yyyy, P);
    var z3 = md(CV.T * p.y * p.z, P);
    return { x: x3, y: y3, z: z3 };
  }
  function jAddAffine(p, q) { // q = {x, y} affine
    var P = CV.P;
    if (p.z === CV.Z) return { x: q.x, y: q.y, z: CV.O };
    var z1z1 = (p.z * p.z) % P;
    var u2 = (q.x * z1z1) % P, s2 = (q.y * p.z * z1z1) % P;
    var h = md(u2 - p.x, P), r = md(s2 - p.y, P);
    if (h === CV.Z) return r === CV.Z ? jDouble(p) : { x: CV.Z, y: CV.O, z: CV.Z };
    var hh = (h * h) % P, hhh = (h * hh) % P, v = (p.x * hh) % P;
    var x3 = md(r * r - hhh - CV.T * v, P);
    var y3 = md(r * (v - x3) - p.y * hhh, P);
    return { x: x3, y: y3, z: (p.z * h) % P };
  }
  function toAffine(p) {
    if (p.z === CV.Z) return null;
    var P = CV.P, zi = inv(p.z, P), zi2 = (zi * zi) % P;
    return { x: (p.x * zi2) % P, y: (p.y * zi2 * zi) % P };
  }
  function mul(k, aff) { // generic double-and-add
    var acc = { x: CV.Z, y: CV.O, z: CV.Z };
    var bits = k.toString(2);
    for (var i = 0; i < bits.length; i++) {
      acc = jDouble(acc);
      if (bits.charAt(i) === '1') acc = jAddAffine(acc, aff);
    }
    return toAffine(acc);
  }
  function mulG(k) { // fixed base: table[i] = 2^i * G
    if (!CV.table) {
      var t = [], p = { x: CV.GX, y: CV.GY, z: CV.O };
      for (var i = 0; i < 256; i++) { t.push(toAffine(p)); p = jDouble(p); }
      CV.table = t;
    }
    var acc = { x: CV.Z, y: CV.O, z: CV.Z }, j = 0, kk = k;
    while (kk > CV.Z) {
      if (kk & CV.O) acc = jAddAffine(acc, CV.table[j]);
      kk >>= CV.O; j++;
    }
    return toAffine(acc);
  }
  function hex32(n) { var s = n.toString(16); while (s.length < 64) s = '0' + s; return s; }
  function big(hex) { return BigInt('0x' + (hex || '0')); }
  function even(n) { return (n & CV.O) === CV.Z; }

  function makeKey(seedHex) {
    curve();
    var d0;
    do { d0 = md(big(seedHex || bytesToHex(randBytes(32))), CV.N); seedHex = null; } while (d0 === CV.Z);
    var P = mulG(d0);
    return { d: even(P.y) ? d0 : CV.N - d0, pub: hex32(P.x) };
  }

  /** BIP-340 sign. msgHex: 32-byte hex. Returns Promise<128-hex signature>. */
  function schnorrSign(msgHex, key, auxHex) {
    curve();
    var msg = hexToBytes(msgHex), pubB = hexToBytes(key.pub);
    var aux = auxHex ? hexToBytes(auxHex) : randBytes(32);
    return taggedHash('BIP0340/aux', aux).then(function (h) {
      var t = hexToBytes(hex32(key.d ^ big(bytesToHex(h))));
      return taggedHash('BIP0340/nonce', concat([t, pubB, msg]));
    }).then(function (h) {
      var k0 = md(big(bytesToHex(h)), CV.N);
      if (k0 === CV.Z) throw new Error('bad nonce');
      var R = mulG(k0);
      var k = even(R.y) ? k0 : CV.N - k0;
      var rx = hexToBytes(hex32(R.x));
      return taggedHash('BIP0340/challenge', concat([rx, pubB, msg])).then(function (eh) {
        var e = md(big(bytesToHex(eh)), CV.N);
        return bytesToHex(rx) + hex32(md(k + e * key.d, CV.N));
      });
    });
  }

  /** BIP-340 verify (used by the self-test; relays do this for real). */
  function schnorrVerify(msgHex, pubHex, sigHex) {
    curve();
    var x = big(pubHex), P = CV.P;
    if (x >= P) return Promise.resolve(false);
    var c = md(x * x * x + CV.S, P), y = powmod(c, (P + CV.O) / CV.F, P);
    if ((y * y) % P !== c) return Promise.resolve(false);
    var Pt = { x: x, y: even(y) ? y : P - y };
    var r = big(sigHex.slice(0, 64)), s = big(sigHex.slice(64));
    if (r >= P || s >= CV.N) return Promise.resolve(false);
    return taggedHash('BIP0340/challenge', concat([hexToBytes(sigHex.slice(0, 64)), hexToBytes(pubHex), hexToBytes(msgHex)])).then(function (eh) {
      var e = md(big(bytesToHex(eh)), CV.N);
      var a = mulG(s), b = mul(CV.N - e, Pt);
      if (!a || !b) return false;
      var R = toAffine(jAddAffine({ x: a.x, y: a.y, z: CV.O }, b));
      return !!R && even(R.y) && R.x === r;
    });
  }

  /* ======================================================================
     3. Relay pool
     ====================================================================== */
  var KEY = null;
  var pool = { relays: [], topics: {}, seen: {}, seenList: [], watchers: [], signQ: Promise.resolve() };

  function openCount() { return pool.relays.filter(function (r) { return r.open; }).length; }
  function notifyWatchers() { pool.watchers.slice().forEach(function (f) { try { f(openCount()); } catch (e) { /* ignore */ } }); }

  function subId(topic) { return 'h' + topic.slice(-58); }
  function reqFor(topic) {
    return JSON.stringify(['REQ', subId(topic), { kinds: [KIND], '#t': [topic], since: Math.floor(now() / 1000) - 20 }]);
  }
  function sendRaw(R, s) { try { if (R.open) R.ws.send(s); } catch (e) { /* closed */ } }

  function openRelay(url) {
    var R = { url: url, ws: null, open: false, tries: 0, timer: 0, rejects: 0 };
    function connect() {
      try { R.ws = new WebSocket(url); } catch (e) { retry(); return; }
      R.ws.onopen = function () {
        R.open = true; R.tries = 0;
        Object.keys(pool.topics).forEach(function (t) { sendRaw(R, reqFor(t)); });
        notifyWatchers();
      };
      R.ws.onmessage = function (m) { onRelayMessage(R, m.data); };
      R.ws.onclose = function () { var was = R.open; R.open = false; if (was) notifyWatchers(); retry(); };
      R.ws.onerror = noop;
    }
    function retry() {
      clearTimeout(R.timer);
      R.tries += 1;
      R.timer = setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, Math.min(R.tries, 5))) + Math.random() * 500);
    }
    connect();
    return R;
  }

  function onRelayMessage(R, data) {
    var m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!Array.isArray(m)) return;
    if (m[0] === 'EVENT') {
      var ev = m[2];
      if (!ev || typeof ev !== 'object' || ev.kind !== KIND || typeof ev.id !== 'string' || typeof ev.content !== 'string') return;
      if (pool.seen[ev.id]) return;
      pool.seen[ev.id] = 1;
      pool.seenList.push(ev.id);
      if (pool.seenList.length > 3000) delete pool.seen[pool.seenList.shift()];
      var topic = null;
      (ev.tags || []).forEach(function (t) { if (Array.isArray(t) && t[0] === 't') topic = t[1]; });
      var h = topic && pool.topics[topic];
      if (h) h(ev);
    } else if (m[0] === 'OK' && m[2] === false) {
      R.rejects += 1;
      if (window.console && R.rejects < 4) console.warn('[net] ' + R.url + ' refused a message: ' + m[3]);
    } else if (m[0] === 'CLOSED') {
      // The relay dropped a subscription (rate limit, restart): ask again soon.
      var sid = m[1];
      setTimeout(function () {
        Object.keys(pool.topics).forEach(function (t) { if (subId(t) === sid) sendRaw(R, reqFor(t)); });
      }, 3000);
    }
  }

  function subscribe(topic, handler) {
    pool.topics[topic] = handler;
    var s = reqFor(topic);
    pool.relays.forEach(function (R) { sendRaw(R, s); });
  }
  function unsubscribe(topic) {
    delete pool.topics[topic];
    var s = JSON.stringify(['CLOSE', subId(topic)]);
    pool.relays.forEach(function (R) { sendRaw(R, s); });
  }

  /** Sign and send one event to every open relay, keeping send order. */
  function publish(topic, content) {
    pool.signQ = pool.signQ.then(function () {
      var ev = { pubkey: KEY.pub, created_at: Math.floor(now() / 1000), kind: KIND, tags: [['t', topic]], content: content };
      var ser = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
      return sha256(enc.encode(ser)).then(function (id) {
        ev.id = bytesToHex(id);
        return schnorrSign(ev.id, KEY);
      }).then(function (sig) {
        ev.sig = sig;
        var s = JSON.stringify(['EVENT', ev]);
        pool.relays.forEach(function (R) { sendRaw(R, s); });
      });
    }).catch(function (e) { if (window.console) console.warn('[net] send failed', e && e.message); });
    return pool.signQ;
  }

  /* ======================================================================
     4. Rooms with presence (same shape as the claude.ai room capability)
     ====================================================================== */
  function freezeDeep(o) {
    if (o && typeof o === 'object') { Object.keys(o).forEach(function (k) { freezeDeep(o[k]); }); Object.freeze(o); }
    return o;
  }
  var byteLen = function (s) { return enc.encode(s).length; };

  function mkRoom(name) {
    var topic = PREFIX + name;
    var ME = KEY.pub;
    var peersMap = {}, gone = {}, mine = {}, mineStr = '{}', handlers = [], live = true;
    var lastSent = 0, timer = 0;
    peersMap[ME] = { presence: freezeDeep({}), str: '{}', updatedAt: now(), seen: now(), s: 0 };

    function snap() {
      return Object.freeze(Object.keys(peersMap).map(function (p) {
        return Object.freeze({ peer: p, by: null, isMe: p === ME, sameTab: p === ME, kind: 'viewer', guest: false, presence: peersMap[p].presence, updatedAt: peersMap[p].updatedAt });
      }));
    }
    function fire(j, l, u) {
      var s = snap();
      handlers.slice().forEach(function (h) {
        try { h({ peers: s, joined: j || [], left: l || [], updated: u || [] }); } catch (e) { setTimeout(function () { throw e; }); }
      });
    }
    function sendNow() {
      if (!live) return;
      clearTimeout(timer); timer = 0;
      lastSent = now();
      SEQ += 1;
      publish(topic, JSON.stringify({ r: name, ty: 'p', s: SEQ, p: mine }));
    }
    function schedule() {
      if (!live) return;
      var wait = MIN_GAP_MS - (now() - lastSent);
      if (wait <= 0) { sendNow(); return; }
      if (!timer) timer = setTimeout(sendNow, wait);
    }
    function onEvent(ev) {
      if (!live || ev.pubkey === ME) return;
      if (now() / 1000 - ev.created_at > 60) return;
      var m;
      try { m = JSON.parse(ev.content); } catch (e) { return; }
      if (!m || typeof m !== 'object' || m.r !== name) return;
      var pr = ev.pubkey, ex = peersMap[pr], t = now();
      if (typeof m.s !== 'number') return;
      if (m.ty === 'bye') {
        gone[pr] = Math.max(gone[pr] || 0, m.s);
        if (ex) { delete peersMap[pr]; fire([], [{ peer: pr }], []); }
        return;
      }
      if (gone[pr] && m.s <= gone[pr]) return;
      if (ex && m.s <= ex.s) { ex.seen = t; return; }
      var pres = (m.p && typeof m.p === 'object' && !Array.isArray(m.p)) ? m.p : {};
      var str = JSON.stringify(pres);
      if (byteLen(str) > MAX_PRESENCE + 512) return;
      var changed = !ex || ex.str !== str;
      peersMap[pr] = { presence: changed ? freezeDeep(JSON.parse(str)) : ex.presence, str: str, updatedAt: changed ? t : ex.updatedAt, seen: t, s: m.s };
      if (!ex) { schedule(); fire([{ peer: pr }], [], []); } // greet newcomers with our state
      else if (changed) fire([], [], [{ peer: pr }]);
    }
    subscribe(topic, onEvent);
    var hb = setInterval(function () {
      if (!live) return;
      if (now() - lastSent > HEARTBEAT_MS * 0.8) sendNow();
      var t = now(), left = [];
      Object.keys(peersMap).forEach(function (p) {
        if (p !== ME && t - peersMap[p].seen > EXPIRE_MS) { delete peersMap[p]; left.push({ peer: p }); }
      });
      if (left.length) fire([], left, []);
    }, HEARTBEAT_MS);
    setTimeout(schedule, 0);

    var room = {
      name: name,
      presence: function (patch) {
        if (!live) return Promise.reject({ code: 'closed', message: 'room left' });
        var next = {};
        Object.keys(mine).forEach(function (k) { next[k] = mine[k]; });
        Object.keys(patch || {}).forEach(function (k) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; });
        var str = JSON.stringify(next);
        if (byteLen(str) > MAX_PRESENCE) return Promise.reject({ code: 'invalid_argument', message: 'presence over 4 KiB' });
        mine = JSON.parse(str); mineStr = str;
        peersMap[ME] = { presence: freezeDeep(JSON.parse(str)), str: str, updatedAt: now(), seen: now(), s: SEQ };
        schedule();
        setTimeout(function () { if (live) fire([], [], [{ peer: ME }]); }, 0);
        return Promise.resolve();
      },
      peers: snap,
      onPeers: function (h) {
        handlers.push(h);
        setTimeout(function () { if (!live) return; var s = snap(); h({ peers: s, joined: s, left: [], updated: [] }); }, 0);
        return function () { handlers = handlers.filter(function (x) { return x !== h; }); };
      },
      connected: function () { return openCount() > 0; },
      emit: function () { return Promise.resolve(); },
      on: function () { return noop; },
      leave: function () {
        if (live) {
          clearTimeout(timer);
          SEQ += 1;
          publish(topic, JSON.stringify({ r: name, ty: 'bye', s: SEQ }));
        }
        live = false;
        clearInterval(hb);
        handlers = [];
        setTimeout(function () { if (pool.topics[topic] === onEvent) unsubscribe(topic); }, 1500);
        if (rooms[name] === room) delete rooms[name];
        return Promise.resolve();
      }
    };
    return room;
  }

  var rooms = {};
  var lobby = null;
  var SEQ = 0; // one counter per tab, so a peer's messages always count up
  function makeLobby() {
    return {
      name: 'lobby',
      join: function (n) {
        if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(n)) return Promise.reject({ code: 'invalid_argument', message: 'bad room name' });
        if (!rooms[n]) rooms[n] = mkRoom(n);
        return Promise.resolve(rooms[n]);
      },
      presence: function () { return Promise.resolve(); },
      peers: function () { return Object.freeze([Object.freeze({ peer: KEY.pub, isMe: true, sameTab: true, presence: Object.freeze({}) })]); },
      onPeers: function () { return noop; },
      connected: function () { return openCount() > 0; },
      onConnection: function (f) { pool.watchers.push(function (n) { f(n > 0); }); return noop; },
      leave: function () { return Promise.resolve(); }
    };
  }

  /** Resolves to a room lobby once a relay answers, or null if none can be reached. */
  var connecting = null;
  function connect() {
    if (!available()) return Promise.resolve(null);
    if (connecting) return connecting;
    connecting = new Promise(function (res) {
      try { if (!KEY) KEY = makeKey(); } catch (e) { res(null); return; }
      if (!lobby) lobby = makeLobby();
      var done = false;
      function finish(v) { if (!done) { done = true; res(v); } }
      pool.watchers.push(function (n) { if (n > 0) finish(lobby); });
      if (!pool.relays.length) pool.relays = RELAYS.map(openRelay);
      else if (openCount() > 0) finish(lobby);
      setTimeout(function () { finish(openCount() > 0 ? lobby : null); }, CONNECT_WAIT_MS);
    }).then(function (v) { if (!v) connecting = null; return v; });
    return connecting;
  }

  H.Net = {
    available: available,
    connect: connect,
    relays: function () { return pool.relays.map(function (r) { return { url: r.url, open: r.open }; }); },
    _t: { makeKey: makeKey, sign: schnorrSign, verify: schnorrVerify, sha256: sha256, hex: bytesToHex, RELAYS: RELAYS, KIND: KIND }
  };
})(window.H21 = window.H21 || {});
