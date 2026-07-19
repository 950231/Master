"""Fusion reactor energy balance simulator.

Models a deuterium-tritium (D-T) plasma — the fuel of ITER and future
power plants — and answers the central question of fusion energy:

    At what temperature, density, and confinement does the plasma
    produce more power than it loses?

Physics included:
  * D-T fusion reactivity <sigma-v> (Bosch-Hale 1992 parameterization)
  * Fusion power density and alpha-particle self-heating
  * Bremsstrahlung radiation losses
  * Thermal conduction losses via the energy confinement time tau_E
  * The Lawson criterion / triple product n*T*tau_E for ignition

Run:
    python3 fusion_energy_balance.py                # default ITER-like plasma
    python3 fusion_energy_balance.py --density 1.5e20 --tau 4.0
"""

import argparse
import math

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ---------------------------------------------------------------------------
# Physical constants
# ---------------------------------------------------------------------------
KEV_TO_J = 1.602176634e-16       # 1 keV in joules
E_FUSION_KEV = 17_590.0          # total energy per D-T reaction (17.59 MeV)
E_ALPHA_KEV = 3_520.0            # alpha particle share (3.52 MeV) - heats plasma
C_BREMS = 5.35e-37               # bremsstrahlung coefficient, W m^3 keV^-0.5


def dt_reactivity(t_kev):
    """D-T fusion reactivity <sigma-v> in m^3/s (Bosch & Hale, Nucl. Fusion 1992).

    Valid for ion temperatures 0.2 - 100 keV. This curve is why fusion
    needs ~150 million degrees: below ~4 keV the nuclei almost never
    tunnel through their electric repulsion.
    """
    t = np.asarray(t_kev, dtype=float)
    bg = 34.3827                  # Gamow constant, sqrt(keV)
    mrc2 = 1_124_656.0            # reduced mass energy, keV
    c1, c2, c3 = 1.17302e-9, 1.51361e-2, 7.51886e-2
    c4, c5, c6, c7 = 4.60643e-3, 1.35000e-2, -1.06750e-4, 1.36600e-5

    theta = t / (1.0 - (t * (c2 + t * (c4 + t * c6)))
                 / (1.0 + t * (c3 + t * (c5 + t * c7))))
    xi = (bg ** 2 / (4.0 * theta)) ** (1.0 / 3.0)
    sigma_v_cm3 = c1 * theta * np.sqrt(xi / (mrc2 * t ** 3)) * np.exp(-3.0 * xi)
    return sigma_v_cm3 * 1e-6    # cm^3/s -> m^3/s


def power_balance(t_kev, n_e, tau_e):
    """Power densities (W/m^3) for a 50/50 D-T plasma.

    n_e   : electron density in m^-3 (n_D = n_T = n_e/2)
    tau_e : energy confinement time in seconds
    """
    sv = dt_reactivity(t_kev)
    n_dt = (n_e / 2.0) ** 2                       # n_D * n_T

    p_fusion = n_dt * sv * E_FUSION_KEV * KEV_TO_J
    p_alpha = n_dt * sv * E_ALPHA_KEV * KEV_TO_J   # stays in the plasma
    p_brems = C_BREMS * n_e ** 2 * np.sqrt(t_kev)  # radiated away as X-rays
    p_conduction = 3.0 * n_e * t_kev * KEV_TO_J / tau_e  # heat leaking out

    return p_fusion, p_alpha, p_brems, p_conduction


def q_factor(t_kev, n_e, tau_e):
    """Fusion gain Q = fusion power / external heating power.

    External heating must cover whatever losses the alpha particles
    can't. Q = infinity means ignition: the plasma keeps itself hot.
    """
    p_fusion, p_alpha, p_brems, p_cond = power_balance(t_kev, n_e, tau_e)
    p_ext = p_brems + p_cond - p_alpha
    q = np.where(p_ext > 0, p_fusion / np.maximum(p_ext, 1e-30), np.inf)
    return q


def required_triple_product(t_kev):
    """Minimum n*T*tau_E (keV s / m^3) for ignition at each temperature."""
    sv = dt_reactivity(t_kev)
    # Ignition: alpha heating >= conduction + bremsstrahlung. Solving the
    # balance for n*tau_E and multiplying by T gives the triple product.
    # Both alpha heating and bremsstrahlung scale as n^2, so the balance
    # solves cleanly for n*tau_E: n*tau >= 3T / (E_alpha*sv/4 - C_B*sqrt(T)).
    e_alpha_j = E_ALPHA_KEV * KEV_TO_J
    net = sv * e_alpha_j / 4.0 - C_BREMS * np.sqrt(t_kev)
    n_tau = np.where(net > 0, 3.0 * t_kev * KEV_TO_J / net, np.inf)
    return n_tau * t_kev


