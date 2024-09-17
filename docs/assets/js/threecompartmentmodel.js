var Vd1slider = document.getElementById("Vd1slider");
var Vd1html = document.getElementById("Vd1html");
Vd1html.innerHTML = "<i>V</i><sub><i>d</i>, central</sub> (mL/kg)";
var Vd1num = document.getElementById("Vd1");
Vd1num.value = Vd1slider.value/10.0;

var Vd2slider = document.getElementById("Vd2slider");
var Vd2html = document.getElementById("Vd2html");
Vd2html.innerHTML = "<i>V</i><sub><i>d</i>, p1</sub> (L/kg)";
var Vd2num = document.getElementById("Vd2");
Vd2num.value = Vd2slider.value/10.0;

var Vd3slider = document.getElementById("Vd3slider");
var Vd3html = document.getElementById("Vd3html");
Vd3html.innerHTML = "<i>V</i><sub><i>d</i>, p2</sub> (L/kg)";
var Vd3num = document.getElementById("Vd3");
Vd3num.value = Vd3slider.value/10.0;

var Clslider = document.getElementById("Clslider");
var Clhtml = document.getElementById("Clhtml");
Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (mL/kg/min)";
var Clnum = document.getElementById("Cl");
Clnum.value = Clslider.value/10.0;

var k1slider = document.getElementById("k1slider");
var k1html = document.getElementById("k1html");
k1html.innerHTML = "<i>k</i><sub>1</sub> (mL/kg/min)";
var k1num = document.getElementById("k1");
k1num.value = k1slider.value/10.0;

var k2slider = document.getElementById("k2slider");
var k2html = document.getElementById("k2html");
k2html.innerHTML = "<i>k</i><sub>2</sub> (mL/kg/min)";
var k2num = document.getElementById("k2");
k2num.value = k2slider.value/10.0;

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

function dfsolve() {
    // Exactly computes 
    
    let params = { b: [], Cl: [], k1: [], k2: [], Vd1: [], Vd2: [], Vd3: [], tbolus: [], tperiod: [], initialp: [], tfinal: [], dt: []};
    
    params.Vd1 = Vd1num.value/1000.0; //mL to L conversion
    params.Vd2 = Vd2num.value/1.0;
    params.Vd3 = Vd3num.value/1.0;
    params.Cl = Clnum.value/1000.0;
    params.k1 = k1num.value/1000.0;
    params.k2 = k2num.value/1000.0;
    params.b = bnum.value/tbolusnum.value;
    params.tbolus = tbolusnum.value;
    params.initialp = initialpnum.value;
    params.tfinal = tfinalnum.value;
    params.dt = 0.1;

    let t0 = 0.0;
    let y01 = 1.0*params.initialp;
    let y02 = 0.0;
    let y03 = 0.0;

    let N = Math.ceil(params.tfinal/params.dt);
    let Nhalf = Math.ceil(params.tbolus/params.dt);

    let ts = new Array(N + 1);
    let ys1 = new Array(N + 1);
    let ys2 = new Array(N + 1);
    let ys3 = new Array(N + 1);

    for (let i = 0; i < N+1; i++) {
       ts[i] = 1.0*i*params.dt;
    }

    ys1[0] = y01;
    ys2[0] = y02;
    ys3[0] = y03;

    let counter = 0;
    
    const mat = math.matrix([[-params.dt*(params.Cl + params.k1 + params.k2)/params.Vd1, params.dt*params.k1/params.Vd1, params.dt*params.k2/params.Vd1, params.dt],[params.dt*params.k1/params.Vd2, -params.dt*params.k1/params.Vd2, 0, 0],[params.dt*params.k2/params.Vd3, 0, -params.dt*params.k2/params.Vd3, 0],[0,0,0,0]]);

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
            params.b = bnum.value/tbolusnum.value/params.Vd1;    
        }
        else {
            params.b = infusionnum.value/params.Vd1;
        }
        ys1[counter + 1] = a11*ys1[counter] + a12*ys2[counter] + a13*ys3[counter] + params.b*a14;
        ys2[counter + 1] = a21*ys1[counter] + a22*ys2[counter] + a23*ys3[counter] + params.b*a24;
        ys3[counter + 1] = a31*ys1[counter] + a32*ys2[counter] + a33*ys3[counter] + params.b*a34;
        counter = counter + 1;
    }

    let trace_u1 = { x: [], y: [], name: 'Central Compartment'};
    let trace_u2 = { x: [], y: [], name: 'P1 Compartment'};
    let trace_u3 = { x: [], y: [], name: 'P2 Compartment'};
    
    for (let i = 0; i < N + 1; i++) {
        trace_u1.x.push(ts[i]);  
        trace_u1.y.push(ys1[i]);
        trace_u2.x.push(ts[i]);
        trace_u2.y.push(ys2[i]);
        trace_u3.x.push(ts[i]);
        trace_u3.y.push(ys3[i]);
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
}

