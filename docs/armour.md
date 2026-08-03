# Armour

What a plate takes, and the second half of a handshake.

```ts
import { plateStrength, mailStrength, createArmour } from 'scena3d';

plateStrength({ alloy: 'wroughtIron', thickness: 0.002, hole: 0.009 });
// { pressure: 600 MPa, force: 38.2 kN, energy: 76.3 J,
//   mass: 2.44 kg, punchingEnergy: 19.6 J }
```

SCENA has never heard of an arrow. This file says what it costs to push a hard
point through a sheet of metal, from the metal's yield strength and a ruler, and
stops.

---

## The obvious model is the wrong mechanism

Shearing a plug out — perimeter × thickness × shear strength — is what every
press-tool handbook uses for punching holes, and handed a 9 mm bodkin and 2 mm
of wrought iron it says **19.6 joules**. The measured figure is nearly ten times
that.

A sharp point does not shear a plug. It **opens a hole**, pushing metal aside
radially, and what that costs is the metal's *indentation* pressure — which
Tabor measured in 1951 and which is about three times the yield stress. It is
also, and not coincidentally, what a hardness test measures.

```
p = 3·σ_y            Tabor's relation
F = p · π·d²/4       over the point's own frontal area
E = F · t            through the thickness
```

```
alloy            yield   indent    F(9 mm)    E(2 mm)   punching  ratio
wrought iron    200 MPa  600 MPa   38.2 kN     76.3 J     19.6 J   3.9×
mild steel      250 MPa  750 MPa   47.7 kN     95.4 J     26.1 J   3.7×
medium carbon   400 MPa 1200 MPa   76.3 kN    152.7 J     42.4 J   3.6×
hardened       1100 MPa 3300 MPa  209.9 kN    419.9 J     91.4 J   4.6×
bronze          180 MPa  540 MPa   34.4 kN     68.7 J     22.9 J   3.0×
```

Both numbers are reported. A model that is only ever right is a model nobody has
checked against the alternative.

---

## What it is wrong against

Alan Williams (*The Knight and the Blast Furnace*, 2003) measured energies to
defeat armour: **about 175 J for 2 mm plate**, and around **120 J for mail over
padding**. English war-bow arrows carry 80–120 J.

Against that, this file's 2 mm plate comes out at **76 J** in wrought iron and
**153 J** in good medium-carbon steel. It should come out under, and it does:
Williams's figures are *system* figures and include dishing the plate over a
hand's breadth, the arrow bending, and whatever is underneath. This models the
hole and nothing else.

> The gap between them is not noise. It is **the energy that goes into bending
> the plate rather than piercing it** — and that is the whole argument about
> whether arrows defeated plate armour.

---

## Mail is not what stops the arrow

```ts
mailStrength();  // { force: 679 N, energy: 3.05 J, areal: 10.8 kg/m² }
```

A point entering a ring loads it in tension across two sections of wire. The
wire is 1.2 mm, so the force is a few hundred newtons and the energy is **three
joules** — against an arrow's hundred and twenty.

That is not a defect. It is the reason mail was never worn on its own. What
stops the arrow is the padding under it, the padding is textile, and SCENA has
no business knowing the fracture toughness of linen. **That number lives in
ANIMA**, in a module about cutting people, and neither package imports the
other.

The areal density lands at **10.8 kg/m²** — surviving riveted mail is 8–12 —
which is a check nobody asked for, from wire diameter and ring pitch alone.

---

## The prop takes joules, and `createBoard` takes newtons

That is deliberate and it is the interesting part.

A board fails when its outer fibre reaches its rupture stress, so what a person
runs out of is **force**. A plate fails when a hole has been opened all the way
through, so what runs out is **work** — force through the thickness.

The two props take different units because they fail by different mechanisms.
Making them match would be tidier and wrong.

```ts
const plate = createArmour({ alloy: 'mediumCarbon', thickness: 0.002 });
plate.strike(160);   // joules in, holed or not out
```
