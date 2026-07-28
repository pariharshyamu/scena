# Pickups & markers

The furniture of a game loop: the things a player collects and the
places a game cares about. Every game so far improvised these; now they
are vocabulary. The handshake is the house rule — each prop exposes
`trigger`, structurally an `Obstacle` (`{center, radius}`, the centre a
LIVE reference to the prop's root position), so GAMA's proximity
queries and Circuit consume them and neither library imports the other.
SCENA renders the pickup; who gets credit for touching it is the game
loop's business.

## Pickups

```ts
import { createPickup } from 'scena3d';

const gem = createPickup('gem', { seed: 7 });
gem.group.position.set(4, 0.8, -2);
scene.add(gem.group);

// per frame:
gem.update(dt);

// when the game loop says the player touched gem.trigger:
const wait = gem.collect();   // pops out; returns the animation's seconds
// … later:
gem.respawn();                // shimmers back with an overshoot
```

Seven kinds: `coin`, `gem`, `key`, `heart`, `star`, `orb`, `potion`.
Each is a small seeded body with a built-in idle — spin at a seeded
phase plus a sine bob, because **a field of coins must never tick in
lockstep** — and a four-state machine (`idle → collecting → collected →
respawning`) whose transitions refuse nonsense: collecting an already
collected pickup returns 0 and does nothing.

The gem wears the `gemstone` surface — dispersion doing the "this one
is valuable" work games usually fake with a glow sprite. The gold kinds
(coin, key, star) deliberately trade some physical purity for
readability: a pure metal shows only reflections, and a pickup cannot
demand the caller set up an environment map before a coin looks like a
coin — so they run part-dielectric with a warm ember of emissive. Game
tokens, not bullion.

## The field — coin-run density

```ts
const spots = level.coinPositions;           // Vector3[], fixed at creation
const coins = createPickupField('coin', spots, { seed: 3 });
scene.add(coins.mesh);                       // ONE InstancedMesh

for (const trigger of coins.triggers) {
  if (coins.isActive(trigger.index) &&
      hero.position.distanceTo(trigger.center) < trigger.radius) {
    coins.collect(trigger.index);
    score += 10;
  }
}
coins.update(dt);
```

A hundred coins, one draw call. Positions are the level design and are
fixed at creation; each instance idles at its own seeded phase and
collapses when collected. `remaining` counts what is still collectable.
Composite kinds (key, heart, potion — bodies of several meshes) cannot
be instanced as one geometry; the field **throws** for them rather than
silently rendering the wrong thing — use `createPickup` per instance.

## Markers

Almost pure state machine: the geometry is cheap and all the value is
in the transitions, because a player reads a checkpoint's state at a
glance or not at all.

```ts
const checkpoint = createCheckpoint({ width: 4 });
checkpoint.setState('active');    // upcoming = slow pulse · active = bright
checkpoint.update(dt);            // passed = dim green

const zone = createZone({ radius: 2.4 });
zone.setProgress(heldTime / captureTime);   // fills the inner ring

const beacon = createBeacon({ height: 10 });   // the "go HERE" pillar
const gate = createFinishGate({ width: 6 });   // the chequered line
```

Notes from building them:

- The checkpoint's glow strip is `MeshBasicMaterial` on purpose — state
  must read identically at noon and at midnight, so it cannot be at the
  mercy of the lighting rig.
- The beacon is two nested additive tapers, not one: the parallax
  between them is what makes the pillar read as *volume* rather than a
  painted stripe.
- The finish gate's chequer is real instanced geometry, no texture — it
  stays crisp at any distance and dresses both sides of the banner.

## Wiring it to GAMA

```ts
// Sequence checkpoints with Circuit; light up the next one:
circuit.onAdvance = (index) => {
  checkpoints[index - 1]?.setState('passed');
  checkpoints[index]?.setState('active');
  checkpoints[index + 1]?.setState('upcoming');
};

// One event, all senses (0.93 effects + gama's Soundboard and GameFeel):
coins.collect(i);
fx.ring(trigger.center, { color: 0xf3c94e });
sounds.coin({ at: trigger.center });
hud.score(score += 10);
```

## What it costs

A pickup is one to four low-poly meshes; a field is one draw call
regardless of count; markers are a handful of primitives each, and the
only per-frame work is a few sines. Everything is seeded, so a level's
pickups are part of its seed — a save that stores the seed restores the
coins along with the world.
