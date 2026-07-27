# The beach kit — Miami

The props that turn sand into a **beach**: the art-deco lifeguard stand, the striped umbrella, the lounger. Miami Beach's towers are the reason this file has a palette — pastel geometric huts on stilts, no two the same colours, and a row of them is unmistakably that beach.

```js
import { createLifeguardTower, createBeachUmbrella, createLounger } from 'scena3d';

const tower = createLifeguardTower({ seed: 3 });
const shade = createBeachUmbrella({ seed: 4 });
const chair = createLounger({ seed: 5, recline: 'reading' });
game.onUpdate((t) => { tower.update(t.delta); shade.update(t.delta); });
```

`MIAMI_COLORS` is the shared Ocean Drive palette — aqua, flamingo, lemon, mint, coral, sky, shell white. Every prop draws from it unless you name a colour.

## The lifeguard tower

Stilts raked outward (a tower on plumb legs looks like a table), a plank deck, three walls and a **wide open front** — you have to be able to see the water — a deco eyebrow band along each side, a jaunty overhanging roof tilted seaward, and the ramp up the back that reads as "lifeguard" from a hundred metres. Body and trim are always two *different* pastels, tested across seeds.

It flies a red pennant driven by the shared cloth-wave shader (the same one behind the flags and the palm fronds), and carries a `watch` slot on the deck with an approach on the sand: characters walk to the foot, then climb.

## The umbrella

A pole buried a foot in the sand, and a canopy of twelve alternating vertex-coloured gores drooping at the rim — an umbrella is a cone that has given up a little at the edges. Every one leans (`tilt`, seeded — nobody plants a parasol plumb) and sways continuously in the sea breeze: about a degree, never stopping. Tested both ways: it must move, and it must never move much.

## The lounger

Frame rails, stubby legs, and a **slatted** bed (a solid slab reads as a table), with the back hinged at the head end at one of three reclines — `flat`, `reading`, `upright`. The slot follows the recline: `flat` offers a `sleep` pose, the others `sit`. About half of them (seeded, or `towel`) have a towel thrown across the bed.

## The scene

The **beach** playground is South Beach at noon, framed from over the water looking in: turquoise shallows and deep blue out, a foam waterline, the sand and its kit, tall cloth palms, and a row of pastel deco facades with white eyebrow bands along the back.

Two lessons from building it, both of which are really one lesson about *water*:

- **fog can eat the sea.** An ocean parked at the fog's far plane dissolves into the sky and reads as a band of dust. The fix is not a colour: it is putting the water well inside the fog range.
- **the sand and the sea need one profile.** Give `createOcean` the *same* height function the beach mesh uses as its `shore` (sampled in the ocean's own space, so don't offset the plane), or the water fades against a beach that isn't there. And keep the beach face steep enough that the see-through shallows are a narrow band — a gentle slope leaves a wide sheet of near-transparent water, and the sand under it reads as a tongue of beach sticking into the sea.
