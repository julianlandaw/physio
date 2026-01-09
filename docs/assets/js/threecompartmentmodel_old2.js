// ====== DOM wiring for labels and inputs ======
var Vd1html = document.getElementById("Vd1html");
Vd1html.innerHTML = "<i>V</i><sub>1</sub> (mL/kg)";
var Vd1num = document.getElementById("Vd1");
var Vd2html = document.getElementById("Vd2html");
Vd2html.innerHTML = "<i>V</i><sub>2</sub> (mL/kg)";
var Vd2num = document.getElementById("Vd2");
var Vd3html = document.getElementById("Vd3html");
Vd3html.innerHTML = "<i>V</i><sub>3</sub> (mL/kg)";
var Vd3num = document.getElementById("Vd3");
var Clhtml = document.getElementById("Clhtml");
Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (mL/kg/min)";
var Clnum = document.getElementById("Cl");
var Q2html = document.getElementById("Q2html");
Q2html.innerHTML = "<i>Q</i><sub>2</sub> (mL/kg/min)";
var Q2num = document.getElementById("Q2");
var Q3html = document.getElementById("Q3html");
Q3html.innerHTML = "<i>Q</i><sub>3</sub> (mL/kg/min)";
var Q3num = document.getElementById("Q3");
var bhtml = document.getElementById("bhtml");
bhtml.innerHTML = "Bolus (mg/kg)";
var bnum = document.getElementById("b");
var infusionhtml = document.getElementById("infusionhtml");
infusionhtml.innerHTML = "Infusion (mg/kg/min)";
var infusionnum = document.getElementById("infusion");
var tbolushtml = document.getElementById("tbolushtml");
tbolushtml.innerHTML = "Bolus Time (min)";
var tbolusnum = document.getElementById("tbolus");
var tinfusionhtml = document.getElementById("tinfusionhtml");
tinfusionhtml.innerHTML = "Infusion Time (min)";
var tinfusionnum = document.getElementById("tinfusion");
var initialphtml = document.getElementById("initialphtml");
initialphtml.innerHTML = "[<i>P</i>]<sub>init</sub> (mg/mL)";
var initialpnum = document.getElementById("initialp");
var tfinalhtml = document.getElementById("tfinalhtml");
tfinalhtml.innerHTML = "<i>t</i><sub>final</sub> (min)";
var tfinalnum = document.getElementById("tfinal");
var ke0html = document.getElementById("ke0html");
ke0html.innerHTML = "k<sub>e0</sub> (min<sup>-1</sup>)";
var ke0num = document.getElementById("ke0");
var pfinalhtml = document.getElementById("pfinalhtml");
pfinalhtml.innerHTML = 0;
var psshtml = document.getElementById("psshtml");
psshtml.innerHTML = 0;
var concentrationunitshtml1 = document.getElementById("concentrationunitshtml1");
concentrationunitshtml1.innerHTML = "mg/mL";
var concentrationunitshtml2 = document.getElementById("concentrationunitshtml2");
concentrationunitshtml2.innerHTML = "mg/mL";
var alphahtml = document.getElementById("alphahtml");
alphahtml.innerHTML = 0;
var betahtml = document.getElementById("betahtml");
betahtml.innerHTML = 0;
var gammahtml = document.getElementById("gammahtml");
gammahtml.innerHTML = 0;
var termhalflifehtml = document.getElementById("termhalflifehtml");
termhalflifehtml.innerHTML = 0;
var k10html = document.getElementById("k10html");
k10html.innerHTML = 0;
var k12html = document.getElementById("k12html");
k12html.innerHTML = 0;
var k13html = document.getElementById("k13html");
k13html.innerHTML = 0;
var k21html = document.getElementById("k21html");
k21html.innerHTML = 0;
var k31html = document.getElementById("k31html");
k31html.innerHTML = 0;
var contextsensitivehalflifehtml = document.getElementById("contextsensitivehalflifehtml");
contextsensitivehalflifehtml.innerHTML = 0;

function roundToSignificantFigures(num, sigFigs) {
  if (num === 0) return 0; // Handle 0 separately
  const magnitude = math.floor(math.log10(Math.abs(num)));
  const factor = 10 ** (sigFigs - magnitude - 1);
  return math.round(num * factor) / factor;
}

// ====== Units (display only; internal math stays mg/mL) ======
const UNITS = {
  'mg/mL': { name: 'mg/mL', factor: 1 },
  'µg/mL': { name: 'µg/mL', factor: 1e3 },
  'ng/mL': { name: 'ng/mL', factor: 1e6 }
};
let currentUnit = UNITS['mg/mL'];
function setDisplayUnit(unitName) {
  currentUnit = UNITS[unitName] || UNITS['mg/mL'];
  initialphtml.innerHTML = "[<i>P</i>]<sub>init</sub> (" + unitName + ")";
  concentrationunitshtml1.innerHTML = unitName;
  concentrationunitshtml2.innerHTML = unitName;
}

const BOLUSUNITS = {
  'mg/kg': { name: 'mg/kg', factor: 1 },
  'µg/kg': { name: 'µg/kg', factor: 1e3 },
  'ng/kg': { name: 'ng/kg', factor: 1e6 }
};
let currentBolusUnit = BOLUSUNITS['mg/kg']
function setBolusUnit(unitName) {
  currentBolusUnit = BOLUSUNITS[unitName] || BOLUSUNITS['mg/kg'];
  bhtml.innerHTML = 'Bolus (' + unitName + ')' || 'Bolus (mg/kg)';
}