dfsolve();

function reset() {
    Vd1slider.value = 700;
    Vd1num.value = 70;
    Vd2slider.value = 600;
    Vd2num.value = 60;
    Vd3slider.value = 600;
    Vd3num.value = 60;
    Clslider.value = 500;
    Clnum.value = 50;
    k1slider.value = 2000;
    k1num.value = 200;
    k2slider.value = 2000;
    k2num.value = 200;
    bslider.value = 1;
    bnum.value = 0.1;
    tbolusslider.value = 0.1;
    tbolusnum.value = 0.1;
    infusionslider.value = 0;
    infusionnum.value = 0;
    initialpslider.value = 0;
    initialpnum.value = 0;
    tfinalslider.value = 2400;
    tfinalnum.value = 240;
    dfsolve();
}

function onecompartment() {
    k1slider.value = 0;
    k1num.value = 0;
    k2slider.value = 0;
    k2num.value = 0;
    dfsolve();
}

function alfentanil() {
    Vd1slider.value = 10970;
    Vd1num.value = 1097;
    Vd2slider.value = 0.4;
    Vd2num.value = 0.04;
    Vd3slider.value = 1.5;
    Vd3num.value = 0.15;
    Clslider.value = 28;
    Clnum.value = 2.8;
    k1slider.value = 181;
    k1num.value = 18.1;
    k2slider.value = 32;
    k2num.value = 3.2;
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
    Vd1slider.value = 900;
    Vd1num.value = 90;
    Vd2slider.value = 3.6;
    Vd2num.value = 0.36;
    Vd3slider.value = 39;
    Vd3num.value = 3.9;
    Clslider.value = 256;
    Clnum.value = 25.6;
    k1slider.value = 250;
    k1num.value = 25;
    k2slider.value = 159;
    k2num.value = 15.9;
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

function precedex() {
    Vd1slider.value = 3600;
    Vd1num.value = 360;
    Vd2slider.value = 4.9;
    Vd2num.value = 0.49;
    Vd3slider.value = 9.3;
    Vd3num.value = 0.93;
    Clslider.value = 129;
    Clnum.value = 12.9;
    k1slider.value = 240;
    k1num.value = 24;
    k2slider.value = 89;
    k2num.value = 8.9;
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

function remifentanil() {
    Vd1slider.value = 830;
    Vd1num.value = 83;
    Vd2slider.value = 1.3;
    Vd2num.value = 0.13;
    Vd3slider.value = 0.72;
    Vd3num.value = 0.072;
    Clslider.value = 369;
    Clnum.value = 36.9;
    k1slider.value = 246;
    k1num.value = 24.6;
    k2slider.value = 17.7;
    k2num.value = 1.77;
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

k1slider.addEventListener("change", function() {
    k1num.value = k1slider.value/10.0;
    dfsolve();    
});

k1num.addEventListener("change", function() {
    k1slider.value = k1num.value*10;
    dfsolve();    
});

k2slider.addEventListener("change", function() {
    k2num.value = k2slider.value/10.0;
    dfsolve();    
});

k2num.addEventListener("change", function() {
    k2slider.value = k2num.value*10;
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
