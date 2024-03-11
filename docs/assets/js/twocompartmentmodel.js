var Vd1slider = document.getElementById("Vd1slider");
var Vd1html = document.getElementById("Vd1html");
Vd1html.innerHTML = "<i>V</i><sub><i>d</i>, central</sub> (L) = " + Vd1slider.value/10;

var Vd2slider = document.getElementById("Vd2slider");
var Vd2html = document.getElementById("Vd2html");
Vd2html.innerHTML = "<i>V</i><sub><i>d</i>, peripheral</sub> (L) = " + Vd2slider.value/10;

var Clslider = document.getElementById("Clslider");
var Clhtml = document.getElementById("Clhtml");
Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (L/s) = " + Clslider.value/10;

var kslider = document.getElementById("kslider");
var khtml = document.getElementById("khtml");
khtml.innerHTML = "<i>k</i> (L/s) = " + kslider.value/10;

var bslider = document.getElementById("bslider");
var bhtml = document.getElementById("bhtml");
bhtml.innerHTML = "Bolus Amount (mg) = " + bslider.value/10;

var tbolusslider = document.getElementById("tbolusslider");
var tbolushtml = document.getElementById("tbolushtml");
tbolushtml.innerHTML = "Bolus Time (s) = " + tbolusslider.value/10;

var tfinalslider = document.getElementById("tfinalslider");
var tfinalhtml = document.getElementById("tfinalhtml");
tfinalhtml.innerHTML = "<i>t</i><sub>final</sub> (s) = " + tfinalslider.value/10;