const INFUSIONUNITS = {
  'mg/kg/min': { name: 'mg/kg/min', factor: 1 },
  'µg/kg/min': { name: 'µg/kg/min', factor: 1e3 },
  'ng/kg/min': { name: 'ng/kg/min', factor: 1e6 },
  'mg/kg/hr': { name: 'mg/kg/min', factor: 60.0 },
  'µg/kg/hr': { name: 'µg/kg/min', factor: 1e3*60.0 },
  'ng/kg/hr': { name: 'ng/kg/min', factor: 1e6*60.0 }      
};
let currentInfusionUnit = INFUSIONUNITS['mg/kg/min']
function setInfusionUnit(unitName) {
  currentInfusionUnit = INFUSIONUNITS[unitName] || INFUSIONUNITS['mg/kg/min'];
  infusionhtml.innerHTML = 'Infusion (' + unitName + ')' || 'Infusion (mg/kg/min)';
}

// Track which drug preset is active
let currentDrug = null;
// Master toggle for showing therapeutic ranges (Ce)
let showTherapeutic = true;

// Map of therapeutic ranges (Cp & Ce), hard-coded
// Values are entered in their display units (see `unit` per band), not mg/mL.
// If a drug has no effect-site ranges, leave its array empty.
// Map of therapeutic ranges for both Cp (plasma) and Ce (effect-site).
// Values are entered in their display units (see `unit` per band), not mg/mL.
// Colors: Cp bands default to Cp line color (#1f77b4), Ce bands to Ce line color (#ff7f0e).
const EFFECT_SITE_RANGES = {
  "propofol": [
    {
      "label": "Sedation (plasma)",
      "unit": "\u00b5g/mL",
      "low": 1.0,
      "high": 2.0,
      "color": "#1f77b4"
    },
    {
      "label": "General anesthesia (plasma)",
      "unit": "\u00b5g/mL",
      "low": 3.0,
      "high": 6.0,
      "color": "#1f77b4"
    },
    {
      "label": "Effect-site hypnosis (Ce)",
      "unit": "\u00b5g/mL",
      "low": 2.5,
      "high": 4.0,
      "color": "#ff7f0e"
    }
  ],
  "etomidate": [
    {
      "label": "Hypnosis (plasma)",
      "unit": "\u00b5g/mL",
      "low": 0.2,
      "high": 0.4,
      "color": "#1f77b4"
    }
  ],
  "ketamine": [
    {
      "label": "Analgesia (plasma)",
      "unit": "ng/mL",
      "low": 100.0,
      "high": 200.0,
      "color": "#1f77b4"
    },
    {
      "label": "Dissociative anesthesia (plasma)",
      "unit": "\u00b5g/mL",
      "low": 1.0,
      "high": 2.0,
      "color": "#1f77b4"
    }
  ],
  "dexmedetomidine": [
    {
      "label": "Sedation (plasma)",
      "unit": "ng/mL",
      "low": 0.3,
      "high": 1.2,
      "color": "#1f77b4"
    },
    {
      "label": "Deep sedation (plasma)",
      "unit": "ng/mL",
      "low": 1.2,
      "high": 2.0,
      "color": "#1f77b4"
    }
  ],
  "midazolam": [
    {
      "label": "Sedation (plasma)",
      "unit": "\u00b5g/mL",
      "low": 0.05,
      "high": 0.15,
      "color": "#1f77b4"
    },
    {
      "label": "Anesthesia (plasma)",
      "unit": "\u00b5g/mL",
      "low": 0.2,
      "high": 0.5,
      "color": "#1f77b4"
    }
  ],
  "diazepam": [
    {
      "label": "Anxiolysis/sedation (plasma)",
      "unit": "\u00b5g/mL",
      "low": 0.2,
      "high": 2.0,
      "color": "#1f77b4"
    }
  ],
  "fentanyl": [
    {
      "label": "Analgesia (effect-site Ce)",
      "unit": "ng/mL",
      "low": 1.0,
      "high": 2.0,
      "color": "#ff7f0e"
    },
    {
      "label": "Anesthesia (effect-site Ce)",
      "unit": "ng/mL",
      "low": 2.0,
      "high": 4.0,
      "color": "#ff7f0e"
    }
  ],
  "hydromorphone": [],
  "remifentanil": [
    {
      "label": "Analgesia (effect-site Ce)",
      "unit": "ng/mL",
      "low": 1.0,
      "high": 3.0,
      "color": "#ff7f0e"
    },
    {
      "label": "Anesthesia (effect-site Ce)",
      "unit": "ng/mL",
      "low": 3.0,
      "high": 8.0,
      "color": "#ff7f0e"
    }
  ],
  "sufentanil": [
    {
      "label": "Analgesia (effect-site Ce)",
      "unit": "ng/mL",
      "low": 0.1,
      "high": 0.3,
      "color": "#ff7f0e"
    },
    {
      "label": "Anesthesia (effect-site Ce)",
      "unit": "ng/mL",
      "low": 0.3,
      "high": 0.7,
      "color": "#ff7f0e"
    }
  ],
  "alfentanil": [
    {
      "label": "Analgesia (effect-site Ce)",
      "unit": "ng/mL",
      "low": 50.0,
      "high": 150.0,
      "color": "#ff7f0e"
    },
    {
      "label": "Anesthesia (effect-site Ce)",
      "unit": "ng/mL",
      "low": 150.0,
      "high": 300.0,
      "color": "#ff7f0e"
    }
  ],
  "methadone": [
    {
      "label": "Analgesia (plasma)",
      "unit": "ng/mL",
      "low": 30.0,
      "high": 100.0,
      "color": "#1f77b4"
    }
  ],
  "rocuronium": [],
  "vecuronium": [],
  "cisatracurium": [],
  "pancuronium": [],
  "succinylcholine": [],
  "lidocaine": [
    {
      "label": "Antiarrhythmic therapeutic (plasma)",
      "unit": "\u00b5g/mL",
      "low": 1.5,
      "high": 5.0,
      "color": "#1f77b4"
    }
  ],
  "bupivacaine": [],
  "phenylephrine": [],
  "ephedrine": [],
  "epinephrine": [],
  "dobutamine": [],
  "dopamine": [],
  "milrinone": [],
  "vasopressin": []
};


