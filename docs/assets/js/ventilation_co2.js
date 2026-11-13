/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Conservative tidal gas transport. CO2 amounts are L BTPS, volumes L, time s.
// A lung gas store and a lumped tissue-equivalent store exchange CO2 through
// an illustrative conductance (not blood flow). FIFO parcels carry airway gas
// in both directions. A separate sensor response does not alter gas balance.
const VentilationCO2 = (() => {
  const pressure = 713,
    exchange = 0.5,
    sensorTime = 0.04;
  function create(p, initialVolume = 0, seed, maxStep = 0.01) {
    if (!Number.isFinite(maxStep) || maxStep <= 0 || maxStep > 0.05)
      throw Error('Invalid CO₂ integration step.');
    const airwayVolume = p.VD / 1000;
    const source = ((p.VCO2 / 60000) * 863) / pressure;
    let lungVolume = p.FRC + initialVolume;
    let lungMass = lungVolume * (seed?.lungFraction ?? p.CO2Initial / pressure);
    let tissueMass =
      p.CO2Store * (seed?.tissueFraction ?? p.CO2Initial / pressure + source / exchange);
    let parcels =
      seed?.airwayVolume === airwayVolume && seed?.parcels
        ? seed.parcels.map((p) => ({ ...p }))
        : airwayVolume > 0
          ? [{ volume: airwayVolume, fraction: seed?.airwayFraction ?? 0 }]
          : [];
    let airwayMass = airwayVolume * (seed?.airwayFraction ?? 0);
    let measured = seed?.measured ?? 0,
      gasTarget = seed?.measured ?? 0,
      produced = 0,
      exhaled = 0,
      time = 0,
      volume = initialVolume;
    const initialMass = lungMass + tissueMass + airwayMass;
    function transport(amount, fraction, inspiration) {
      if (!(amount > 0)) return { mass: 0, fraction: inspiration ? 0 : fraction };
      if (!airwayVolume) return { mass: amount * fraction, fraction };
      const parcel = { volume: amount, fraction };
      const index = inspiration ? 0 : parcels.length - 1;
      if (parcels.length && Math.abs(parcels[index].fraction - fraction) < 1e-10)
        parcels[index].volume += amount;
      else if (inspiration) parcels.unshift(parcel);
      else parcels.push(parcel);
      let remaining = amount,
        mass = 0,
        outgoing = 0;
      while (remaining > 1e-14 && parcels.length) {
        const i = inspiration ? parcels.length - 1 : 0,
          part = parcels[i];
        const take = Math.min(remaining, part.volume);
        mass += take * part.fraction;
        outgoing = part.fraction;
        remaining -= take;
        part.volume -= take;
        if (part.volume < 1e-14) {
          if (inspiration) parcels.pop();
          else parcels.shift();
        }
      }
      airwayMass += amount * fraction - mass;
      return { mass, fraction: outgoing };
    }
    function advance(nextTime, mechanics) {
      const total = nextTime - time;
      if (total <= 1e-12) return read(false);
      // Resolve both tissue exchange and changing tidal volume. Parcel transfer
      // is conservative even when one step flushes the entire dead space.
      const nextVolume = mechanics(nextTime).v / 1000;
      const count = Math.max(
        1,
        Math.ceil(total / maxStep),
        Math.ceil(Math.abs(nextVolume - volume) / 0.01),
      );
      const start = time;
      for (let i = 1; i <= count; i++) {
        const t = start + (total * i) / count,
          dt = t - time;
        const point = mechanics(t),
          v = point.v / 1000,
          dv = v - volume;
        const fa = lungMass / lungVolume,
          ft = tissueMass / p.CO2Store;
        const transfer = exchange * (ft - fa) * dt;
        const made = source * dt;
        tissueMass += made - transfer;
        lungMass += transfer;
        produced += made;
        let target = point.phase === 'expiration' ? gasTarget : 0;
        if (dv > 0) lungMass += transport(dv, 0, true).mass;
        else if (dv < 0) {
          const fraction = lungMass / lungVolume;
          const out = transport(-dv, fraction, false);
          lungMass -= -dv * fraction;
          exhaled += out.mass;
          target = out.fraction * pressure;
        }
        measured += (target - measured) * -Math.expm1(-dt / sensorTime);
        gasTarget = target;
        lungVolume = p.FRC + v;
        volume = v;
        time = t;
      }
      return read(false);
    }
    function read(includeState = true) {
      const stored = lungMass + tissueMass + airwayMass;
      const valid = [lungMass / lungVolume, tissueMass / p.CO2Store].every((f) => f >= 0 && f < 1);
      return {
        measured: valid ? measured : null,
        alveolar: valid ? (pressure * lungMass) / lungVolume : null,
        stored,
        produced,
        exhaled,
        initialMass,
        residual: stored + exhaled - initialMass - produced,
        state: includeState
          ? {
              lungFraction: lungMass / lungVolume,
              tissueFraction: tissueMass / p.CO2Store,
              airwayFraction: airwayVolume ? airwayMass / airwayVolume : 0,
              measured,
              airwayVolume,
              parcels: parcels.map((p) => ({ ...p })),
            }
          : null,
        valid,
      };
    }
    return { advance, read };
  }
  return { create };
})();
