# Ammunition

Ammunition is a supply chain, not a shelf of models.

A round is never just a round. The same cartridge is a thing in a crate, a
thing in a belt, a thing in a hand and a case on the floor, and a game that
wants ammunition wants all four or none of them. So this is organised by
**state**:

| state | what builds it |
|---|---|
| stored | `createAmmoBox` — sealed, or open with the rounds visible |
| ready | `createMagazine` `createBelt` `createQuiver` `createRack` |
| carried | `createRound` — one, `Holdable`, in a hand |
| spent | `createCasing` — brass on the ground |

and every one of them is **derived** from a single measured spec per kind.

```ts
import { createReady, createRound, ballisticsOf } from 'scena3d';

const belt = createReady('heavy-mg');          // 100 linked rounds, 3 draws
scene.add(belt.object);
belt.consume();                                 // it visibly shortens
```

## Nineteen kinds, one table

```ts
AMMO_KINDS  // pistol rifle shotgun heavy-mg  autocannon tank artillery mortar
            // rocket missile bomb torpedo depth-charge  grenade
            // arrow bolt sling cannonball ballista
```

Real calibres and real masses, because the whole value of deriving the
containers is lost if the source numbers are invented. A 12.7 mm belt is
supposed to look punishing next to a 5.56 mm one, and it only does if the two
are actually 12.7 and 5.56.

The magazine is as long as its rounds are; the belt's link pitch is the case
head; the crate's stack falls out of its inside dimensions divided by the
round. Author forty models by hand and forty models drift.

## The handshake

`ballisticsOf(kind)` returns exactly what GAMA's `Projectiles` and `Missiles`
want. **The same table that decides how long the cartridge model is decides
how fast it flies**, so a game cannot make the prop and the projectile
disagree — there is only one number.

```ts
const b = ballisticsOf('rifle');
const shots = new Projectiles({ gravity: b.gravity, size: b.size, color: b.color });
shots.fire(muzzle, aim.multiplyScalar(b.speed));
mag.consume();
```

Structurally what GAMA wants, and deliberately not an import of it — the
trilogy composes on shapes, not packages. A game that never draws a single
round can still use this to make its shots behave like the calibre it claims.

### Everything unpowered falls at the same g

`gravity` is 9.81 for a bullet **and** a cannonball. The most common lie in
game ballistics is that a bullet falls less; it does not, it is simply in the
air for less time, and that falls out of `speed` on its own. Only powered
rounds are exempt — a rocket under thrust gets 3.2 — and a guided missile or
torpedo gets zero, because whatever flies it owns its path.

### Zero muzzle velocity means zero

A bomb is dropped, a grenade is thrown, a depth charge is rolled. Those kinds
report `speed: 0`, which tells a caller "you supply the launch". That is the
honest answer rather than a made-up number, and `describeAmmo` prints
*"not gun-launched"* rather than *"0 m/s"*.

## Counting is the whole feature

A magazine, a belt, a quiver and a shell rack are the same object as far as a
game is concerned: they hold N of something, N goes down, and the model has to
show it. One interface — `Countable` — so a HUD or a reload routine written
against a rifle magazine works on a howitzer's ready rack without knowing.

```ts
interface Countable extends Prop {
  readonly capacity: number;
  readonly count: number;
  setCount(n: number): number;   // clamped, returns what was set
  consume(): boolean;            // false when dry
}
```

`createReady(kind)` picks the container the kind actually ships in, so a level
that just wants "some ready ammunition for this weapon" never switches on it.

## Instancing is not an optimisation here, it is the feature

A 200-link belt is 200 rounds. Built as meshes that is 400 draw calls for one
prop, and [`npm run geometry`](geometry.md) refuses it — correctly. Every
container renders its rounds as **one `InstancedMesh` per part**, and
`setCount` rewrites instance matrices rather than adding or removing anything.

Measured:

| fixture | draws | triangles |
|---|---|---|
| 100-round 12.7 mm belt | **3** | 6000 |
| 30-round rifle magazine | **3** | 1452 |
| 8-shell artillery rack | **4** | 972 |
| 24-arrow quiver | **4** | 1176 |
| open rifle crate | **4** | 2904 |
| 100 spent cases | **1** | 3200 |

A magazine that empties therefore costs the same as a full one, which is what
lets a game put a belt on every gunner in a firefight. That is a unit test
(`COSTS THE SAME EMPTY AS FULL`) and a gate: rebuilding the belt's links as
individual meshes — a completely plausible way to write it — takes `beltHeavy`
from 3 draws to **103**, and the gate says so.

Six budgets were guessed before they were measured and five of the six draw
counts were wrong, all of them too high. That is the failure mode that never
announces itself, and it is the argument for the gate in one line.

## Details that read as wrong if you get them wrong

- **A fired case has no bullet in it.** `createCasing` scatters cases, not
  rounds. This is the most common mistake in a scattered-brass prop and it is
  instantly obvious to anyone who has seen a range floor.
- **Caseless rounds eject nothing.** A mortar bomb, an arrow, a grenade and a
  bagged-charge artillery shell leave no brass, and `createCasing` returns an
  empty prop for them rather than inventing litter.
- **A sealed crate pays for nothing it cannot show.** `open: false` builds the
  box and no contents; a level has a hundred of them.
- **A tank round's dart is much narrower than the bore.** That is the entire
  point of the round and the only thing that distinguishes it from a shell.
- **A driving band.** Three millimetres of copper near the base of a shell,
  and the difference between "a shell" and "a grey cylinder".

## What is not here yet

Stripper clips and speedloaders, a bandolier that drapes on a body, rifle
grenades, canister and grapeshot, powder kegs and separate propellant charges,
and an ammunition *dump* — a pallet-scale arrangement rather than a single
container.

The [`ammunition` playground](?example=ammunition) puts one station per kind in
a grid: the round, the ready state it actually ships in, and the brass it
leaves behind. Watch the containers drain and reload — every one of them at a
rate taken from its own ballistics, so the belt-fed kinds empty fast and the
racked ones do not.