// Convert a value expressed in `unitName` into the current display unit
// Internal math is mg/mL. Convert to mg/mL, then to current display unit.
function valToDisplayY(value, unitName) {
  const sourceUnit = UNITS[unitName];
  if (!sourceUnit) return value; // fallback
  const mgPerMl = value / sourceUnit.factor;  // as mg/mL
  return mgPerMl * currentUnit.factor;        // as current display unit
}

// Build Plotly traces representing therapeutic Ce ranges for the current drug.
// Each band is represented by a single trace containing two horizontal segments
// (low and high) separated by a NaN gap so a single legend entry toggles both.

function buildTherapeuticShapes(finalTime) {
  const shapes = [];
  const legendTraces = [];
  if (!showTherapeutic || !currentDrug) return { shapes, legendTraces };

  const ranges = EFFECT_SITE_RANGES[currentDrug] || [];
  if (!Array.isArray(ranges) || ranges.length === 0) return { shapes, legendTraces };

  const x0 = 0, x1 = finalTime;

  ranges.forEach((r) => {
    const yLow = valToDisplayY(r.low, r.unit);
    const yHigh = valToDisplayY(r.high, r.unit);

    shapes.push({
      type: 'rect',
      xref: 'x',
      yref: 'y',
      x0: x0,
      x1: x1,
      y0: yLow,
      y1: yHigh,
      fillcolor: r.color,
      opacity: 0.15,
      line: { width: 0 }
    });

    legendTraces.push({
      x: [null], y: [null],
      mode: 'lines',
      name: `${r.label} ${r.low}–${r.high} ${r.unit}`,
      line: { color: r.color, width: 10 },
      hoverinfo: 'skip',
      legendgroup: 'therapeutic',
      legendgrouptitle: { text: 'Therapeutic ranges (Cp/Ce)' }
    });
  });

  return { shapes, legendTraces };
}

// Create a simple UI checkbox to show/hide all therapeutic lines.
function ensureTherapeuticToggle() {
  if (document.getElementById('toggleTherapeutic')) return; // already added
  try {
    const container = document.createElement('div');
    container.id = 'therapeuticToggleContainer';
    container.style.margin = '8px 0';
    container.style.fontFamily = 'Segoe UI, Roboto, sans-serif';
    const label = document.createElement('label');
    label.style.cursor = 'pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'toggleTherapeutic';
    cb.checked = showTherapeutic;
    const text = document.createTextNode(' Show therapeutic ranges');
    label.appendChild(cb);
    label.appendChild(text);
    container.appendChild(label);

    // Insert before the first plot if possible
    const plotDiv = document.getElementById('myDiv1');
    if (plotDiv && plotDiv.parentNode) {
      plotDiv.parentNode.insertBefore(container, plotDiv);
    } else {
      document.body.appendChild(container);
    }

    cb.addEventListener('change', function () {
      showTherapeutic = this.checked;
      dfsolve();
    });
  } catch (e) {
    // Non-fatal if DOM injection fails; ranges can still be toggled via legend per band
    console.warn('Could not add therapeutic toggle checkbox:', e);
  }
}

// Place legend outside, centered below the plotting area.
// bottomMargin controls how much space is reserved for the legend.

// Place legend outside and below the entire chart (below the x-axis title).
// Adjust 'y' (more negative = lower) and 'bottom' to reserve adequate space.
// Use smaller font and item width to reduce needed height on narrow screens.
function legendOutsideBottom(layout, {
  y = -0.45,         // below the x-axis title area
  bottom = 160,      // reserve space for legend in bottom margin
  fontSize = 12,
  itemWidth = 80
} = {}) {
  layout.legend = {
    ...(layout.legend || {}),
    orientation: 'h',
    x: 0.5, xanchor: 'center',
    y, yanchor: 'top', yref: 'paper',
    bgcolor: 'rgba(0,0,0,0)',
    borderwidth: 0,
    font: { size: fontSize },
    itemwidth: itemWidth,
    itemclick: 'toggle',
    itemdoubleclick: 'toggleothers',
    tracegroupgap: 8
  };

  // Reserve bottom space so the legend doesn't overlap titles/labels
  const m = layout.margin || {};
  layout.margin = { t: Math.max(50, m.t || 0), r: Math.max(20, m.r || 0),
                    b: Math.max(bottom, m.b || 0), l: Math.max(60, m.l || 0),
                    pad: 4 };

  // Keep the x-axis title tight to the ticks so legend has room below it
  layout.xaxis = layout.xaxis || {};
  layout.xaxis.title = { ...(layout.xaxis.title || {}), standoff: 10 };
  layout.xaxis.automargin = true;  // helps with long tick labels

  return layout;
}


