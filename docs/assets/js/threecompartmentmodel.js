var Vd1slider = document.getElementById("Vd1slider");
var Vd1html = document.getElementById("Vd1html");
Vd1html.innerHTML = "<i>V</i><sub>1</sub> (mL/kg)";
var Vd1num = document.getElementById("Vd1");
Vd1num.value = Vd1slider.value/10.0;

var Vd2slider = document.getElementById("Vd2slider");
var Vd2html = document.getElementById("Vd2html");
Vd2html.innerHTML = "<i>V</i><sub>2</sub> (L/kg)";
var Vd2num = document.getElementById("Vd2");
Vd2num.value = Vd2slider.value/10.0;

var Vd3slider = document.getElementById("Vd3slider");
var Vd3html = document.getElementById("Vd3html");
Vd3html.innerHTML = "<i>V</i><sub>3</sub> (L/kg)";
var Vd3num = document.getElementById("Vd3");
Vd3num.value = Vd3slider.value/10.0;

var Clslider = document.getElementById("Clslider");
var Clhtml = document.getElementById("Clhtml");
Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (mL/kg/min)";
var Clnum = document.getElementById("Cl");
Clnum.value = Clslider.value/10.0;

var k12slider = document.getElementById("k12slider");
var k12html = document.getElementById("k12html");
k12html.innerHTML = "<i>k</i><sub>12</sub> (min<sup>-1</sup>)";
var k12num = document.getElementById("k12");
k12num.value = k12slider.value/10.0;

var k13slider = document.getElementById("k13slider");
var k13html = document.getElementById("k13html");
k13html.innerHTML = "<i>k</i><sub>13</sub> (min<sup>-1</sup>)";
var k13num = document.getElementById("k13");
k13num.value = k13slider.value/10.0;

var bslider = document.getElementById("bslider");
var bhtml = document.getElementById("bhtml");
bhtml.innerHTML = "Bolus Amount (mg/kg)";
var bnum = document.getElementById("b");
bnum.value = bslider.value/10.0;

var infusionslider = document.getElementById("infusionslider");
var infusionhtml = document.getElementById("infusionhtml");
infusionhtml.innerHTML = "Infusion (mg/kg/min)";
var infusionnum = document.getElementById("infusion");
infusionnum.value = infusionslider.value/10.0;

var tbolusslider = document.getElementById("tbolusslider");
var tbolushtml = document.getElementById("tbolushtml");
tbolushtml.innerHTML = "Bolus Time (min)";
var tbolusnum = document.getElementById("tbolus");
tbolusnum.value = tbolusslider.value/10.0;

var initialpslider = document.getElementById("initialpslider");
var initialphtml = document.getElementById("initialphtml");
initialphtml.innerHTML = "[<i>P</i>]<sub>init</sub> (mg/L)";
var initialpnum = document.getElementById("initialp");
initialpnum.value = initialpslider.value/10.0;

var tfinalslider = document.getElementById("tfinalslider");
var tfinalhtml = document.getElementById("tfinalhtml");
tfinalhtml.innerHTML = "<i>t</i><sub>final</sub> (min)";
var tfinalnum = document.getElementById("tfinal");
tfinalnum.value = tfinalslider.value/10.0;

var pfinalhtml = document.getElementById("pfinalhtml");
pfinalhtml.innerHTML = 0;

var psshtml = document.getElementById("psshtml");
pfinalhtml.innerHTML = 0;

var betahtml = document.getElementById("betahtml");
betahtml.innerHTML = 0;

var termhalflifehtml = document.getElementById("termhalflifehtml");
termhalflifehtml.innerHTML = 0;

function roundToSignificantFigures(num, sigFigs) {
  if (num === 0) return 0; // Handle the 0 case separately

  const magnitude = math.floor(math.log10(math.abs(num)));
  const factor = 10 ** (sigFigs - magnitude - 1);
  return math.round(num * factor) / factor;
}

