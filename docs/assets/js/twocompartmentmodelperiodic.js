var Vd1slider = document.getElementById("Vd1slider");
var Vd1html = document.getElementById("Vd1html");
Vd1html.innerHTML = "<i>V</i><sub><i>d</i>, central</sub> (L)";
var Vd1num = document.getElementById("Vd1");
Vd1num.value = Vd1slider.value/10;

var Vd2slider = document.getElementById("Vd2slider");
var Vd2html = document.getElementById("Vd2html");
Vd2html.innerHTML = "<i>V</i><sub><i>d</i>, peripheral</sub> (L)";
var Vd2num = document.getElementById("Vd2");
Vd2num.value = Vd2slider.value/10;

var Clslider = document.getElementById("Clslider");
var Clhtml = document.getElementById("Clhtml");
Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (L/s)";
var Clnum = document.getElementById("Cl");
Clnum.value = Clslider.value/10;

var kslider = document.getElementById("kslider");
var khtml = document.getElementById("khtml");
khtml.innerHTML = "<i>k</i> (L/s)";
var knum = document.getElementById("k");
knum.value = kslider.value/10;

var bslider = document.getElementById("bslider");
var bhtml = document.getElementById("bhtml");
bhtml.innerHTML = "Bolus Amount (mg)";
var bnum = document.getElementById("b");
bnum.value = bslider.value/10;

var tbolusslider = document.getElementById("tbolusslider");
var tbolushtml = document.getElementById("tbolushtml");
tbolushtml.innerHTML = "Bolus Time (s)";
var tbolusnum = document.getElementById("tbolus");
tbolusnum.value = tbolusslider.value/10;

var tperiodslider = document.getElementById("tperiodslider");
var tperiodhtml = document.getElementById("tperiodhtml");
tperiodhtml.innerHTML = "Period Time (s)";
var tperiodnum = document.getElementById("tperiod");
tperiodnum.value = tperiodslider.value/10;

var tfinalslider = document.getElementById("tfinalslider");
var tfinalhtml = document.getElementById("tfinalhtml");
tfinalhtml.innerHTML = "<i>t</i><sub>final</sub> (s)";
var tfinalnum = document.getElementById("tfinal");
tfinalnum.value = tfinalslider.value/10;

function dfsolve() {
    // Exactly computes 

    function expn(x) {
        return math.exp(x); //1 + x + x*x/2 + x*x*x/6 + x*x*x*x/24 + x*x*x*x*x/120 + x*x*x*x*x*x/720 + x*x*x*x*x*x*x/5040;
    }

    function iterate1(t, C1, C2, params) {
        if (kslider.value == 0 && Clslider.value == 0) {
            return C1 + params.dt*params.b/params.Vd1;
        }
        else if (kslider.value == 0) {
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
            const a22 = (a2 + a3*expn(-dt*(a2 + a3)))/(a2 + a3);
            
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
    
    let params = { b: [], Cl: [], k: [], Vd1: [], Vd2: [], tbolus: [], tperiod: [], tfinal: [], dt: []};
    
    params.Vd1 = Vd1slider.value/10;
    params.Vd2 = Vd2slider.value/10;
    params.Cl = Clslider.value/10;
    params.k = kslider.value/10;
    params.b = bslider.value/tbolusslider.value;
    params.tbolus = tbolusslider.value/10;
    params.tperiod = tperiodslider.value/10;
    params.tfinal = tfinalslider.value/10;
    params.dt = 0.1;

    let t0 = 0;
    let y01 = 0;
    let y02 = 0;

    let N = Math.ceil(params.tfinal/params.dt);
    let Nhalf = Math.ceil(params.tbolus/params.dt);
    let Nperiod = Math.ceil(params.tperiod/params.dt);

    let ts = new Array(N + 1);
    let ys1 = new Array(N + 1);
    let ys2 = new Array(N + 1);

    for (let i = 0; i < N+1; i++) {
       ts[i] = i*params.dt;
    }

    ys1[0] = y01;
    ys2[0] = y02;

    let counter = 0;
    let counterperiod = 0;
    while (counter < N) {
        if (counterperiod < Nhalf) {
            params.b = bslider.value/tbolusslider.value;
        }
        else {
            params.b = 0;
        }
        ys1[counter + 1] = iterate1(ts[counter], ys1[counter], ys2[counter], params);
        ys2[counter + 1] = iterate2(ts[counter], ys1[counter], ys2[counter], params);
        counter = counter + 1;
        counterperiod = counterperiod + 1;
        if (counterperiod > Nperiod) {
            counterperiod = 0;
        }
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
    Vd1num.value = 5;
    Vd2slider.value = 40000;
    Vd2num.value = 4000;
    Clslider.value = 600;
    Clnum.value = 60;
    kslider.value = 2000;
    knum.value = 200;
    bslider.value = 2000;
    bnum.value = 200;
    tbolusslider.value = 200;
    tbolusnum.value = 20;
    tperiodslider.value = 1000;
    tperiodnum.value = 100;
    tfinalslider.value = 1000;
    tfinalnum.value = 100;
    dfsolve();
}

//function is called when slider value changes
Vd1slider.addEventListener("change", function() {
    Vd1num.value = Vd1slider.value/10;
    dfsolve();    
});

Vd1num.addEventListener("change", function() {
    Vd1slider.value = Vd1num.value*10;
    dfsolve();    
});

Vd2slider.addEventListener("change", function() {
    Vd2num.value = Vd2slider.value/10;
    dfsolve();    
});

Vd2num.addEventListener("change", function() {
    Vd2slider.value = Vd2num.value*10;
    dfsolve();    
});

Clslider.addEventListener("change", function() {
    Clnum.value = Clslider.value/10;
    dfsolve();    
});

Clnum.addEventListener("change", function() {
    Clslider.value = Clnum.value*10;
    dfsolve();    
});

kslider.addEventListener("change", function() {
    knum.value = kslider.value/10;
    dfsolve();    
});

knum.addEventListener("change", function() {
    kslider.value = knum.value*10;
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

tperiodslider.addEventListener("change", function() {
    tperiodnum.value = tperiodslider.value/10;
    dfsolve();    
});

tperiodnum.addEventListener("change", function() {
    tperiodslider.value = tperiodnum.value*10;
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