function dfsolve() {
    function df1(t, C1, C2, params) {
        return (params.b - params.Cl*C1 - params.k*(C1-C2) ) / params.Vd1;
    }

    function df2(t, C1, C2, params) {
        return params.k*(C1 - C2) / params.Vd2;
    }
    
    let params = { b: [], Cl: [], k: [], Vd1: [], Vd2: []};
    
    params.Vd1 = Vd1slider.value/10;
    params.Vd2 = Vd2slider.value/10;
    params.Cl = Clslider.value/10;
    params.k = kslider.value/10;
    params.b = bslider.value/tbolusslider.value;
    params.tbolus = tbolusslider.value/10;
    params.tfinal = tfinalslider.value/10;
    
    let t0 = 0;
    let y01 = 0;
    let y02 = 0;

    let dt = 0.01;
    let N = Math.ceil(params.tfinal/dt);
    let Nhalf = Math.ceil(params.tbolus/dt);

    let ts = new Array(N + 1);
    let ys1 = new Array(N + 1);
    let ys2 = new Array(N + 1);

    for (let i = 0; i < N+1; i++) {
       ts[i] = i*dt;
    }

    ys1[0] = y01;
    ys2[0] = y02;

// Runge-Kutta Loop
    for (let i = 0; i < Nhalf; i++) {
        const k11 = df1(ts[i], ys1[i], ys2[i], params);
        const k12 = df2(ts[i], ys1[i], ys2[i], params);

        const s11 = ys1[i] + k11 * dt/2;
        const s12 = ys2[i] + k12 * dt/2;

        const k21 = df1(ts[i] + dt/2, s11, s12, params);
        const k22 = df2(ts[i] + dt/2, s11, s12, params);

        const s21 = ys1[i] + k21 * dt/2;
        const s22 = ys2[i] + k22 * dt/2;
    
        const k31 = df1(ts[i] + dt/2, s21, s22, params); 
        const k32 = df2(ts[i] + dt/2, s21, s22, params); 

        const s31 = ys1[i] + k31 * dt;
        const s32 = ys2[i] + k32 * dt;

        const k41 = df1(ts[i] + dt, s31, s32, params); // f(t + h, y_n + k3*h)
        const k42 = df2(ts[i] + dt, s31, s32, params);
    
        ys1[i + 1] = ys1[i] + (k11/6 + k21/3 + k31/3 + k41/6) * dt;
        ys2[i + 1] = ys2[i] + (k12/6 + k22/3 + k32/3 + k42/6) * dt;
    }

    params.b = 0
    for (let i = Nhalf; i < N + 1; i++) {
        const k11 = df1(ts[i], ys1[i], ys2[i], params);
        const k12 = df2(ts[i], ys1[i], ys2[i], params);

        const s11 = ys1[i] + k11 * dt/2;
        const s12 = ys2[i] + k12 * dt/2;

        const k21 = df1(ts[i] + dt/2, s11, s12, params);
        const k22 = df2(ts[i] + dt/2, s11, s12, params);

        const s21 = ys1[i] + k21 * dt/2;
        const s22 = ys2[i] + k22 * dt/2;
    
        const k31 = df1(ts[i] + dt/2, s21, s22, params); 
        const k32 = df2(ts[i] + dt/2, s21, s22, params); 

        const s31 = ys1[i] + k31 * dt;
        const s32 = ys2[i] + k32 * dt;

        const k41 = df1(ts[i] + dt, s31, s32, params); // f(t + h, y_n + k3*h)
        const k42 = df2(ts[i] + dt, s31, s32, params);
    
        ys1[i + 1] = ys1[i] + (k11/6 + k21/3 + k31/3 + k41/6) * dt;
        ys2[i + 1] = ys2[i] + (k12/6 + k22/3 + k32/3 + k42/6) * dt;
    }


    let trace_u1 = { x: [], y: [], name: 'Central Compartment'};
    let trace_u2 = { x: [], y: [], name: 'Peripheral Compartment'};
    let trace_u3 = { x: [], y: [], name: 'Average Concentration'};
    
    for (let i = 0; i < N + 1; i++) {
        trace_u1.x.push(ts[i]);  
        trace_u1.y.push(ys1[i]);
        trace_u2.x.push(ts[i]);
        trace_u2.y.push(ys2[i]);
        trace_u3.x.push(ts[i]);
        trace_u3.y.push((params.Vd1*ys1[i] + params.Vd2*ys2[i])/(params.Vd1 + params.Vd2));
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
                text: 'Time (s)',
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
            }
        }
    };

    var layout2 = {
        title: {
            text:'Peripheral Compartment',
            font: {
                family: 'Courier New, monospace',
                size: 24
            },
            //xref: 'paper',
            //x: 0.05,
        },
        xaxis: {
            title: {
                text: 'Time (s)',
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
            }
        }
    };

    Plotly.newPlot('myDiv1', [trace_u1], layout1);
    Plotly.newPlot('myDiv2', [trace_u2], layout2);
}

dfsolve();

//function is called when slider value changes
Vd1slider.addEventListener("change", function() {
    Vd1html.innerHTML = "<i>V</i><sub><i>d</i>, central</sub> (L) = " + Vd1slider.value/10;
    dfsolve();    
});

Vd2slider.addEventListener("change", function() {
    Vd2html.innerHTML = "<i>V</i><sub><i>d</i>, peripheral</sub> (L) = " + Vd2slider.value/10;
    dfsolve();    
});

Clslider.addEventListener("change", function() {
    Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (L/s) = " + Clslider.value/10;
    dfsolve();    
});

kslider.addEventListener("change", function() {
    khtml.innerHTML = "<i>k</i> (L/s) = " + kslider.value/10;
    dfsolve();    
});

bslider.addEventListener("change", function() {
    bhtml.innerHTML = "Bolus Amount (mg) = " + bslider.value/10;
    dfsolve();    
});

tbolusslider.addEventListener("change", function() {
    tbolushtml.innerHTML = "Bolus Time (s) = " + tbolusslider.value/10;
    dfsolve();    
});

tfinalslider.addEventListener("change", function() {
    tfinalhtml.innerHTML = "<i>t</i><sub>final</sub> (s) = " + tfinalslider.value/10;
    dfsolve();    
});