function dfsolve() {
    // Exactly computes 
    
    let params = { b: [], Cl: [], k12: [], k13: [], Vd1: [], Vd2: [], Vd3: [], tbolus: [], tperiod: [], initialp: [], tfinal: [], dt: []};
    
    params.Vd1 = Vd1num.value/1000.0; //mL to L conversion
    params.Vd2 = Vd2num.value/1.0;
    params.Vd3 = Vd3num.value/1.0;
    params.Cl = Clnum.value/1000.0;
    params.k12 = k12num.value/1.0;
    params.k13 = k13num.value/1.0;
    params.b = bnum.value/tbolusnum.value;
    params.tbolus = tbolusnum.value;
    params.initialp = initialpnum.value;
    params.tfinal = tfinalnum.value;
    params.dt = 0.1;

    const k12 = params.k12;
    const k13 = params.k13;
    const k10 = params.Cl/params.Vd1;
    const k20 = 0;
    const k21 = params.Vd1/params.Vd2*k12;
    const k23 = 0;
    const k30 = 0;
    const k31 = params.Vd1/params.Vd3*k13;
    const k32 = 0;

    let t0 = 0.0;
    let x01 = 1.0*params.initialp/params.Vd1;
    let x02 = 0.0;
    let x03 = 0.0;

    let N = Math.ceil(params.tfinal/params.dt);
    let Nhalf = Math.ceil(params.tbolus/params.dt);

    let ts = new Array(N + 1);
    let xs1 = new Array(N + 1);
    let xs2 = new Array(N + 1);
    let xs3 = new Array(N + 1);

    for (let i = 0; i < N+1; i++) {
       ts[i] = 1.0*i*params.dt;
    }

    xs1[0] = x01;
    xs2[0] = x02;
    xs3[0] = x03;

    let counter = 0;
    
    const mat = math.matrix([[-params.dt*(k10 + k12 + k13), params.dt*k21, params.dt*k31, params.dt],[params.dt*k12, -params.dt*(k20 + k21 + k23), params.dt*k32, 0],[params.dt*k13, params.dt*k23, -params.dt*(k30 + k31 + k32), 0],[0,0,0,0]]);

    const matmdt = math.expm(mat);

    const a11 = matmdt.subset(math.index(0,0));
    const a12 = matmdt.subset(math.index(0,1));
    const a13 = matmdt.subset(math.index(0,2));
    const a14 = matmdt.subset(math.index(0,3));
    const a21 = matmdt.subset(math.index(1,0));
    const a22 = matmdt.subset(math.index(1,1));
    const a23 = matmdt.subset(math.index(1,2));
    const a24 = matmdt.subset(math.index(1,3));
    const a31 = matmdt.subset(math.index(2,0));
    const a32 = matmdt.subset(math.index(2,1));
    const a33 = matmdt.subset(math.index(2,2));
    const a34 = matmdt.subset(math.index(2,3));
    
    while (counter < N) {
        if (counter < Nhalf) {
            params.b = bnum.value/tbolusnum.value;    
        }
        else {
            params.b = infusionnum.value;
        }
        xs1[counter + 1] = a11*xs1[counter] + a12*xs2[counter] + a13*xs3[counter] + params.b*a14;
        xs2[counter + 1] = a21*xs1[counter] + a22*xs2[counter] + a23*xs3[counter] + params.b*a24;
        xs3[counter + 1] = a31*xs1[counter] + a32*xs2[counter] + a33*xs3[counter] + params.b*a34;
        counter = counter + 1;
    }

    let trace_u1 = { x: [], y: [], name: 'Central Compartment'};
    let trace_u2 = { x: [], y: [], name: 'P1 Compartment'};
    let trace_u3 = { x: [], y: [], name: 'P2 Compartment'};
    
    for (let i = 0; i < N + 1; i++) {
        trace_u1.x.push(ts[i]);  
        trace_u1.y.push(xs1[i]/params.Vd1);
        trace_u2.x.push(ts[i]);
        trace_u2.y.push(xs2[i]/params.Vd2);
        trace_u3.x.push(ts[i]);
        trace_u3.y.push(xs3[i]/params.Vd3);
    }

    var layout1 = {
        title: {
            text:'Central Compartment',
            font: {
                family: 'Courier New, monospace',
                size: 24
            },
            //xref: 'paper',
            //x: 0.05,
        },
        xaxis: {
            title: {
                text: 'Time (min)',
                font: {
                    family: 'Courier New, monospace',
                    size: 18,
                    color: '#7f7f7f'
                }
            },
        },
        yaxis: {
            title: {
                text: 'Concentration (mg/L)',
                font: {
                    family: 'Courier New, monospace',
                    size: 18,
                    color: '#7f7f7f'
                }
            },
            type: 'log',
        }
    };

    var layout2 = {
        title: {
            text:'P1 Compartment',
            font: {
                family: 'Courier New, monospace',
                size: 24
            },
            //xref: 'paper',
            //x: 0.05,
        },
        xaxis: {
            title: {
                text: 'Time (min)',
                font: {
                    family: 'Courier New, monospace',
                    size: 18,
                    color: '#7f7f7f'
                }
            },
        },
        yaxis: {
            title: {
                text: 'Concentration (mg/L)',
                font: {
                    family: 'Courier New, monospace',
                    size: 18,
                    color: '#7f7f7f'
                }
            },
            type: 'log',
        }
    };

    var layout3 = {
        title: {
            text:'P2 Compartment',
            font: {
                family: 'Courier New, monospace',
                size: 24
            },
            //xref: 'paper',
            //x: 0.05,
        },
        xaxis: {
            title: {
                text: 'Time (min)',
                font: {
                    family: 'Courier New, monospace',
                    size: 18,
                    color: '#7f7f7f'
                }
            },
        },
        yaxis: {
            title: {
                text: 'Concentration (mg/L)',
                font: {
                    family: 'Courier New, monospace',
                    size: 18,
                    color: '#7f7f7f'
                }
            },
            type: 'log',
        }
    };

    Plotly.newPlot('myDiv1', [trace_u1], layout1);
    Plotly.newPlot('myDiv2', [trace_u2], layout2);
    Plotly.newPlot('myDiv3', [trace_u3], layout3);

    const eigs = math.eigs(mat);
    pfinalhtml.innerHTML = roundToSignificantFigures(xs1[N]/params.Vd1, 3);
    const pss = params.b/params.Cl;
    psshtml.innerHTML = roundToSignificantFigures(pss,3);
    const gamma = -eigs.values._data[1]/params.dt;
    const beta = -eigs.values._data[2]/params.dt;
    const alpha = -eigs.values._data[3]/params.dt;
    let termhalflife = 0;
    if (gamma != 0) {
        termhalflife = math.log(2)/gamma;
    }
    else if (beta != 0) {
        termhalflife = math.log(2)/beta;
    }
    else if (alpha != 0) {
        termhalflife = math.log(2)/alpha;
    }
    alphahtml.innerHTML = roundToSignificantFigures(alpha, 3);
    betahtml.innerHTML = roundToSignificantFigures(beta, 3);
    gammahtml.innerHTML = roundToSignificantFigures(gamma, 3);
    termhalflifehtml.innerHTML = roundToSignificantFigures(termhalflife, 3);

    //Calculate time to reach half of current concentration, if infusion is off
    let cshl = 0;
    let x1start = xs1[N];
    let x2start = xs2[N];
    let x3start = xs3[N];
    let x1 = x1start;
    let x2 = x2start;
    let x3 = x3start;
    while (x1 > x1start/2) {
        cshl = cshl + params.dt;
        let x1temp = x1;
        let x2temp = x2;
        let x3temp = x3;
        x1 = a11*x1temp + a12*x2temp + a13*x3temp;
        x2 = a21*x1temp + a22*x2temp + a23*x3temp;
        x3 = a31*x1temp + a32*x2temp + a33*x3temp; 
    }
    contextsensitivehalflifehtml.innerHTML = roundToSignificantFigures(cshl, 3);
}