// Defaults
bnum.value = 0.4;
tbolusnum.value = 15;
tinfusionnum.value = 60;
infusionnum.value = 0.005;
tfinalnum.value = 135;

function dfsolve() {
  // Collect parameters
  let params = { b: [], Cl: [], Q2: [], Q3: [], Vd1: [], Vd2: [], Vd3: [],
    tbolus: [], tperiod: [], initialp: [], tfinal: [], dt: [], ke0: [] };
  params.Vd1 = parseFloat(Vd1num.value);
  params.Vd2 = parseFloat(Vd2num.value);
  params.Vd3 = parseFloat(Vd3num.value);
  params.Cl = parseFloat(Clnum.value);
  params.Q2 = parseFloat(Q2num.value)/1.0;
  params.Q3 = parseFloat(Q3num.value)/1.0;
  params.b = parseFloat(bnum.value) / parseFloat(tbolusnum.value) / currentBolusUnit.factor;
  params.tbolus = parseFloat(tbolusnum.value);
  params.tinfusion= parseFloat(tinfusionnum.value);
  params.initialp = parseFloat(initialpnum.value);
  params.tfinal = parseFloat(tfinalnum.value);
  params.dt = 0.1;
  params.ke0 = Number.isFinite(parseFloat(ke0num.value)) ? parseFloat(ke0num.value) : 0;

  // Micro-rate constants
  const k12 = params.Q2/params.Vd1;
  const k13 = params.Q3/params.Vd1;
  const k10 = params.Cl/params.Vd1;
  const k21 = params.Q2/params.Vd2;
  const k31 = params.Q3/params.Vd3;

  // Time/grid
  let N = Math.ceil(params.tfinal/params.dt);
  let Nhalf1 = Math.ceil(params.tbolus/params.dt);
  let Nhalf2 = Nhalf1 + Math.ceil(params.tinfusion/params.dt);
  let ts = new Array(N + 1);
  let xs1 = new Array(N + 1);
  let xs2 = new Array(N + 1);
  let xs3 = new Array(N + 1);
  let ces = new Array(N + 1);
  for (let i = 0; i < N + 1; i++) ts[i] = 1.0 * i * params.dt;

  // Initial conditions (amounts for x, concentration for Ce)
  let x01 = 1.0 * params.initialp * params.Vd1 / currentUnit.factor; // mg/kg
  let x02 = 0.0;
  let x03 = 0.0;
  let ce0 = params.initialp / currentUnit.factor;
  xs1[0] = x01; xs2[0] = x02; xs3[0] = x03; ces[0] = ce0;

  // ---- Matrix exponential setup ----
  const dt = params.dt;
  const mat = math.matrix([
    [ -dt*(k10 + k12 + k13),  dt*k21,             dt*k31,             0,                 dt ],
    [  dt*k12,               -dt*(k21),           0,                   0,                 0  ],
    [  dt*k13,                0,                  -dt*(k31),           0,                 0  ],
    [  dt*(params.ke0/params.Vd1), 0,             0,                  -dt*(params.ke0),   0  ],
    [  0,                     0,                   0,                  0,                 0  ]
  ]);
  const M = math.expm(mat);

  // Unpack transitions
  const a11 = M.subset(math.index(0,0)), a12 = M.subset(math.index(0,1)), a13 = M.subset(math.index(0,2)), a14 = M.subset(math.index(0,3)), a15 = M.subset(math.index(0,4));
  const a21 = M.subset(math.index(1,0)), a22 = M.subset(math.index(1,1)), a23 = M.subset(math.index(1,2)), a24 = M.subset(math.index(1,3)), a25 = M.subset(math.index(1,4));
  const a31 = M.subset(math.index(2,0)), a32 = M.subset(math.index(2,1)), a33 = M.subset(math.index(2,2)), a34 = M.subset(math.index(2,3)), a35 = M.subset(math.index(2,4));
  const a41 = M.subset(math.index(3,0)), a42 = M.subset(math.index(3,1)), a43 = M.subset(math.index(3,2)), a44 = M.subset(math.index(3,3)), a45 = M.subset(math.index(3,4));

  // ---- Time stepping ----
  let counter = 0;
  while (counter < N) {
    // Piecewise-constant input rate (mg/kg/min)
    if (counter < Nhalf1) params.b = parseFloat(bnum.value)/parseFloat(tbolusnum.value)/currentBolusUnit.factor;
    else if (counter < Nhalf2) params.b = parseFloat(infusionnum.value)/currentInfusionUnit.factor;
    else params.b = 0;

    // State updates: Ce does NOT feed back into x1/x2/x3
    const x1n = a11*xs1[counter] + a12*xs2[counter] + a13*xs3[counter] + params.b*a15;
    const x2n = a21*xs1[counter] + a22*xs2[counter] + a23*xs3[counter] + params.b*a25;
    const x3n = a31*xs1[counter] + a32*xs2[counter] + a33*xs3[counter] + params.b*a35;
    const cen = a41*xs1[counter] + a42*xs2[counter] + a43*xs3[counter] + a44*ces[counter] + params.b*a45;
    xs1[counter + 1] = x1n;
    xs2[counter + 1] = x2n;
    xs3[counter + 1] = x3n;
    ces[counter + 1] = cen;
    counter = counter + 1;
  }

  // ===== Build traces with display units: Cp & Ce together =====
  const yFactor = currentUnit.factor;
  const unitLabel = currentUnit.name;
  let trace_cp = { x: [], y: [], name: `Cp (${unitLabel})`, line: { color: '#1f77b4', width: 2 } };
  let trace_ce = { x: [], y: [], name: `Ce (${unitLabel})`, line: { color: '#ff7f0e', width: 2, dash: 'dot' } };
  let trace_p1 = { x: [], y: [], name: `P1 Compartment (${unitLabel})`, line: { width: 2 } };
  let trace_p2 = { x: [], y: [], name: `P2 Compartment (${unitLabel})`, line: { width: 2 } };
  for (let i = 0; i < N + 1; i++) {
    const t = ts[i];
    const cp = (xs1[i]/params.Vd1); // mg/mL
    const p1 = (xs2[i]/params.Vd2);
    const p2 = (xs3[i]/params.Vd3);
    const ce = (ces[i]); // mg/mL
    trace_cp.x.push(t); trace_cp.y.push(cp * yFactor);
    trace_ce.x.push(t); trace_ce.y.push(ce * yFactor);
    trace_p1.x.push(t); trace_p1.y.push(p1 * yFactor);
    trace_p2.x.push(t); trace_p2.y.push(p2 * yFactor);
  }

  // Layouts
  var layout1 = {
    title: { text:'Central vs Effect-site', font: { family: 'Courier New, monospace', size: 24 } },
    xaxis: { title: { text: 'Time (min)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}},
    yaxis: { title: { text: `Concentration (${unitLabel})`, font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}}
  };
  var layout2 = {
    title: { text:'P1 Compartment', font: { family: 'Courier New, monospace', size: 24 } },
    xaxis: { title: { text: 'Time (min)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}},
    yaxis: { title: { text: `Concentration (${unitLabel})`, font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}}
  };
  var layout3 = {
    title: { text:'P2 Compartment', font: { family: 'Courier New, monospace', size: 24 } },
    xaxis: { title: { text: 'Time (min)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}},
    yaxis: { title: { text: `Concentration (${unitLabel})`, font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}}
  };

  layout1 = addEventMarkers(layout1);
  layout2 = addEventMarkers(layout2);
  layout3 = addEventMarkers(layout3);

// Put legend outside & below; panel 1 typically has many entries
  layout1 = legendOutsideBottom(layout1, { y: -0.50, bottom: 180, fontSize: 11, itemWidth: 90 });

// P1/P2 panels: either hide legend or keep it compact
  layout2.showlegend = false;  // recommended (single trace)
  layout3.showlegend = false;  // recommended
// If you prefer to keep them:
/// layout2 = legendOutsideBottom(layout2, { y: -0.35, bottom: 120 });
/// layout3 = legendOutsideBottom(layout3, { y: -0.35, bottom: 120 });



  // Build therapeutic traces (Ce) for legend toggle
  const { shapes: therShapes, legendTraces } = buildTherapeuticShapes(params.tfinal);
  layout1.shapes = [ ...(layout1.shapes || []), ...therShapes ];

  const panel1Traces = [trace_cp, trace_ce, ...legendTraces];

  const PLOT_CONFIG = { responsive: true, displaylogo: false };

  Plotly.newPlot('myDiv1', panel1Traces, layout1, PLOT_CONFIG);
  Plotly.newPlot('myDiv2', [trace_p1],       layout2, PLOT_CONFIG);
  Plotly.newPlot('myDiv3', [trace_p2],       layout3, PLOT_CONFIG);


  // ===== Results panel =====
  pfinalhtml.innerHTML = roundToSignificantFigures(yFactor*xs1[N]/params.Vd1, 3);
  const pss = params.b/params.Cl;
  psshtml.innerHTML = roundToSignificantFigures(yFactor*pss,3);

  // Eigenvalues α, β, γ from 3x3 x-subsystem
  const Axyz = math.matrix([
    [- (k10 + k12 + k13), k21, k31],
    [  k12,              -k21, 0   ],
    [  k13,               0,  -k31 ]
  ]);
  function toArray(m) {
    if (Array.isArray(m)) return m;
    if (m && typeof m.toArray === 'function') return m.toArray();
    if (m && m._data) return m._data;
    return [m];
  }
  let evalsRaw;
  try {
    const eigs_xyz = math.eigs(Axyz);
    evalsRaw = toArray(eigs_xyz.values);
  } catch (e) {
    console.error('eigs failed:', e);
    evalsRaw = [];
  }
  let evalsReal = evalsRaw.map(v => math.re(v)).filter(v => Number.isFinite(v) && v < 0);
  if (evalsReal.length === 0) {
    alphahtml.innerHTML = betahtml.innerHTML = gammahtml.innerHTML = 0;
    termhalflifehtml.innerHTML = 0;
  } else {
    evalsReal.sort((a,b) => Math.abs(b) - Math.abs(a));
    const alpha = - (evalsReal[0] ?? 0);
    const beta  = - (evalsReal[1] ?? 0);
    const gamma = - (evalsReal[2] ?? 0);
    const termhalflife = (gamma > 0 ? Math.log(2)/gamma : (beta > 0 ? Math.log(2)/beta : (alpha > 0 ? Math.log(2)/alpha : 0)));
    alphahtml.innerHTML = roundToSignificantFigures(alpha, 3);
    betahtml.innerHTML  = roundToSignificantFigures(beta, 3);
    gammahtml.innerHTML = roundToSignificantFigures(gamma, 3);
    termhalflifehtml.innerHTML = roundToSignificantFigures(termhalflife, 3);
  }
  k10html.innerHTML = roundToSignificantFigures(k10, 3);
  k12html.innerHTML = roundToSignificantFigures(k12, 3);
  k21html.innerHTML = roundToSignificantFigures(k21, 3);
  k13html.innerHTML = roundToSignificantFigures(k13, 3);
  k31html.innerHTML = roundToSignificantFigures(k31, 3);

  // Context-sensitive half-life (turn infusion off; propagate x only)
  let cshl = 0;
  let x1 = xs1[N], x2 = xs2[N], x3 = xs3[N];
  while (x1 > (xs1[N]/2)) {
    cshl += params.dt;
    const x1t = x1, x2t = x2, x3t = x3;
    // top-left 3x3 block of M (no input, no Ce coupling)
    x1 = a11*x1t + a12*x2t + a13*x3t;
    x2 = a21*x1t + a22*x2t + a23*x3t;
    x3 = a31*x1t + a32*x2t + a33*x3t;
    if (cshl > 1e6) break;
  }
  contextsensitivehalflifehtml.innerHTML = roundToSignificantFigures(cshl, 3);
}

function addEventMarkers(layout) {
  const bolusTime = parseFloat(document.getElementById('tbolus').value);
  const infusionStop = parseFloat(document.getElementById('tinfusion').value) + bolusTime
  const finalTime = parseFloat(document.getElementById('tfinal').value);
  layout.shapes = [];
  if (bolusTime > 0 && bolusTime < finalTime) {
    layout.shapes.push({ type: "line", x0: bolusTime, x1: bolusTime, y0: 0, y1: 1,
      xref: "x", yref: "paper", line: { color: "red", width: 0.5, dash: "dot" } });
  }
  if (infusionStop < finalTime && infusionStop > bolusTime) {
    layout.shapes.push({ type: "line", x0: infusionStop, x1: infusionStop, y0: 0, y1: 1,
      xref: "x", yref: "paper", line: { color: "blue", width: 0.5, dash: "dot" } });
  }
  if (bolusTime > 0 && bolusTime < finalTime && infusionStop < finalTime && infusionStop > bolusTime) {
    layout.annotations = [
      { x: bolusTime, y: 1, xref: "x", yref: "paper", text: "Bolus", showarrow: false, yanchor: "bottom", font: {color: "red"} },
      { x: infusionStop, y: 1, xref: "x", yref: "paper", text: "Infusion End", showarrow: false, yanchor: "bottom", font: {color: "blue"} }
    ];
  } else if (bolusTime > 0 && bolusTime < finalTime) {
    layout.annotations = [ { x: bolusTime, y: 1, xref: "x", yref: "paper", text: "Bolus", showarrow: false, yanchor: "bottom", font: {color: "red"} } ];
  } else if (infusionStop < finalTime && infusionStop > bolusTime) {
    layout.annotations = [ { x: infusionStop, y: 1, xref: "x", yref: "paper", text: "Infusion End", showarrow: false, yanchor: "bottom", font: {color: "blue"} } ];
  }
  return layout;
}

function onecompartment() {
  Q2num.value = 0;
  Q3num.value = 0;
  dfsolve();
}

// ===== Drug presets (all set currentDrug) =====
function propofol() { // Schnider et al. "The Influence of Method of Administration and Covariates on the Pharmacokinetics of Propofol in Adult Volunteers", Anesthesiology, 1998, 88, 1170-82.
  currentDrug = 'propofol';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 61; // 4.27/70*1000; 
  Vd2num.value = 270; // 18.9/70*1000; 
  Vd3num.value = 3400; // 238/70*1000; 
  Clnum.value = 27.023; // 4.27/70*1000*0.443; 
  Q2num.value = 18.422; // 4.27/70*1000*0.302; 
  Q3num.value = 11.956; // 4.27/70*1000*0.196;
  ke0num.value = 0.456;
  dfsolve();
}
function etomidate() { // Kaneda "split into 3 compartments"
  currentDrug = 'etomidate';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 4.45/70*1000;
  Vd2num.value = 15/70*1000;
  Vd3num.value = 60/70*1000;
  Clnum.value = 0.63/70*1000;
  Q2num.value = 3/70*1000;
  Q3num.value = 0.5/70*1000;
  ke0num.value = 0.45;
  dfsolve();
}
function ketamine() { // Example numbers based on lots of different papers
  currentDrug = 'ketamine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 20/70*1000;
  Vd2num.value = 40/70*1000;
  Vd3num.value = 125/70*1000;
  Clnum.value = 1.2/70*1000;
  Q2num.value = 1.5/70*1000;
  Q3num.value = 0.3/70*1000;
  ke0num.value = 0.25;
  dfsolve();
}
function dexmedetomidine() { // DOI: 10.1097/ALN.0000000000000740
  currentDrug = 'dexmedetomidine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/hr');
  Vd1num.value = 1.78/70*1000; // 
  Vd2num.value = 30.3/70*1000; // 
  Vd3num.value = 62/70*1000; // 
  Clnum.value = 0.686/70*1000; // 
  Q2num.value = 2.98/70*1000;
  Q3num.value = 0.602/70*1000;
  ke0num.value = 0.277;
  dfsolve();
}
function midazolam() { // Consistent with reported values
  currentDrug = 'midazolam';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 25/70*1000;
  Vd2num.value = 50/70*1000;
  Vd3num.value = 125/70*1000;
  Clnum.value = 0.45/70*1000;
  Q2num.value = 1.5/70*1000;
  Q3num.value = 0.3/70*1000;
  ke0num.value = 0.073;
  dfsolve();
}
function diazepam() { // Ku KC et al, Population pharmacokinetics and exploratory exposure-response relationships of diazepam in children treated for status epilepticus, into a 3 compartment model as opposed to 2 
  currentDrug = 'diazepam';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 42/70*1000;
  Vd2num.value = 18/70*1000;
  Vd3num.value = 38.5/70*1000;
  Clnum.value = 39.3/70; 
  Q2num.value = 300/70;
  Q3num.value = 76.7/70;
  ke0num.value = 0.2;
  dfsolve();
}
function fentanyl() { // https://doi.org/10.1016/j.bja.2020.06.066.
  currentDrug = 'fentanyl';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/hr');
  Vd1num.value = 144 + 2.0/7; // 10.1/70*1000;
  Vd2num.value = 378 + 4.0/7; // 26.5/70*1000;
  Vd3num.value = 2942 + 5.0/7; // 206/70*1000;
  Clnum.value = 10 + 4.0/70; // 0.704/70*1000;
  Q2num.value = 34; // 2.38/70*1000;
  Q3num.value = 21 + 2.0/7; // 1.49/70*1000;
  ke0num.value = 0.114;
  dfsolve();
}
function hydromorphone() { // Looking at “Morphine and hydromorphone PK in volunteers 2025” (Meissner et al.) when full tables are published might give more precise 3-comp numbers; keeping up with that is useful
  currentDrug = 'hydromorphone';
  setDisplayUnit('ng/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 20/70*1000;
  Vd2num.value = 90/70*1000;
  Vd3num.value = 70/70*1000;
  Clnum.value = 0.75/70*1000;
  Q2num.value = 1.5/70*1000;
  Q3num.value = 0.4/70*1000;
  ke0num.value = 0.5;
  dfsolve();
}
function remifentanil() { // Eleveld et al. Allometric Model of Remifentanil Pharmacokinetics and Pharmacodynamics, 2017
  currentDrug = 'remifentanil';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 5.8/70*1000;
  Vd2num.value = 8.82/70*1000;
  Vd3num.value = 5.03/70*1000;
  Clnum.value = 2.58/70*1000;
  Q2num.value = 1.72/70*1000;
  Q3num.value = 0.124/70*1000;
  ke0num.value = 1.09;
  dfsolve();
}
function sufentanil() { // Combination from Hahn et al 2019, Zhao et al 2009, Youngs and Shafer 1994
  currentDrug = 'sufentanil';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/hr');
  Vd1num.value = 25/70*1000;
  Vd2num.value = 150/70*1000;
  Vd3num.value = 500/70*1000;
  Clnum.value = 1/70*1000;
  Q2num.value = 1.2/70*1000;
  Q3num.value = 0.3/70*1000; 
  ke0num.value = 1.5;
  dfsolve();
}
function alfentanil() { // From multiple sources
  currentDrug = 'alfentanil';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 0.9*1000;
  Vd2num.value = 1.5*1000;
  Vd3num.value = 3*1000;
  Clnum.value = 6.4;
  Q2num.value = 1/70*1000;
  Q3num.value = 0.3/70*1000;
  ke0num.value = 2;
  dfsolve();
}
function methadone() { // Lotsch et al (2005) and Ward et al (2014)
  currentDrug = 'methadone';
  setDisplayUnit('ng/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 21.5/70*1000;
  Vd2num.value = 75.1/70*1000;
  Vd3num.value = 484/70*1000;
  Clnum.value = 2.25;
  Q2num.value = 77.4;
  Q3num.value = 32.4;
  ke0num.value = 0.087;
  dfsolve();
}
function rocuronium() { // multiple sources, usually uses 2 compartment models for neuromuscular blockers
  currentDrug = 'rocuronium';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 80;
  Vd2num.value = 300;
  Vd3num.value = 400;
  Clnum.value = 3.2;
  Q2num.value = 20;
  Q3num.value = 5;
  ke0num.value = 0.2;
  dfsolve();
}
function vecuronium() { // Vega-Villa et al (2014)
  currentDrug = 'vecuronium';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 10.25/70*1000;
  Vd2num.value = 7.92/70*1000;
  Vd3num.value = 41.99/70*1000;
  Clnum.value = 0.51/70*1000;
  Q2num.value = 0.51/70*1000;
  Q3num.value = 0.095/70*1000;
  ke0num.value = 0.3; //speculative 
  dfsolve();
}
function cisatracurium() { // Varin et al (1998), Pfizer study
  currentDrug = 'cisatracurium';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 40;
  Vd2num.value = 60;
  Vd3num.value = 45;
  Clnum.value = 5;
  Q2num.value = 10;
  Q3num.value = 2;
  ke0num.value = 0.0575;
  dfsolve();
}
function pancuronium() { // Somogyi et al, Buzello/Duvaldestin (1970s)
  currentDrug = 'pancuronium';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 100;
  Vd2num.value = 120;
  Vd3num.value = 30;
  Clnum.value = 1.5;
  Q2num.value = 8;
  Q3num.value = 2;
  ke0num.value = 0.05;
  dfsolve();
}
function succinylcholine() { // Multiple sources, no official 3 compartment model but estimated these values
  currentDrug = 'succinylcholine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/min');
  Vd1num.value = 10;
  Vd2num.value = 20;
  Vd3num.value = 50;
  Clnum.value = 300;
  Q2num.value = 50;
  Q3num.value = 5;
  ke0num.value = 0.197;
  dfsolve();
}
function lidocaine() {
  currentDrug = 'lidocaine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 171 + 3.0/7;
  Vd2num.value = 571 + 3.0/7;
  Vd3num.value = 1428 + 4.0/7;
  Clnum.value = 15 + 5.0/7;
  Q2num.value = 21 + 3.0/7;
  Q3num.value = 14 + 2.0/7;
  ke0num.value = null;
  dfsolve();
}
function bupivacaine() {
  currentDrug = 'bupivacaine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 142 + 6.0/7;
  Vd2num.value = 714 + 2.0/7;
  Vd3num.value = 2857 + 1.0/7;
  Clnum.value = 3 + 4.0/7;
  Q2num.value = 11 + 3.0/7;
  Q3num.value = 7 + 1.0/7;
  ke0num.value = null;
  dfsolve();
}
function phenylephrine() {
  currentDrug = 'phenylephrine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 214 + 2.0/7;
  Vd2num.value = 357 + 1.0/7;
  Vd3num.value = 714 + 2.0/7;
  Clnum.value = 17 + 1.0/7;
  Q2num.value = 17 + 1.0/7;
  Q3num.value = 11 + 3.0/7;
  ke0num.value = 0.4;
  dfsolve();
}
function ephedrine() {
  currentDrug = 'ephedrine';
  setDisplayUnit('ng/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/min');
  Vd1num.value = 285 + 5.0/7;
  Vd2num.value = 857 + 1.0/7;
  Vd3num.value = 1714 + 2.0/7;
  Clnum.value = 5 + 5.0/7;
  Q2num.value = 10;
  Q3num.value = 7 + 1.0/7;
  ke0num.value = 0.06;
  dfsolve();
}
function epinephrine() {
  currentDrug = 'epinephrine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 171 + 3.0/7;
  Vd2num.value = 357 + 1.0/7;
  Vd3num.value = 571 + 3.0/7;
  Clnum.value = 21 + 3.0/7;
  Q2num.value = 21 + 3.0/7;
  Q3num.value = 14 + 2.0/7;
  ke0num.value = 0.8;
  dfsolve();
}
function dobutamine() {
  currentDrug = 'dobutamine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 214 + 2.0/7;
  Vd2num.value = 428 + 4.0/7;
  Vd3num.value = 714 + 2.0/7;
  Clnum.value = 14 + 2.0/7;
  Q2num.value = 14 + 2.0/7;
  Q3num.value = 10;
  ke0num.value = 0.3;
  dfsolve();
}
function dopamine() {
  currentDrug = 'dopamine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 228 + 4.0/7;
  Vd2num.value = 428 + 4.0/7;
  Vd3num.value = 785 + 5.0/7;
  Clnum.value = 12 + 6.0/7;
  Q2num.value = 12 + 6.0/7;
  Q3num.value = 8 + 4.0/7;
  ke0num.value = 0.2;
  dfsolve();
}
function milrinone() {
  currentDrug = 'milrinone';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 285 + 5.0/7;
  Vd2num.value = 1000;
  Vd3num.value = 2142 + 6.0/7;
  Clnum.value = 2 + 6.0/7;
  Q2num.value = 7 + 1.0/7;
  Q3num.value = 4 + 2.0/7;
  ke0num.value = 0.03;
  dfsolve();
}
function vasopressin() {
  currentDrug = 'vasopressin';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 171 + 3.0/7;
  Vd2num.value = 357 + 1.0/7;
  Vd3num.value = 571 + 3.0/7;
  Clnum.value = 4 + 2.0/7;
  Q2num.value = 8 + 4.0/7;
  Q3num.value = 5 + 5.0/7;
  ke0num.value = 0.05;
  dfsolve();
}
function reset() {
  propofol();
  bnum.value = 1;
  tbolusnum.value = 1;
  tinfusionnum.value = 60;
  infusionnum.value = 100;
  tfinalnum.value = 255;
  dfsolve();
}

// Recompute on input changes
Vd1num.addEventListener("change", function() { dfsolve(); });
Vd2num.addEventListener("change", function() { dfsolve(); });
Vd3num.addEventListener("change", function() { dfsolve(); });
Clnum.addEventListener("change", function() { dfsolve(); });
Q2num.addEventListener("change", function() { dfsolve(); });
Q3num.addEventListener("change", function() { dfsolve(); });
bnum.addEventListener("change", function() { dfsolve(); });
tbolusnum.addEventListener("change", function() { dfsolve(); });
tinfusionnum.addEventListener("change", function() { dfsolve(); });
infusionnum.addEventListener("change", function() { dfsolve(); });
initialpnum.addEventListener("change", function() { dfsolve(); });
tfinalnum.addEventListener("change", function() { dfsolve(); });
ke0num.addEventListener("change", function() { dfsolve(); });

// Ensure the toggle exists, then plot defaults
ensureTherapeuticToggle();
reset();