def main():
    parser = argparse.ArgumentParser(description="D-T fusion energy balance")
    parser.add_argument("--density", type=float, default=1.0e20,
                        help="electron density in m^-3 (default 1e20, ITER-like)")
    parser.add_argument("--tau", type=float, default=3.0,
                        help="energy confinement time in s (default 3.0, ITER target)")
    parser.add_argument("--plot", default="fusion_energy_balance.png",
                        help="output plot filename")
    args = parser.parse_args()

    n_e, tau_e = args.density, args.tau
    temps = np.linspace(1.0, 100.0, 2000)

    p_fus, p_alpha, p_brems, p_cond = power_balance(temps, n_e, tau_e)
    q = q_factor(temps, n_e, tau_e)

    # --- headline numbers ---------------------------------------------------
    ignited = p_alpha >= (p_brems + p_cond)
    breakeven = q >= 1.0

    print("=" * 66)
    print("D-T FUSION ENERGY BALANCE")
    print(f"  density n = {n_e:.2e} m^-3   confinement tau_E = {tau_e:.1f} s")
    print("=" * 66)

    if breakeven.any():
        t_be = temps[breakeven][0]
        print(f"  Scientific breakeven (Q=1) reached at T >= {t_be:5.1f} keV "
              f"(~{t_be * 11.6:.0f} million deg C)")
    else:
        print("  Q never reaches 1 -- this plasma always needs more heating"
              " power than it produces. Increase density or confinement.")

    if ignited.any():
        t_ig = temps[ignited][0]
        print(f"  IGNITION (self-sustaining)   at T >= {t_ig:5.1f} keV "
              f"(~{t_ig * 11.6:.0f} million deg C)")
    else:
        print("  Ignition: NOT reached at any temperature with these values.")

    i_peak = int(np.argmax(np.where(np.isfinite(q), q, -1)))
    if np.isfinite(q[i_peak]):
        print(f"  Best gain: Q = {q[i_peak]:.1f} at T = {temps[i_peak]:.1f} keV")
    else:
        print(f"  Gain is unbounded (ignition) above T = {t_ig:.1f} keV")

    ntt = n_e * temps * tau_e
    req = required_triple_product(temps)
    i_min = int(np.argmin(req))
    print(f"  Your triple product at 15 keV: {n_e * 15 * tau_e:.2e} keV s/m^3")
    print(f"  Minimum required (best case):  {req[i_min]:.2e} keV s/m^3 "
          f"at T = {temps[i_min]:.1f} keV")
    print()
    print("  Reference points:")
    print("    JET 1997 record        Q = 0.67  (best magnetic result of 20th c.)")
    print("    NIF Dec 2022           Q = 1.5   (first lab gain > 1, laser fusion)")
    print("    ITER target (2030s)    Q = 10")
    print("    Power plant needs      Q > 30-50")
    print("=" * 66)

    # --- plots --------------------------------------------------------------
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.2))

    ax1.loglog(temps, p_fus / 1e6, label="Fusion power out", lw=2)
    ax1.loglog(temps, p_alpha / 1e6, label="Alpha self-heating", lw=2)
    ax1.loglog(temps, (p_brems + p_cond) / 1e6, label="Total losses", lw=2,
               color="crimson")
    ax1.loglog(temps, p_brems / 1e6, "--", label="Bremsstrahlung (X-rays)",
               alpha=0.6)
    ax1.set_xlabel("Plasma temperature (keV)  [1 keV ≈ 11.6 million °C]")
    ax1.set_ylabel("Power density (MW/m³)")
    ax1.set_title(f"Power balance  (n={n_e:.0e} m⁻³, τ={tau_e:.1f} s)")
    ax1.legend()
    ax1.grid(True, which="both", alpha=0.3)

    ax2.loglog(temps, req, lw=2, color="darkorange",
               label="Required for ignition")
    ax2.axhline(n_e * 15 * tau_e, color="steelblue", ls="--",
                label="This plasma @15 keV")
    machines = {"JET 1997": 8.7e20, "ITER target": 6.0e21}
    for name, val in machines.items():
        ax2.scatter([15], [val], zorder=5)
        ax2.annotate(name, (15, val), textcoords="offset points",
                     xytext=(8, -4), fontsize=9)
    ax2.set_xlabel("Plasma temperature (keV)")
    ax2.set_ylabel("Triple product n·T·τ  (keV·s/m³)")
    ax2.set_title("Lawson criterion: the mountain fusion must climb")
    ax2.legend()
    ax2.grid(True, which="both", alpha=0.3)

    fig.tight_layout()
    fig.savefig(args.plot, dpi=140)
    print(f"Plot saved to {args.plot}")


if __name__ == "__main__":
    main()