//dfsolve();

function onecompartment() {
    k12slider.value = 0;
    k12num.value = 0;
    k13slider.value = 0;
    k13num.value = 0;
    dfsolve();
}

function alfentanil() {
    Vd1slider.value = 21.9/70*1000;
    Vd1num.value = 2.19/70*1000;
    Vd2slider.value = 0.54;
    Vd2num.value = 0.054;
    Vd3slider.value = 219/70 - 21.9/70 - 0.54;
    Vd3num.value = 21.9/70 - 2.19/70 - 0.054;
    Clslider.value = 1950/70;
    Clnum.value = 195/70;
    k12slider.value = 1266/219;
    k12num.value = 1266/2190;
    k13slider.value = 224/219;
    k13num.value = 224/2190;
    bslider.value = 1;
    bnum.value = 0.1;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 2400;
    tfinalnum.value = 240;
    dfsolve();
}

function fentanyl() {
    //Fentanyl.pdf
    Vd1slider.value = 1050;
    Vd1num.value = 105;
    Vd2slider.value = 4.46;
    Vd2num.value = 0.446;
    Vd3slider.value = 33.7;
    Vd3num.value = 3.37;
    Clslider.value = 83.8;
    Clnum.value = 8.38;
    k12slider.value = 0.474/0.105;
    k12num.value = 0.0474/0.105;
    k13slider.value = 0.199/0.105;
    k13num.value = 0.0199/0.105;
    bslider.value = 1;
    bnum.value = 0.1;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 2400;
    tfinalnum.value = 240;
    dfsolve();
}

