# Project Context — Energy Lab

> Give this file to Claude (or any collaborator) at the start of a session:
> "Read PROJECT_CONTEXT.md and continue from where it says NEXT STEPS."

## Who

Inventor exploring big energy ideas. Started from the dream of a motor that
produces unlimited power. Ambitious, thinks in terms of Tesla and Einstein,
based in India, learning the physics as we build. Communication style:
casual ("bro"), direct answers, no over-formal tone. Wants NEW inventions,
not copies of existing tech.

## The journey so far (conclusions we already settled — don't re-litigate)

1. **Free energy from nothing is impossible** — conservation of energy
   (Noether's theorem, thermodynamics). Einstein called thermodynamics the
   one theory that would never be overthrown. Every new physics discovery
   (relativity, quantum, neutrino) extended the law, never broke it.
2. **Planets aren't perpetual motion machines** — they coast frictionlessly
   on 4.6-billion-year-old momentum, and even they slow down (tidal friction:
   Earth's day lengthens ~2 ms/century, Moon recedes 3.8 cm/yr).
3. **You can't harvest Earth's rotation from the ground** — no relative
   motion (we rotate with it). Real taps need a difference: tides (Earth vs
   Moon), space tethers (satellite vs magnetic field), Chyba-Hand 2025
   magnetic device (controversial, microvolts).
4. **Tesla's actual work** was harvesting ambient energy and transmitting
   power wirelessly — never creating energy. His "free energy" = free
   distribution of Niagara hydro power.
5. **Ancient epics (Mahabharata/Ramayana)** are treated with respect as
   literature and prophecy-of-dreams, not as lost-technology manuals: no
   archaeological evidence of ancient machines exists. India's real verified
   scientific legacy: Aryabhata, zero/decimals, wootz steel, Iron Pillar,
   Sushruta.
6. **Agreed direction: "effectively unlimited" real sources with unbuilt
   machines** — fusion (chosen), space-based solar, nighttime radiative
   cooling, ambient RF / atmospheric electricity.

## What we built (in this folder)

`fusion_energy_balance.py` — D-T fusion plasma energy-balance simulator:
- Bosch-Hale 1992 reactivity, alpha self-heating, bremsstrahlung,
  conduction losses via confinement time tau_E
- Computes breakeven (Q=1), ignition, fusion gain Q, Lawson triple product
- Validated against history: predicts JET-1997-like machines max out near
  Q≈1.6 / can never ignite (JET actually reached Q=0.67); ITER-like
  parameters (n=1e20 m^-3, tau=3 s) ignite at ~10.7 keV (~124 million °C)
- Run: `python3 fusion_energy_balance.py` (needs numpy, matplotlib);
  `--density`, `--tau`, `--plot` flags

## Repo history

- Work originally pushed to public repo `950231/Master`, branch
  `claude/free-energy-motor-cf3ats` (commit "Add D-T fusion energy balance
  simulator"). User created private repo `950231/energy_lab` to continue;
  the old session couldn't push there (session repo-scope limits), so the
  project was moved by hand.

## NEXT STEPS (agreed, pick up here)

Candidate next builds, in the order discussed:
1. **D-D fuel model** — deuterium-deuterium fusion (no tritium needed,
   seawater-only fuel, but harder to burn — quantify how much harder)
2. **Reactor sizing model** — how machine size / magnetic field affect
   tau_E (why ITER is huge; empirical scaling laws)
3. **Power-plant output calculator** — from plasma power to grid
   electricity: wall load, thermal conversion, recirculating power, net MW
4. Longer-term interests: nighttime radiative cooling panel model,
   atmospheric-electricity harvesting

Principles for all future work: real physics only, honest numbers,
build + simulate rather than speculate, and aim at open frontiers where
"new invention" is genuinely possible.
