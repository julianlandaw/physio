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
ke0html.innerHTML = "k\u2091\u2080 (min\u207B\u00B9)";
var ke0num = document.getElementById("ke0");

var pfinalhtml = document.getElementById("pfinalhtml");
pfinalhtml.innerHTML = 0;

var psshtml = document.getElementById("psshtml");
psshtml.innerHTML = 0;

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

function roundToSignificantFigures(num, sigFigs) {
  if (num === 0) return 0; // Handle the 0 case separately

  const magnitude = math.floor(math.log10(math.abs(num)));
  const factor = 10 ** (sigFigs - magnitude - 1);
  return math.round(num * factor) / factor;
}

bnum.value = 0.4;
tbolusnum.value = 15;
tinfusionnum.value = 60;
infusionnum.value = 0.005;
tfinalnum.value = 135;

function dfsolve() {
  // Collect parameters
  let params = { b: [], Cl: [], Q2: [], Q3: [], Vd1: [], Vd2: [], Vd3: [],
                 tbolus: [], tperiod: [], initialp: [], tfinal: [], dt: [] , ke0: [] };

  params.Vd1 = parseFloat(Vd1num.value);
  params.Vd2 = parseFloat(Vd2num.value);
  params.Vd3 = parseFloat(Vd3num.value);
  params.Cl  = parseFloat(Clnum.value);
  params.Q2  = parseFloat(Q2num.value)/1.0;
  params.Q3  = parseFloat(Q3num.value)/1.0;

  params.b         = parseFloat(bnum.value) / parseFloat(tbolusnum.value);
  params.tbolus    = parseFloat(tbolusnum.value);
  params.tinfusion = parseFloat(tinfusionnum.value);
  params.initialp  = parseFloat(initialpnum.value);
  params.tfinal    = parseFloat(tfinalnum.value);
  params.dt        = 0.1;
  params.ke0       = Number.isFinite(parseFloat(ke0num.value)) ? parseFloat(ke0num.value) : 0; // NEW

  // Micro-rate constants
  const k12 = params.Q2/params.Vd1;
  const k13 = params.Q3/params.Vd1;
  const k10 = params.Cl/params.Vd1;
  const k21 = params.Q2/params.Vd2;
  const k31 = params.Q3/params.Vd3;

  // Time/grid
  let N      = Math.ceil(params.tfinal/params.dt);
  let Nhalf1 = Math.ceil(params.tbolus/params.dt);
  let Nhalf2 = Nhalf1 + Math.ceil(params.tinfusion/params.dt);

  let ts  = new Array(N + 1);
  let xs1 = new Array(N + 1);
  let xs2 = new Array(N + 1);
  let xs3 = new Array(N + 1);
  let ces = new Array(N + 1); // NEW

  for (let i = 0; i < N + 1; i++) ts[i] = 1.0 * i * params.dt;

  // Initial conditions (amounts for x, concentration for Ce)
  // x01 = initial plasma concentration * V1  (mg/mL * mL/kg = mg/kg)
  let x01 = 1.0 * params.initialp * params.Vd1;
  let x02 = 0.0;
  let x03 = 0.0;
  let ce0 = params.initialp; // start Ce equal to initial plasma conc (common choice)  // NEW

  xs1[0] = x01; xs2[0] = x02; xs3[0] = x03; ces[0] = ce0; // NEW

  // ---------- Matrix exponential setup ----------
  // Build augmented (dt-scaled) matrix of size 5x5:
  // States: [x1, x2, x3, Ce, 1] with input entering x1 via last column
  const dt = params.dt;
  const mat = math.matrix([
    [ -dt*(k10 + k12 + k13),  dt*k21,              dt*k31,              0,                 dt ],
    [  dt*k12,                -dt*(k21),           0,                   0,                 0  ],
    [  dt*k13,                0,                   -dt*(k31),           0,                 0  ],
    [  dt*(params.ke0/params.Vd1), 0,              0,                   -dt*(params.ke0),  0  ], // NEW (Ce row)
    [  0,                     0,                   0,                   0,                 0  ]  // homogeneous input integrator
  ]);

  const M = math.expm(mat);

  // Unpack transition blocks (for speed/readability)
  const a11 = M.subset(math.index(0,0)), a12 = M.subset(math.index(0,1)), a13 = M.subset(math.index(0,2)), a14 = M.subset(math.index(0,3)), a15 = M.subset(math.index(0,4));
  const a21 = M.subset(math.index(1,0)), a22 = M.subset(math.index(1,1)), a23 = M.subset(math.index(1,2)), a24 = M.subset(math.index(1,3)), a25 = M.subset(math.index(1,4));
  const a31 = M.subset(math.index(2,0)), a32 = M.subset(math.index(2,1)), a33 = M.subset(math.index(2,2)), a34 = M.subset(math.index(2,3)), a35 = M.subset(math.index(2,4));
  const a41 = M.subset(math.index(3,0)), a42 = M.subset(math.index(3,1)), a43 = M.subset(math.index(3,2)), a44 = M.subset(math.index(3,3)), a45 = M.subset(math.index(3,4)); // NEW

  // ---------- Time stepping ----------
  let counter = 0;
  while (counter < N) {
    // Piecewise-constant input rate (mg/kg/min)
    if (counter < Nhalf1)      params.b = parseFloat(bnum.value)/parseFloat(tbolusnum.value);
    else if (counter < Nhalf2) params.b = parseFloat(infusionnum.value);
    else                       params.b = 0;

    // State updates
    const x1n = a11*xs1[counter] + a12*xs2[counter] + a13*xs3[counter] + a14*ces[counter] + params.b*a15;
    const x2n = a21*xs1[counter] + a22*xs2[counter] + a23*xs3[counter] + a24*ces[counter] + params.b*a25;
    const x3n = a31*xs1[counter] + a32*xs2[counter] + a33*xs3[counter] + a34*ces[counter] + params.b*a35;
    const cen = a41*xs1[counter] + a42*xs2[counter] + a43*xs3[counter] + a44*ces[counter] + params.b*a45; // NEW

    xs1[counter + 1] = x1n;
    xs2[counter + 1] = x2n;
    xs3[counter + 1] = x3n;
    ces[counter + 1] = cen; // NEW

    counter = counter + 1;
  }

  // ---------- Build traces ----------
  let trace_u1 = { x: [], y: [], name: 'Central Compartment' };
  let trace_u2 = { x: [], y: [], name: 'P1 Compartment' };
  let trace_u3 = { x: [], y: [], name: 'P2 Compartment' };
  let trace_ce = { x: [], y: [], name: 'Effect-site (Ce)', line: { dash: 'dot' } }; // NEW

  for (let i = 0; i < N + 1; i++) {
    trace_u1.x.push(ts[i]); trace_u1.y.push(xs1[i]/params.Vd1);
    trace_u2.x.push(ts[i]); trace_u2.y.push(xs2[i]/params.Vd2);
    trace_u3.x.push(ts[i]); trace_u3.y.push(xs3[i]/params.Vd3);
    trace_ce.x.push(ts[i]); trace_ce.y.push(ces[i]); // Ce already in mg/mL
  }

  // Layouts
  var layout1 = {
    title: { text:'Central Compartment', font: { family: 'Courier New, monospace', size: 24 } },
    xaxis: { title: { text: 'Time (min)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}},
    yaxis: { title: { text: 'Concentration (mg/mL)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}}
  };
  var layout2 = {
    title: { text:'P1 Compartment', font: { family: 'Courier New, monospace', size: 24 } },
    xaxis: { title: { text: 'Time (min)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}},
    yaxis: { title: { text: 'Concentration (mg/mL)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}}
  };
  var layout3 = {
    title: { text:'P2 Compartment', font: { family: 'Courier New, monospace', size: 24 } },
    xaxis: { title: { text: 'Time (min)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}},
    yaxis: { title: { text: 'Concentration (mg/mL)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}}
  };
  var layout4 = { // NEW
    title: { text:'Effect-site (Ce)', font: { family: 'Courier New, monospace', size: 24 } },
    xaxis: { title: { text: 'Time (min)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}},
    yaxis: { title: { text: 'Concentration (mg/mL)', font: { family: 'Courier New, monospace', size: 18, color: '#7f7f7f' }}}
  };

  layout1 = addEventMarkers(layout1);
  layout2 = addEventMarkers(layout2);
  layout3 = addEventMarkers(layout3);
  layout4 = addEventMarkers(layout4); // NEW

  Plotly.newPlot('myDiv1', [trace_u1], layout1);
  Plotly.newPlot('myDiv2', [trace_u2], layout2);
  Plotly.newPlot('myDiv3', [trace_u3], layout3);
  Plotly.newPlot('myDiv4', [trace_ce], layout4); // NEW

  // ---------- Results panel ----------
  // Final plasma concentration
  pfinalhtml.innerHTML = roundToSignificantFigures(xs1[N]/params.Vd1, 3);

  // Steady-state (use infusion control, not the time-varying b)
  const infusionRate = parseFloat(infusionnum.value);
  const pss = infusionRate / (params.Cl || 1);
  psshtml.innerHTML = roundToSignificantFigures(pss, 3);

  // ---------- Eigenvalues for α, β, γ from the 3×3 x-subsystem ONLY ----------
    const Axyz = math.matrix([
      [-(k10 + k12 + k13),  k21,  k31],
      [ k12,               -k21,   0  ],
      [ k13,                 0,   -k31]
    ]);
    
    // Helper: always get a vanilla JS array out of Math.js Matrix/Array
    function toArray(m) {
      if (Array.isArray(m)) return m;
      if (m && typeof m.toArray === 'function') return m.toArray();
      if (m && m._data) return m._data;              // legacy Matrix structure
      return [m];                                     // fall back
    }
    
    let evalsRaw;
    try {
      const eigs_xyz = math.eigs(Axyz);               // { values: Matrix|Array, vectors: ... }
      evalsRaw = toArray(eigs_xyz.values);
    } catch (e) {
      console.error('eigs failed:', e);
      evalsRaw = [];                                  // safe default
    }
    
    // Convert to real parts (Math.js Complex or number), keep negative ones
    let evalsReal = evalsRaw.map(v => math.re(v))     // real part if Complex, value if number
                            .filter(v => Number.isFinite(v) && v < 0);
    
    // If nothing negative (shouldn’t happen for a stable PK system), bail out gracefully
    if (evalsReal.length === 0) {
      alphahtml.innerHTML = betahtml.innerHTML = gammahtml.innerHTML = 0;
      termhalflifehtml.innerHTML = 0;
    } else {
      // Sort by magnitude of the (negative) real part: |α| >= |β| >= |γ|, then flip sign
      evalsReal.sort((a,b) => Math.abs(b) - Math.abs(a)); // descending by |value|
      const alpha = - (evalsReal[0] ?? 0);
      const beta  = - (evalsReal[1] ?? 0);
      const gamma = - (evalsReal[2] ?? 0);
    
      // Terminal half-life from the slowest plasma eigenvalue
      const termhalflife =
        gamma > 0 ? Math.log(2)/gamma :
        beta  > 0 ? Math.log(2)/beta  :
        alpha > 0 ? Math.log(2)/alpha : 0;
    
      alphahtml.innerHTML = roundToSignificantFigures(alpha, 3);
      betahtml.innerHTML  = roundToSignificantFigures(beta,  3);
      gammahtml.innerHTML = roundToSignificantFigures(gamma, 3);
      termhalflifehtml.innerHTML = roundToSignificantFigures(termhalflife, 3);
    }
  k10html.innerHTML = roundToSignificantFigures(k10, 3);
  k12html.innerHTML = roundToSignificantFigures(k12, 3);
  k21html.innerHTML = roundToSignificantFigures(k21, 3);
  k13html.innerHTML = roundToSignificantFigures(k13, 3);
  k31html.innerHTML = roundToSignificantFigures(k31, 3);

  // Context-sensitive half-life (turn infusion off; propagate x-system only)
  let cshl = 0;
  let x1 = xs1[N], x2 = xs2[N], x3 = xs3[N];
  while (x1 > (xs1[N]/2)) {
    cshl += params.dt;
    const x1t = x1, x2t = x2, x3t = x3;
    // Use the top-left 3×3 block of M without input and without Ce coupling
    x1 = a11*x1t + a12*x2t + a13*x3t;
    x2 = a21*x1t + a22*x2t + a23*x3t;
    x3 = a31*x1t + a32*x2t + a33*x3t;
    if (cshl > 1e6) break; // safety
  }
  contextsensitivehalflifehtml.innerHTML = roundToSignificantFigures(cshl, 3);
}

function addEventMarkers(layout) {
    const bolusTime = parseFloat(document.getElementById('tbolus').value);
    const infusionStop = parseFloat(document.getElementById('tinfusion').value) + bolusTime
    const finalTime = parseFloat(document.getElementById('tfinal').value);
        
    layout.shapes = [];

    // Bolus marker
    if (bolusTime > 0 && bolusTime < finalTime) {
        layout.shapes.push({
            type: "line",
            x0: bolusTime,
            x1: bolusTime,
            y0: 0,
            y1: 1,
            xref: "x",
            yref: "paper",
            line: {
                color: "red",
                width: 2,
                dash: "dot"
            }
        });
    }

    // Infusion stop marker
    if (infusionStop < finalTime && infusionStop > bolusTime) {
        layout.shapes.push({
            type: "line",
            x0: infusionStop,
            x1: infusionStop,
            y0: 0,
            y1: 1,
            xref: "x",
            yref: "paper",
            line: {
                color: "blue",
                width: 2,
                dash: "dot"
            }
        });
    }

    if (bolusTime > 0 && bolusTime < finalTime && infusionStop < finalTime && infusionStop > bolusTime) {    
        layout.annotations = [
          {
            x: bolusTime,
            y: 1,
            xref: "x",
            yref: "paper",
            text: "Bolus",
            showarrow: false,
            yanchor: "bottom",
            font: {color: "red"}
          },
          {
            x: infusionStop,
            y: 1,
            xref: "x",
            yref: "paper",
            text: "Infusion End",
            showarrow: false,
            yanchor: "bottom",
            font: {color: "blue"}
          }
        ];
    }

    else if (bolusTime > 0 && bolusTime < finalTime) {
        layout.annotations = [
          {
            x: bolusTime,
            y: 1,
            xref: "x",
            yref: "paper",
            text: "Bolus",
            showarrow: false,
            yanchor: "bottom",
            font: {color: "red"}
          }
        ];
    }

    else if (infusionStop < finalTime && infusionStop > bolusTime) {
        layout.annotations = [
          {
            x: infusionStop,
            y: 1,
            xref: "x",
            yref: "paper",
            text: "Infusion End",
            showarrow: false,
            yanchor: "bottom",
            font: {color: "blue"}
          }
        ];
    }

    return layout;
}

function onecompartment() {
    Q2num.value = 0;
    Q3num.value = 0;
    dfsolve();
}

function propofol() {
    Vd1num.value = 61;
    Vd2num.value = 270;
    Vd3num.value = 3400;
    Clnum.value = 26.571;
    Q2num.value = 18.429;
    Q3num.value = 11.943;
    dfsolve();
}

function etomidate() {
    Vd1num.value = 150;
    Vd2num.value = 300;
    Vd3num.value = 1200;
    Clnum.value = 14;
    Q2num.value = 20;
    Q3num.value = 10;
    dfsolve();
}

function ketamine() {
    Vd1num.value = 250;
    Vd2num.value = 500;
    Vd3num.value = 1500;
    Clnum.value = 20;
    Q2num.value = 30;
    Q3num.value = 15;
    dfsolve();
}

function dexmedetomidine() { 
    Vd1num.value = 30; //25-35
    Vd2num.value = 50; //40-60
    Vd3num.value = 125; //100-150
    Clnum.value = 0.7; //0.6-0.8
    Q2num.value = 0.5;
    Q3num.value = 0.3;
    dfsolve();
}

function midazolam() {
    Vd1num.value = 142 + 6.0/7;
    Vd2num.value = 714 + 2.0/7;
    Vd3num.value = 1428 + 4.0/7;
    Clnum.value = 8 + 4.0/7;
    Q2num.value = 11 + 3.0/7;
    Q3num.value = 7 + 1.0/7;
    dfsolve();
}

function diazepam() {
    Vd1num.value = 100;
    Vd2num.value = 900;
    Vd3num.value = 3000;
    Clnum.value = 0.25; //0.2-0.3
    Q2num.value = 0.5;
    Q3num.value = 0.2;
    dfsolve();
}

function fentanyl() {
    Vd1num.value = 185 + 5.0/7;
    Vd2num.value = 342 + 6.0/7;
    Vd3num.value = 4800;
    Clnum.value = 0.6 + 3.0/70;
    Q2num.value = 5;
    Q3num.value = 1 + 6.0/7;
    dfsolve();
}

function hydromorphone() {
    Vd1num.value = 150;
    Vd2num.value = 350;
    Vd3num.value = 1200;
    Clnum.value = 5;
    Q2num.value = 10;
    Q3num.value = 5;
    dfsolve();
}

function remifentanil() {
    Vd1num.value = 100;
    Vd2num.value = 300;
    Vd3num.value = 500;
    Clnum.value = 3;
    Q2num.value = 2;
    Q3num.value = 1;
    dfsolve();
}

function sufentanil() {
    Vd1num.value = 20;
    Vd2num.value = 150;
    Vd3num.value = 800;
    Clnum.value = 0.35;
    Q2num.value = 0.5;
    Q3num.value = 0.2;
    dfsolve();
}

function alfentanil() {
    Vd1num.value = 200;
    Vd2num.value = 342 + 6.0/7;
    Vd3num.value = 1428 + 4.0/7;
    Clnum.value = 14 + 2.0/7;
    Q2num.value = 17 + 1.0/7;
    Q3num.value = 7 + 1.0/7;
    dfsolve();
}

function methadone() {
    Vd1num.value = 160;
    Vd2num.value = 1000;
    Vd3num.value = 2430;
    Clnum.value = 106/70;
    Q2num.value = 0.145*160;
    Q3num.value = 0.08*160;
    dfsolve();
}

function rocuronium() {
    Vd1num.value = 142 + 6.0/7;
    Vd2num.value = 357 + 1.0/7;
    Vd3num.value = 571 + 3.0/7;
    Clnum.value = 5;
    Q2num.value = 11 + 3.0/7;
    Q3num.value = 7 + 1.0/7;
    dfsolve();
}

function vecuronium() {
    Vd1num.value = 142 + 6.0/7;
    Vd2num.value = 314 + 2.0/7;
    Vd3num.value = 571 + 3.0/7;
    Clnum.value = 4;
    Q2num.value = 10;
    Q3num.value = 6 + 3.0/7;
    dfsolve();
}

function cisatracurium() {
    Vd1num.value = 128 + 4.0/7;
    Vd2num.value = 285 + 5.0/7;
    Vd3num.value = 500;
    Clnum.value = 2 + 6.0/7;
    Q2num.value = 8 + 4.0/7;
    Q3num.value = 5 + 5.0/7;
    dfsolve();
}

function pancuronium() {
    Vd1num.value = 171 + 3.0/7;
    Vd2num.value = 428 + 4.0/7;
    Vd3num.value = 714 + 2.0/7;
    Clnum.value = 2 + 4.0/7;
    Q2num.value = 8 + 4.0/7;
    Q3num.value = 5 + 5.0/7;
    dfsolve();
}

function succinylcholine() {
    Vd1num.value = 200;
    Vd2num.value = 285 + 5.0/7;
    Vd3num.value = 428 + 4.0/7;
    Clnum.value = 20;
    Q2num.value = 21 + 3.0/7;
    Q3num.value = 14 + 2.0/7;
    dfsolve();
}

function lidocaine() {
    Vd1num.value = 171 + 3.0/7;
    Vd2num.value = 571 + 3.0/7;
    Vd3num.value = 1428 + 4.0/7;
    Clnum.value = 15 + 5.0/7;
    Q2num.value = 21 + 3.0/7;
    Q3num.value = 14 + 2.0/7;
    dfsolve();
}

function bupivacaine() {
    Vd1num.value = 142 + 6.0/7;
    Vd2num.value = 714 + 2.0/7;
    Vd3num.value = 2857 + 1.0/7;
    Clnum.value = 3 + 4.0/7;
    Q2num.value = 11 + 3.0/7;
    Q3num.value = 7 + 1.0/7;
    dfsolve();
}

function phenylephrine() {
    Vd1num.value = 214 + 2.0/7;
    Vd2num.value = 357 + 1.0/7;
    Vd3num.value = 714 + 2.0/7;
    Clnum.value = 17 + 1.0/7;
    Q2num.value = 17 + 1.0/7;
    Q3num.value = 11 + 3.0/7;
    dfsolve();
}

function ephedrine() {
    Vd1num.value = 285 + 5.0/7;
    Vd2num.value = 857 + 1.0/7;
    Vd3num.value = 1714 + 2.0/7;
    Clnum.value = 5 + 5.0/7;
    Q2num.value = 10;
    Q3num.value = 7 + 1.0/7;
    dfsolve();
}

function epinephrine() {
    Vd1num.value = 171 + 3.0/7;
    Vd2num.value = 357 + 1.0/7;
    Vd3num.value = 571 + 3.0/7;
    Clnum.value = 21 + 3.0/7;
    Q2num.value = 21 + 3.0/7;
    Q3num.value = 14 + 2.0/7;
    dfsolve();
}

function dobutamine() {
    Vd1num.value = 214 + 2.0/7;
    Vd2num.value = 428 + 4.0/7;
    Vd3num.value = 714 + 2.0/7;
    Clnum.value = 14 + 2.0/7;
    Q2num.value = 14 + 2.0/7;
    Q3num.value = 10;
    dfsolve();
}

function dopamine() {
    Vd1num.value = 228 + 4.0/7;
    Vd2num.value = 428 + 4.0/7;
    Vd3num.value = 785 + 5.0/7;
    Clnum.value = 12 + 6.0/7;
    Q2num.value = 12 + 6.0/7;
    Q3num.value = 8 + 4.0/7;
    dfsolve();
}

function milrinone() {
    Vd1num.value = 285 + 5.0/7;
    Vd2num.value = 1000;
    Vd3num.value = 2142 + 6.0/7;
    Clnum.value = 2 + 6.0/7;
    Q2num.value = 7 + 1.0/7;
    Q3num.value = 4 + 2.0/7;
    dfsolve();
}

function vasopressin() {
    Vd1num.value = 171 + 3.0/7;
    Vd2num.value = 357 + 1.0/7;
    Vd3num.value = 571 + 3.0/7;
    Clnum.value = 4 + 2.0/7;
    Q2num.value = 8 + 4.0/7;
    Q3num.value = 5 + 5.0/7;
    dfsolve();
}

function reset() {
    bnum.value = 0.4;
    tbolusnum.value = 15;
    tinfusionnum.value = 60;
    infusionnum.value = 0.005;
    tfinalnum.value = 135;
    dfsolve();
}

//function is called when slider value changes

Vd1num.addEventListener("change", function() {
    dfsolve();    
});

Vd2num.addEventListener("change", function() {
    dfsolve();    
});

Vd3num.addEventListener("change", function() {
    dfsolve();    
});

Clnum.addEventListener("change", function() {
    dfsolve();    
});

Q2num.addEventListener("change", function() {
    dfsolve();    
});

Q3num.addEventListener("change", function() {
    dfsolve();    
});

bnum.addEventListener("change", function() {
    dfsolve();    
});

tbolusnum.addEventListener("change", function() {
    dfsolve();    
});

tinfusionnum.addEventListener("change", function() {
    dfsolve();    
});

infusionnum.addEventListener("change", function() {
    dfsolve();
});

initialpnum.addEventListener("change", function() {
    dfsolve();    
});

tfinalnum.addEventListener("change", function() {
    dfsolve();    
});

ke0num.addEventListener("change", function() { 
    dfsolve(); 
});

reset();