function hydromorphone() {
    //hydromorphone2.pdf
    Vd1slider.value = 244/70*1000;
    Vd1num.value = 24.4/70*1000;
    Vd2slider.value = 244/70*(0.131/0.296);
    Vd2num.value = 24.4/70*(0.131/0.296);
    Vd3slider.value = 244/70*(0.179/0.018);
    Vd3num.value = 24.4/70*(0.179/0.018);
    Clslider.value = 16.6/70*1000;
    Clnum.value = 1.66/70*1000;
    k12slider.value = 2.96;
    k12num.value = 0.296;
    k13slider.value = 1.79;
    k13num.value = 0.179;
    bslider.value = 1;
    bnum.value = 0.1;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 2400;
    tfinalnum.value = 240;
    dfsolve();
}

function propofol() {
    Vd1slider.value = 6.28/70*10000;
    Vd1num.value = 6.28/70*1000;
    Vd2slider.value = 255/70;
    Vd2num.value = 25.5/70;
    Vd3slider.value = 2730/70;
    Vd3num.value = 273/70;
    Clslider.value = 1.79/70*10000;
    Clnum.value = 1.79/70*1000;
    k12slider.value = 17.5/6.28;
    k12num.value = 1.75/6.28;
    k13slider.value = 11.1/6.28;
    k13num.value = 1.11/6.28;
    bslider.value = 20;
    bnum.value = 2;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 2400;
    tfinalnum.value = 240;
    dfsolve();
}

function precedex() {
    Vd1slider.value = 252/70*1000.0;
    Vd1num.value = 25.2/70*1000.0;
    Vd2slider.value = 344/70;
    Vd2num.value = 34.4/70;
    Vd3slider.value = 654/70;
    Vd3num.value = 65.4/70;
    Clslider.value = 8.97/70*1000.0;
    Clnum.value = 0.897/70*1000.0;
    k12slider.value = 16.8/25.2;
    k12num.value = 1.68/25.2;
    k13slider.value = 6.2/25.2;
    k13num.value = 0.62/25.2;
    bslider.value = 0.4;
    bnum.value = 0.04;
    tbolusslider.value = 150;
    tbolusnum.value = 15;
    infusionslider.value = 0.3/60;
    infusionnum.value = 0.03/60;
    tfinalslider.value = 2400;
    tfinalnum.value = 240;
    dfsolve();
}

function remifentanil() {
    //Remifentanil3.pdf
    Vd1slider.value = 76000/70;
    Vd1num.value = 7600/70;
    Vd2slider.value = 94/70;
    Vd2num.value = 9.4/70;
    Vd3slider.value = 47/70;
    Vd3num.value = 4.7/70;
    Clslider.value = 29.2/70*1000;
    Clnum.value = 2.92/70*1000;
    k12slider.value = 2.569;
    k12num.value = 0.2569;
    k13slider.value = 0.128;
    k13num.value = 0.0128;
    bslider.value = 1;
    bnum.value = 0.1;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 2400;
    tfinalnum.value = 240;
    dfsolve();
}

function methadone() {
    //methadone2.pdf
    Vd1slider.value = 1600;
    Vd1num.value = 160;
    Vd2slider.value = 10;
    Vd2num.value = 1;
    Vd3slider.value = 24.3;
    Vd3num.value = 2.43;
    Clslider.value = 1060/70;
    Clnum.value = 106/70;
    k12slider.value = 1.45;
    k12num.value = 0.145;
    k13slider.value = 0.8;
    k13num.value = 0.08;
    bslider.value = 1;
    bnum.value = 0.1;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 2400;
    tfinalnum.value = 240;
    dfsolve();
}

function vecuronium() {
    //vecuronium.pdf
    Vd1slider.value = 520;
    Vd1num.value = 52;
    Vd2slider.value = 1.92;
    Vd2num.value = 0.192;
    Vd3slider.value = 10;
    Vd3num.value = 1;
    Clslider.value = 52;
    Clnum.value = 5.2;
    k12slider.value = 0.615;
    k12num.value = 0.0615;
    k13slider.value = 0;
    k13num.value = 0;
    bslider.value = 5000;
    bnum.value = 500;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 3000;
    tfinalnum.value = 300;
    dfsolve();
}

function rocuronium() {
    Vd1slider.value = 560;
    Vd1num.value = 56;
    Vd2slider.value = 2.29;
    Vd2num.value = 0.229;
    Vd3slider.value = 10;
    Vd3num.value = 1;
    Clslider.value = 97.8;
    Clnum.value = 9.78;
    k12slider.value = 1.005;
    k12num.value = 0.1005;
    k13slider.value = 0;
    k13num.value = 0;
    bslider.value = 5000;
    bnum.value = 500;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 3000;
    tfinalnum.value = 300;
    dfsolve();
}

