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
    // Exactly computes 

    function expn(x) {
        return math.exp(x); //1 + x + x*x/2 + x*x*x/6 + x*x*x*x/24 + x*x*x*x*x/120 + x*x*x*x*x*x/720 + x*x*x*x*x*x*x/5040;
    }

    function iterate1(t, C1, C2, params) {
        if (kslider.value == 0) {
            const a1 = -params.Cl/params.Vd1;
            const e = params.b/params.Vd1;
            const dt = params.dt;
            const b1 = e*(expn(dt) - 1);
            return C1*expn(a1*dt) + b1;
        }
        else if (Clslider.value == 0) {
            const a2 = params.k/params.Vd1;
            const a3 = params.k/params.Vd2;
            const e = params.b/params.Vd1;
            const dt = params.dt;
            const b1 = (a3*dt*e)/(a2 + a3) - (a2*e*(expn(- a2*dt - a3*dt) - 1.0))/((a2 + a3)*(a2 + a3));

            const a11 = (a3 + a2*expn(-dt*(a2 + a3)))/(a2 + a3);
            const a12 = (a2 - a2*expn(-dt*(a2 + a3)))/(a2 + a3);
            
            return a11*C1 + a12*C2 + b1;
            
        }
        else {
            const a1 = -(params.Cl + params.k)/params.Vd1;
            const a2 = params.k/params.Vd1;
            const a3 = params.k/params.Vd2;
            const a4 = -params.k/params.Vd2;
            const e = params.b/params.Vd1;
            const sqrtfun = math.sqrt(a1*a1 - 2.0*a1*a4 + a4*a4 + 4.0*a2*a3);
            const dt = params.dt;
        
            const a11 = (expn((dt*(a1 + a4 - sqrtfun))/2.0)*sqrtfun + a1*expn((dt*(a1 + a4 + sqrtfun))/2) - a4*expn((dt*(a1 + a4 + sqrtfun))/2) + expn((dt*(a1 + a4 + sqrtfun))/2.0)*sqrtfun - a1*expn((dt*(a1 + a4 - sqrtfun))/2.0) + a4*expn((dt*(a1 + a4 - sqrtfun))/2.0))/(2.0*sqrtfun);

            const a12 = -(a2*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(-(dt*sqrtfun)/2.0) - a2*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn((dt*sqrtfun)/2.0))/sqrtfun;

            const b1 = (2.0*e*expn(-(dt*sqrtfun)/2.0)*(a4*a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0) - 2.0*a4*expn((dt*sqrtfun)/2.0)*sqrtfun - a1*a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0) + 2.0*a2*a3*expn((a1*dt)/2.0)*expn((a4*dt)/2.0) + a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*sqrtfun - a4*a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(dt*sqrtfun) + a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(dt*sqrtfun)*sqrtfun + a1*a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(dt*sqrtfun) - 2.0*a2*a3*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(dt*sqrtfun)))/((4.0*a1*a4 - 4.0*a2*a3)*sqrtfun);

            return a11*C1 + a12*C2 + b1;
        }
    }

    function iterate2(t, C1, C2, params) {
        if (kslider.value == 0) {
            return C2;
        }
        else if (Clslider.value == 0) {
            const a2 = params.k/params.Vd1;
            const a3 = params.k/params.Vd2;
            const e = params.b/params.Vd1;
            const dt = params.dt;
            const b2 = (a3*dt*e)/(a2 + a3) + (a3*e*(expn(- a2*dt - a3*dt) - 1.0))/((a2 + a3)*(a2 + a3));

            const a21 = (a3 - a3*expn(-dt*(a2 + a3)))/(a2 + a3);
            const a22 = (a2 + a3*exp(-dt*(a2 + a3)))/(a2 + a3);
            
            return a21*C1 + a22*C2 + b2;
            
        }
        else {
            const a1 = -(params.Cl + params.k)/params.Vd1;
            const a2 = params.k/params.Vd1;
            const a3 = params.k/params.Vd2;
            const a4 = -params.k/params.Vd2;
            const e = params.b/params.Vd1;
            const sqrtfun = math.sqrt(a1*a1 - 2.0*a1*a4 + a4*a4 + 4.0*a2*a3);
            const dt = params.dt;
        
            const a22 = (expn((dt*(a1 + a4 - sqrtfun))/2.0)*sqrtfun - a1*expn((dt*(a1 + a4 + sqrtfun))/2) + a4*expn((dt*(a1 + a4 + sqrtfun))/2) + expn((dt*(a1 + a4 + sqrtfun))/2.0)*sqrtfun + a1*expn((dt*(a1 + a4 - sqrtfun))/2.0) - a4*expn((dt*(a1 + a4 - sqrtfun))/2.0))/(2.0*sqrtfun);

            const a21 = -(a3*(expn((dt*(a1 + a4 - sqrtfun))/2.0) - expn((dt*(a1 + a4 + sqrtfun))/2.0)))/sqrtfun;

            const b2 = (a3*e*(2.0/(a1 + a4 - sqrtfun) - (2.0*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(-(dt*sqrtfun)/2.0))/(a1 + a4 - sqrtfun)))/sqrtfun + (2.0*a3*e*(expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn((dt*sqrtfun)/2.0) - 1.0))/((a1 + a4 + sqrtfun)*sqrtfun);

            return a21*C1 + a22*C2 + b2;
        }
    }
    
    let params = { b: [], Cl: [], k: [], Vd1: [], Vd2: []};
    
    params.Vd1 = Vd1slider.value/10;
    params.Vd2 = Vd2slider.value/10;
    params.Cl = Clslider.value/10;
    params.k = kslider.value/10;
    params.b = bslider.value/tbolusslider.value;
    params.tbolus = tbolusslider.value/10;
    params.tfinal = tfinalslider.value/10;
    params.dt = 0.1;

    let t0 = 0;
    let y01 = 0;
    let y02 = 0;

    let N = Math.ceil(params.tfinal/params.dt);
    let Nhalf = Math.ceil(params.tbolus/params.dt);

    let ts = new Array(N + 1);
    let ys1 = new Array(N + 1);
    let ys2 = new Array(N + 1);

    for (let i = 0; i < N+1; i++) {
       ts[i] = i*params.dt;
    }

    ys1[0] = y01;
    ys2[0] = y02;

    for (let i = 0; i < Nhalf; i++) {
        ys1[i + 1] = iterate1(ts[i], ys1[i], ys2[i], params);
        ys2[i + 1] = iterate2(ts[i], ys1[i], ys2[i], params);
    }

    params.b = 0
    for (let i = Nhalf; i < N + 1; i++) {
        ys1[i + 1] = iterate1(ts[i], ys1[i], ys2[i], params);
        ys2[i + 1] = iterate2(ts[i], ys1[i], ys2[i], params);
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

function reset() {
    Vd1slider.value = 50;
    Vd2slider.value = 40000;
    Clslider.value = 600;
    kslider.value = 2000;
    bslider.value = 2000;
    tbolusslider.value = 200;
    tfinalslider.value = 1000;
    Vd1html.innerHTML = "<i>V</i><sub><i>d</i>, central</sub> (L) = " + Vd1slider.value/10;
    Vd2html.innerHTML = "<i>V</i><sub><i>d</i>, peripheral</sub> (L) = " + Vd2slider.value/10;
    Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (L/s) = " + Clslider.value/10;
    khtml.innerHTML = "<i>k</i> (L/s) = " + kslider.value/10;
    bhtml.innerHTML = "Bolus Amount (mg) = " + bslider.value/10;
    tbolushtml.innerHTML = "Bolus Time (s) = " + tbolusslider.value/10;
    tfinalhtml.innerHTML = "<i>t</i><sub>final</sub> (s) = " + tfinalslider.value/10;
    dfsolve();
}

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

