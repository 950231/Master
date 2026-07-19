# Fusion Energy Balance Simulator

A physics simulation of a deuterium-tritium fusion plasma — the closest real
thing to "unlimited power." The fuel (deuterium) comes from ordinary seawater,
and one glass of water holds as much fusion energy as ~250 litres of petrol.
Nothing here breaks conservation of energy: the energy comes from converting
a tiny bit of nuclear mass into heat (E = mc²), same as the Sun.

## What it answers

A fusion plasma is a race between three flows of power:

| Flow | Direction | Physics |
|------|-----------|---------|
| Fusion / alpha heating | in | D + T → He (3.5 MeV) + neutron (14.1 MeV) |
| Bremsstrahlung | out | hot electrons radiate X-rays |
| Conduction | out | heat leaks from the plasma edge (confinement time τ_E) |

The simulator finds where fusion wins:

- **Breakeven (Q = 1)** — fusion power out equals heating power in
- **Ignition (Q = ∞)** — alpha particles alone keep the plasma hot; the
  external heating can be switched off and it burns like a tiny star
- **The Lawson triple product** n·T·τ_E — the single number that decides
  whether any machine can ignite (~3×10²¹ keV·s/m³ minimum, near 14 keV)

## Run it

```bash
pip install numpy matplotlib
python3 fusion_energy_balance.py                     # ITER-like plasma
python3 fusion_energy_balance.py --tau 0.9 --density 4e19   # 1997 JET-like
```

Outputs the breakeven/ignition temperatures, the fusion gain Q, and a plot
(`fusion_energy_balance.png`) of the power balance and the Lawson criterion.

## What you'll discover

- With ITER-like values (n = 10²⁰ m⁻³, τ_E = 3 s) the plasma **ignites at
  ~124 million °C** — that's why every serious machine targets ~150 M°C.
- With 1990s confinement (τ_E = 0.9 s) ignition is **impossible at any
  temperature** — matching history: JET peaked at Q = 0.67 in 1997.
- The whole 70-year fusion race is the fight to raise one number: τ_E.
  That's what the giant magnets, the plasma shaping, and ITER's sheer size
  are for.

Reference results: JET 1997 Q = 0.67 · NIF 2022 Q = 1.5 (first net gain) ·
ITER target Q = 10 · a power plant needs Q > 30.