function succinylcholine() {
    Vd1slider.value = 110;
    Vd1num.value = 11;
    Vd2slider.value = 0.110*(3.02/1.43);
    Vd2num.value = 0.011*(3.02/1.43);
    Vd3slider.value = 10;
    Vd3num.value = 1;
    Clslider.value = 341;
    Clnum.value = 34.1;
    k12slider.value = 30.2;
    k12num.value = 3.02;
    k13slider.value = 0;
    k13num.value = 0;
    bslider.value = 5000;
    bnum.value = 500;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 3000;
    tfinalnum.value = 300;
    dfsolve();
}

function midazolam() {
    //midazolam.pdf
    Vd1slider.value = 7300;
    Vd1num.value = 730;
    Vd2slider.value = 15.9;
    Vd2num.value = 1.59;
    Vd3slider.value = 10;
    Vd3num.value = 1;
    Clslider.value = 110;
    Clnum.value = 11;
    k12slider.value = 0.52;
    k12num.value = 0.052;
    k13slider.value = 0;
    k13num.value = 0;
    bslider.value = 5000;
    bnum.value = 500;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 3000;
    tfinalnum.value = 300;
    dfsolve();
}

function diazepam() {
    //midazolam.pdf - is an article about both midaz + diazepam
    Vd1slider.value = 1300;
    Vd1num.value = 130;
    Vd2slider.value = 11.1;
    Vd2num.value = 1.11;
    Vd3slider.value = 10;
    Vd3num.value = 1;
    Clslider.value = 5;
    Clnum.value = 0.5;
    k12slider.value = 0.21;
    k12num.value = 0.021;
    k13slider.value = 0;
    k13num.value = 0;
    bslider.value = 5000;
    bnum.value = 500;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    tfinalslider.value = 3000;
    tfinalnum.value = 300;
    dfsolve();
}

function reset() {
    propofol();
}

//function is called when slider value changes
Vd1slider.addEventListener("change", function() {
    Vd1num.value = Vd1slider.value/10.0;
    dfsolve();    
});

Vd1num.addEventListener("change", function() {
    Vd1slider.value = Vd1num.value*10.0;
    dfsolve();    
});

Vd2slider.addEventListener("change", function() {
    Vd2num.value = Vd2slider.value/10.0;
    dfsolve();    
});

Vd2num.addEventListener("change", function() {
    Vd2slider.value = Vd2num.value*10.0;
    dfsolve();    
});

Vd3slider.addEventListener("change", function() {
    Vd3num.value = Vd3slider.value/10.0;
    dfsolve();    
});

Vd3num.addEventListener("change", function() {
    Vd3slider.value = Vd3num.value*10.0;
    dfsolve();    
});

Clslider.addEventListener("change", function() {
    Clnum.value = Clslider.value/10.0;
    dfsolve();    
});

Clnum.addEventListener("change", function() {
    Clslider.value = Clnum.value*10.0;
    dfsolve();    
});

k12slider.addEventListener("change", function() {
    k12num.value = k12slider.value/10.0;
    dfsolve();    
});

k12num.addEventListener("change", function() {
    k12slider.value = k12num.value*10;
    dfsolve();    
});

k13slider.addEventListener("change", function() {
    k13num.value = k13slider.value/10.0;
    dfsolve();    
});

k13num.addEventListener("change", function() {
    k13slider.value = k13num.value*10;
    dfsolve();    
});

bslider.addEventListener("change", function() {
    bnum.value = bslider.value/10;
    dfsolve();    
});

bnum.addEventListener("change", function() {
    bslider.value = bnum.value*10;
    dfsolve();    
});

tbolusslider.addEventListener("change", function() {
    tbolusnum.value = tbolusslider.value/10;
    dfsolve();    
});

tbolusnum.addEventListener("change", function() {
    tbolusslider.value = tbolusnum.value*10;
    dfsolve();    
});

infusionslider.addEventListener("change", function() {
    infusionnum.value = infusionslider.value/10;
    dfsolve();
});

infusionnum.addEventListener("change", function() {
    infusionslider.value = infusionnum.value*10;
    dfsolve();
});

initialpslider.addEventListener("change", function() {
    initialpnum.value = initialpslider.value/10;
    dfsolve();    
});

initialpnum.addEventListener("change", function() {
    initialpslider.value = initialpnum.value*10;
    dfsolve();    
});
    
tfinalslider.addEventListener("change", function() {
    tfinalnum.value = tfinalslider.value/10;
    dfsolve();    
});

tfinalnum.addEventListener("change", function() {
    tfinalslider.value = tfinalnum.value*10;
    dfsolve();    
});

reset();