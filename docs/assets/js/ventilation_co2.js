/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Conservative tidal gas transport. CO2 amounts are L BTPS, volumes L, time s.
// Two lung gas stores exchange with a shared tissue-equivalent store through
// equal illustrative conductances (not blood flow). A plug-flow airway plus
// a stirred mixing region carry gas bidirectionally. Sensor filtering is separate.
const VentilationCO2 = (() => {
  const pressure = 713,
    exchange = 0.5,
    sensorTime = 0.04;
  function create(p, initialVolume = 0, seed, maxStep = 0.01) {
    if (!Number.isFinite(maxStep) || maxStep <= 0 || maxStep > 0.05)
      throw Error('Invalid CO₂ integration step.');
    const airwayVolume = p.VD / 1000;
    const mixingVolume = airwayVolume * (p.airwayMix ?? 0);
    const plugVolume = airwayVolume - mixingVolume;
    const source = ((p.VCO2 / 60000) * 863) / pressure;
    let volumes = Array.isArray(initialVolume)
      ? initialVolume.slice()
      : [initialVolume / 2, initialVolume / 2];
    let lungVolumes = volumes.map((v) => p.FRC / 2 + v);
    let lungMasses = lungVolumes.map(
      (v, i) => v * (seed?.lungFractions?.[i] ?? seed?.lungFraction ?? p.CO2Initial / pressure),
    );
    let tissueMass =
      p.CO2Store * (seed?.tissueFraction ?? p.CO2Initial / pressure + source / exchange);
    let parcels =
      (seed?.plugVolume ?? seed?.airwayVolume) === plugVolume && seed?.parcels
        ? seed.parcels.map((p) => ({ ...p }))
        : plugVolume > 0
          ? [{ volume: plugVolume, fraction: seed?.plugFraction ?? seed?.airwayFraction ?? 0 }]
          : [];
    let airwayMass = plugVolume * (seed?.plugFraction ?? seed?.airwayFraction ?? 0);
    let mixingMass = mixingVolume * (seed?.mixFraction ?? seed?.airwayFraction ?? 0);
    let measured = seed?.measured ?? 0,
      gasTarget = seed?.measured ?? 0,
      produced = 0,
      exhaled = 0,
      time = 0;
    const sum = (a) => a[0] + a[1];
    const initialMass = sum(lungMasses) + tissueMass + airwayMass + mixingMass;
    // Exact well-mixed tank response to a constant-composition gas parcel.
    // Incoming = stored change + outgoing; mixing affects both flow directions.
    function mix(amount, fraction) {
      if (!mixingVolume) return { mass: amount * fraction, fraction };
      const before = mixingMass / mixingVolume;
      const displaced = mixingVolume * -Math.expm1(-amount / mixingVolume);
      const mass = before * displaced + fraction * Math.max(0, amount - displaced);
      mixingMass += amount * fraction - mass;
      return { mass, fraction: mixingMass / mixingVolume };
    }
    function transport(amount, fraction, inspiration) {
      if (!(amount > 0)) return { mass: 0, fraction: inspiration ? 0 : fraction, chunks: [] };
      if (!plugVolume)
        return { mass: amount * fraction, fraction, chunks: [{ volume: amount, fraction }] };
      const parcel = { volume: amount, fraction };
      const index = inspiration ? 0 : parcels.length - 1;
      if (parcels.length && Math.abs(parcels[index].fraction - fraction) < 1e-10)
        parcels[index].volume += amount;
      else if (inspiration) parcels.unshift(parcel);
      else parcels.push(parcel);
      let remaining = amount,
        mass = 0,
        outgoing = 0;
      const chunks = [];
      while (remaining > 1e-14 && parcels.length) {
        const i = inspiration ? parcels.length - 1 : 0,
          part = parcels[i];
        const take = Math.min(remaining, part.volume);
        mass += take * part.fraction;
        chunks.push({ volume: take, fraction: part.fraction });
        outgoing = part.fraction;
        remaining -= take;
        part.volume -= take;
        if (part.volume < 1e-14) {
          if (inspiration) parcels.pop();
          else parcels.shift();
        }
      }
      airwayMass += amount * fraction - mass;
      return { mass, fraction: outgoing, chunks };
    }
    function advance(nextTime, mechanics) {
      const total = nextTime - time;
      if (total <= 1e-12) return read(false);
      // Resolve both tissue exchange and changing tidal volume. Parcel transfer
      // is conservative even when one step flushes the entire dead space.
      const last = mechanics(nextTime);
      const nextVolumes = last.regionVolumes?.map((v) => v / 1000) ?? [
        last.v / 2000,
        last.v / 2000,
      ];
      const count = Math.max(
        1,
        Math.ceil(total / maxStep),
        Math.ceil(nextVolumes.reduce((s, v, i) => s + Math.abs(v - volumes[i]), 0) / 0.01),
      );
      const start = time;
      for (let i = 1; i <= count; i++) {
        const t = start + (total * i) / count,
          dt = t - time;
        const point = mechanics(t);
        const next = point.regionVolumes?.map((v) => v / 1000) ?? [point.v / 2000, point.v / 2000];
        const dv = next.map((v, i) => v - volumes[i]);
        const ft = tissueMass / p.CO2Store;
        const transfers = lungMasses.map((m, i) => (exchange / 2) * (ft - m / lungVolumes[i]) * dt);
        const made = source * dt;
        tissueMass += made - sum(transfers);
        lungMasses = lungMasses.map((m, i) => m + transfers[i]);
        produced += made;
        const incoming = dv.map((v) => Math.max(0, v)),
          outgoing = dv.map((v) => Math.max(0, -v));
        const I = sum(incoming),
          E = sum(outgoing);
        const outgoingMass = outgoing.map((v, i) => (v * lungMasses[i]) / lungVolumes[i]);
        lungMasses = lungMasses.map((m, i) => m - outgoingMass[i]);
        let target = mixingVolume ? (mixingMass / mixingVolume) * pressure : gasTarget;
        if (I >= E) {
          const amount = I - E;
          const fresh = mix(amount, 0),
            returned = transport(amount, amount > 0 ? fresh.mass / amount : 0, true);
          const fraction = I > 0 ? (sum(outgoingMass) + returned.mass) / I : 0;
          lungMasses = lungMasses.map((m, i) => m + incoming[i] * fraction);
          if (amount > 0) target = mixingVolume ? fresh.fraction * pressure : 0;
        } else {
          const fraction = sum(outgoingMass) / E;
          lungMasses = lungMasses.map((m, i) => m + incoming[i] * fraction);
          const out = transport(E - I, fraction, false);
          for (const chunk of out.chunks) {
            const mixed = mix(chunk.volume, chunk.fraction);
            exhaled += mixed.mass;
            target = mixed.fraction * pressure;
          }
        }
        measured += (target - measured) * -Math.expm1(-dt / sensorTime);
        gasTarget = target;
        lungVolumes = next.map((v) => p.FRC / 2 + v);
        volumes = next;
        time = t;
      }
      return read(false);
    }
    function read(includeState = true) {
      const fractions = lungMasses.map((m, i) => m / lungVolumes[i]);
      const lungFraction = sum(lungMasses) / sum(lungVolumes);
      const stored = sum(lungMasses) + tissueMass + airwayMass + mixingMass;
      const valid = [...fractions, tissueMass / p.CO2Store].every((f) => f >= 0 && f < 1);
      return {
        measured: valid ? measured : null,
        alveolar: valid ? pressure * lungFraction : null,
        alveolarRegions: fractions.map((f) => (valid ? pressure * f : null)),
        stored,
        produced,
        exhaled,
        initialMass,
        residual: stored + exhaled - initialMass - produced,
        state: includeState
          ? {
              lungFraction,
              lungFractions: fractions,
              tissueFraction: tissueMass / p.CO2Store,
              airwayFraction: airwayVolume ? (airwayMass + mixingMass) / airwayVolume : 0,
              plugFraction: plugVolume ? airwayMass / plugVolume : 0,
              mixFraction: mixingVolume ? mixingMass / mixingVolume : 0,
              plugVolume,
              mixingVolume,
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
