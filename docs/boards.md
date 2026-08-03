# Breaking boards

*Tameshiwari* — and a number SCENA is willing to be wrong about in public.

```ts
import { boardStrength, createBoard } from 'scena3d';

boardStrength({ timber: 'pine', thickness: 0.019 });
// { force: 4100 N, deflection: 0.92 mm, energy: 1.9 J, mass: 0.65 kg }

const boards = createBoard({ count: 3 });
boards.strike(9000); // newtons in, boards broken out
```

---

## Everything comes from four published numbers

| | source |
|---|---|
| modulus of rupture | Wood Handbook (USDA FPL), clear wood at 12% moisture |
| Young's modulus | same |
| strength ratio | ASTM D245 visual grading, ≈ 0.35 for construction grades |
| three-point bending | `F = 2σbd² / 3L`, the standard simply-supported relation |

```
I = b·d³/12                second moment of area
F = ratio · 2σbd² / (3L)   load at which the outer fibre reaches σ
δ = F·L³ / (48·E·I)        how far the middle has gone by then
U = ½·F·δ                  the work done getting there
```

```
timber          MOR     force   deflect   energy   mass
pine         41.4MPa   4.10kN   0.92mm     1.9J   0.65kg
poplar       69.6MPa   6.90kN   1.27mm     4.4J   0.78kg
cedar        51.7MPa   5.12kN   1.34mm     3.4J   0.60kg
oak         102.3MPa  10.14kN   1.66mm     8.4J   1.29kg
pineWet      34.5MPa   3.42kN   1.01mm     1.7J   0.65kg
```

### It has been checked against the world

Feld, McNair and Wilk measured a hand going through a 30 × 15 × 2.5 cm pine
board in *Scientific American* in 1979 and put the breaking force at about
**3.1 kN**. Handed that board's dimensions and nothing else, the formulae above
say **3.62 kN**.

A 17% error, from four published numbers with no fitting. That is the point of
deriving rather than choosing: the number can be **wrong, out loud**, against
somebody else's measurement.

The strength ratio is what makes that true. Without it — clear-wood values
straight out of the handbook — the same board comes out at 10.4 kN, three times
the measured figure, and looks entirely plausible while doing it.

---

## Two things the algebra says that intuition does not

### Energy is linear in thickness

Thickness is squared in the force and cubed in the stiffness, so the obvious
conclusion is that a board twice as thick takes eight times as much. That is
what was written here first, and it is wrong: the `d³` is in the **stiffness**,
and a stiffer beam reaches its failure stress *sooner*. The deflection at
failure falls as `1/d`, and

```
U ∝ σ²·b·d·L / E
```

comes out **linear**. Six boards glued into one thick beam take exactly the same
energy as six separate ones, to the joule — which `stackStrength` reports side
by side because it is hard to believe otherwise.

### So what are the spacers for? Force.

```
six spaced boards   4.10 kN, six times, one at a time
six glued           147.7 kN, all at once
```

36× the force, and no person produces 147 kN. **The spacers are a force
argument, not an energy one**, and nothing about that is visible until the two
are computed separately.

---

## And what it settles about breaking boards

`strike()` takes **newtons**, not joules, because force is what breaks a beam:
the outer fibre reaches its rupture stress or it does not.

That is not a stylistic choice. ANIMA independently derives a strike's kinetic
energy from Dempster's segment masses and a measured surface velocity — it has
never heard of this file — and puts a hammerfist at **113 J** against a pine
board's **1.9 J**.

**Energy is not what limits board breaking. It is out by a factor of sixty.**
Every strike ANIMA can measure carries between 10× and 400× the energy a pine
board needs. What a person runs out of is force, in the first millimetre, and
that is what the threshold is stated in.

Two libraries that have never imported each other, each deriving its own half in
its own units, is what made that checkable.
