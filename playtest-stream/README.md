# Hollow Soul shared stream

The existing `host.js` and `viewer.js` share one authoritative game canvas.
The viewer asks only for an available player name. The host admits the name
over the WebRTC data channel before enabling video, gameplay input, or HUD
updates, and issues a private browser reconnect credential.

## Behavior

- Up to eight admitted viewers share the same game and action stream.
- Names are trimmed, normalized to NFC, limited to 64 Unicode code points,
  and compared without case. Blank names and control characters are rejected.
- A disconnected name is reserved for its credential holder for 60 seconds.
- A valid credential can reconnect or rename its own session; another player
  cannot take an occupied name by guessing the display name.
- The loopback host page contains the player list and Kick, Block, and Unblock
  controls. These controls are outside the streamed game HUD.
- Kick ends the session and revokes its credential. The viewer can explicitly
  choose Join again. Block rejects the blocked name and credential, including
  a different display name presented with that credential.
- Host browser storage retains blocks and reconnect reservations across page
  reloads. These are browser identity controls; clearing client storage and
  choosing a new name creates a different identity.
- Each viewer owns its held keys. Disconnecting or blocking one viewer releases
  only that viewer's holds. Pending connections and stale peers time out.

## Deployment

The release branch is `phairo-enterprises/bus:hollow-soul-playtest`.
`Publish-Playtest.ps1` already publishes the two modules together from one
commit, validates their bytes against the existing origin, and restores the
previous files if publication fails. This change adds no runtime module
dependency and requires no game-engine rebuild.

The publisher must run on the existing Windows origin with its actual
`playtest-stream` directory. A repository commit alone does not establish
that the origin received it. The public Cloudflare Access rule and the origin's
Cloudflare token validator are separate configuration/server changes; neither
is changed by these browser modules. Those layers must permit the public
viewer and its signaling while keeping host/operator signaling private.

The live `opening-soul-v2` game and Mill Verge revision 821 are outside this
release's files and tests.

## Focused regression checks

From the repository root, with Node.js:

```sh
node --experimental-vm-modules --test playtest-stream/tests/host-admission.test.mjs playtest-stream/tests/viewer-admission.test.mjs
```

These tests run the actual host/viewer source with mocked DOM, clocks, and RTC
peers. They establish admission, reconnect, moderation, input cleanup, and
message handling; they do not establish live origin deployment or Internet
media connectivity.

For an isolated real-browser transport check on one machine:

```sh
node playtest-stream/tests/rtc-harness.mjs
```

The harness prints host/viewer URLs and serves a test canvas with temporary
signaling. It contains no game engine, campaign, or live save. Its host page
shows action/key counters and its viewer page shows received video dimensions.
`127.0.0.1` and `localhost` viewer origins give independent browser identities
while reaching the same test listener. The browser and listener must run in
the same reachable environment.
