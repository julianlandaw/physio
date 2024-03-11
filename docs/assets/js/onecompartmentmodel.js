var Vdslider = document.getElementById("Vdslider");
var Vdhtml = document.getElementById("Vdhtml");
Vdhtml.innerHTML = "<i>V</i><sub><i>d</i></sub> (L) = " + Vdslider.value/10;

var Clslider = document.getElementById("Clslider");
var Clhtml = document.getElementById("Clhtml");
Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (L/s) = " + Clslider.value/10;

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
    function df(t, C1, params) {
        return (params.b - params.Cl*C1 ) / params.Vd;
    }
    
    let params = { b: [], Cl: [], Vd: []};
    
    params.Vd = Vdslider.value/10;
    params.Cl = Clslider.value/10;
    params.b = bslider.value/tbolusslider.value;
    params.tbolus = tbolusslider.value/10;
    params.tfinal = tfinalslider.value/10;
    
    let t0 = 0;
    let y0 = 0;

    let dt = 0.01;
    let N = Math.ceil(params.tfinal/dt);
    let Nhalf = Math.ceil(params.tbolus/dt);

    let ts = new Array(N + 1);
    let ys = new Array(N + 1);

    for (let i = 0; i < N+1; i++) {
       ts[i] = i*dt;
    }

    ys[0] = y0;

// Runge-Kutta Loop
    for (let i = 0; i < Nhalf; i++) {
        const k1 = df(ts[i], ys[i], params);

        const s1 = ys[i] + k1 * dt/2;

        const k2 = df(ts[i] + dt/2, s1, params);

        const s2 = ys[i] + k2 * dt/2;
    
        const k3 = df(ts[i] + dt/2, s2, params); 

        const s3 = ys[i] + k3 * dt;

        const k4 = df(ts[i] + dt, s3, params); // f(t + h, y_n + k3*h)
    
        ys[i + 1] = ys[i] + (k1/6 + k2/3 + k3/3 + k4/6) * dt;
    }

    params.b = 0
    for (let i = Nhalf; i < N + 1; i++) {
        const k1 = df(ts[i], ys[i], params);

        const s1 = ys[i] + k1 * dt/2;

        const k2 = df(ts[i] + dt/2, s1, params);

        const s2 = ys[i] + k2 * dt/2;
    
        const k3 = df(ts[i] + dt/2, s2, params); 

        const s3 = ys[i] + k3 * dt;

        const k4 = df(ts[i] + dt, s3, params); // f(t + h, y_n + k3*h)
    
        ys[i + 1] = ys[i] + (k1/6 + k2/3 + k3/3 + k4/6) * dt;
    }


    let trace_u1 = { x: [], y: [], name: 'Central Compartment'};
    
    for (let i = 0; i < N + 1; i++) {
        trace_u1.x.push(ts[i]);  
        trace_u1.y.push(ys[i]);
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

    Plotly.newPlot('myDiv', [trace_u1], layout1);
}

dfsolve();

function reset() {
    Vdslider.value = 50;
    Clslider.value = 600;
    bslider.value = 2000;
    tbolusslider.value = 200;
    tfinalslider.value = 1000;
    Vdhtml.innerHTML = "<i>V</i><sub><i>d</i></sub> (L) = " + Vdslider.value/10;
    Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (L/s) = " + Clslider.value/10;
    bhtml.innerHTML = "Bolus Amount (mg) = " + bslider.value/10;
    tbolushtml.innerHTML = "Bolus Time (s) = " + tbolusslider.value/10;
    tfinalhtml.innerHTML = "<i>t</i><sub>final</sub> (s) = " + tfinalslider.value/10;
    dfsolve();
}

//function is called when slider value changes
Vdslider.addEventListener("change", function() {
    Vdhtml.innerHTML = "<i>V</i><sub><i>d</i></sub> (L) = " + Vdslider.value/10;
    dfsolve();    
});

Clslider.addEventListener("change", function() {
    Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (L/s) = " + Clslider.value/10;
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