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
k2html.innerHTML = "<i>k</i><sub>1</sub> (mL/kg/min)";
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

    function expn(x) {
        return math.exp(x); 
    }

    function iterate1(t, C1, C2, C3, params) {
        const thisC2 = iterate2(t, C1, C2, C3, params);
        const thisC3 = iterate3(t, C1, C2, C3, params);
        const a1 = -params.Cl/params.Vd1;
        const e = params.b/params.Vd1;
        if (Clnum.value == 0) {
            return C1 - params.Vd2*(thisC2 - C2)/params.Vd1 - params.Vd3*(thisC3 - C3)/params.Vd1 + params.dt*e;
        }
        else {
            return (expn(a1*params.dt)*(e + a1*(C1 - params.Vd2*(thisC2 - C2)/params.Vd1 - params.Vd3*(thisC3 - C3)/params.Vd1)) - e)/a1;
        }
        
        //return C1 + params.dt/params.Vd1*(params.b - params.Cl*C1 - params.k1*(C1 - C2) - params.k2*(C1 - C3));
        //const a1 = -params.Cl/params.Vd1;
        //    const e = params.b/params.Vd1;
        //    const dt = params.dt;
        //    return (expn(a1*dt)*(e + C1*a1) - e)/a1;
    }

    function iterate2(t, C1, C2, C3, params) {
        //return C2 + params.dt/params.Vd2*params.k1*(C1 - C2);
        return (params.Vd1*C1 + params.Vd2*C2)/(params.Vd1 + params.Vd2) - params.Vd1*expn(-params.k1*params.dt*(params.Vd1+params.Vd2)/(params.Vd1*params.Vd2))*(C1 - C2)/(params.Vd1 + params.Vd2)
    }

    function iterate3(t, C1, C2, C3, params) {
        //return C3 + params.dt/params.Vd3*params.k2*(C1 - C3);
        return (params.Vd1*C1 + params.Vd3*C3)/(params.Vd1 + params.Vd3) - params.Vd1*expn(-params.k2*params.dt*(params.Vd1+params.Vd3)/(params.Vd1*params.Vd3))*(C1 - C3)/(params.Vd1 + params.Vd3)
    }
    
    /*
    function iterate1(t, C1, C2, C3, params) {
        if (k1num.value == 0 && Clnum.value == 0) {
            return C1 + params.dt*params.b/params.Vd1;
        }
        else if (k1num.value == 0) {
            const a1 = -params.Cl/params.Vd1;
            const e = params.b/params.Vd1;
            const dt = params.dt;
            return (expn(a1*dt)*(e + C1*a1) - e)/a1;
        }
        else if (Clnum.value == 0) {
            const a2 = params.k1/params.Vd1;
            const a3 = params.k1/params.Vd2;
            const sum = a2 + a3;
            const e = params.b/params.Vd1;
            const dt = params.dt;
            const b1 = (a3*dt*e)/sum - (a2*e*(expn(- sum*dt) - 1.0))/(sum*sum);

            const a11 = (a3 + a2*expn(-dt*sum))/sum;
            const a12 = a2*(1.0 - expn(-dt*sum))/sum;
            
            return a11*C1 + a12*C2 + b1;
            
        }
        else {
            const a1 = -(params.Cl + params.k1)/params.Vd1;
            const a2 = params.k1/params.Vd1;
            const a3 = params.k1/params.Vd2;
            const a4 = -params.k1/params.Vd2;
            const e = params.b/params.Vd1;
            const sqrtfun = math.sqrt(a1*a1 - 2.0*a1*a4 + a4*a4 + 4.0*a2*a3);
            const dt = params.dt;
        
            const a11 = (expn((dt*(a1 + a4 - sqrtfun))/2.0)*sqrtfun + a1*expn((dt*(a1 + a4 + sqrtfun))/2) - a4*expn((dt*(a1 + a4 + sqrtfun))/2) + expn((dt*(a1 + a4 + sqrtfun))/2.0)*sqrtfun - a1*expn((dt*(a1 + a4 - sqrtfun))/2.0) + a4*expn((dt*(a1 + a4 - sqrtfun))/2.0))/(2.0*sqrtfun);

            const a12 = -(a2*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(-(dt*sqrtfun)/2.0) - a2*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn((dt*sqrtfun)/2.0))/sqrtfun;

            const b1 = (2.0*e*expn(-(dt*sqrtfun)/2.0)*(a4*a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0) - 2.0*a4*expn((dt*sqrtfun)/2.0)*sqrtfun - a1*a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0) + 2.0*a2*a3*expn((a1*dt)/2.0)*expn((a4*dt)/2.0) + a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*sqrtfun - a4*a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(dt*sqrtfun) + a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(dt*sqrtfun)*sqrtfun + a1*a4*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(dt*sqrtfun) - 2.0*a2*a3*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(dt*sqrtfun)))/((4.0*a1*a4 - 4.0*a2*a3)*sqrtfun);

            return a11*C1 + a12*C2 + b1;
        }
    }

    function iterate2(t, C1, C2, C3, params) {
        if (k1num.value == 0) {
            return 1.0*C2;
        }
        else if (Clnum.value == 0) {
            const a2 = params.k1/params.Vd1;
            const a3 = params.k1/params.Vd2;
            const e = params.b/params.Vd1;
            const sum = a2 + a3;
            const dt = params.dt;
            const b2 = (a3*dt*e)/(sum) + (a3*e*(expn(- sum*dt) - 1.0))/(sum*sum);

            const a21 = a3*(1.0 - expn(-dt*sum))/sum;
            const a22 = (a2 + a3*expn(-dt*sum))/sum;
            
            return a21*C1 + a22*C2 + b2;
            
        }
        else {
            const a1 = -(params.Cl + params.k1)/params.Vd1;
            const a2 = params.k1/params.Vd1;
            const a3 = params.k1/params.Vd2;
            const a4 = -params.k1/params.Vd2;
            const e = params.b/params.Vd1;
            const sqrtfun = math.sqrt(a1*a1 - 2.0*a1*a4 + a4*a4 + 4.0*a2*a3);
            const dt = params.dt;
        
            const a22 = (expn((dt*(a1 + a4 - sqrtfun))/2.0)*sqrtfun - a1*expn((dt*(a1 + a4 + sqrtfun))/2) + a4*expn((dt*(a1 + a4 + sqrtfun))/2) + expn((dt*(a1 + a4 + sqrtfun))/2.0)*sqrtfun + a1*expn((dt*(a1 + a4 - sqrtfun))/2.0) - a4*expn((dt*(a1 + a4 - sqrtfun))/2.0))/(2.0*sqrtfun);

            const a21 = -(a3*(expn((dt*(a1 + a4 - sqrtfun))/2.0) - expn((dt*(a1 + a4 + sqrtfun))/2.0)))/sqrtfun;

            const b2 = (a3*e*(2.0/(a1 + a4 - sqrtfun) - (2.0*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(-(dt*sqrtfun)/2.0))/(a1 + a4 - sqrtfun)))/sqrtfun + (2.0*a3*e*(expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn((dt*sqrtfun)/2.0) - 1.0))/((a1 + a4 + sqrtfun)*sqrtfun);

            return a21*C1 + a22*C2 + b2;
        }
    }

    function iterate3(t, C1, C2, C3, params) {
        if (k1num.value == 0) {
            return 1.0*C2;
        }
        else if (Clnum.value == 0) {
            const a2 = params.k1/params.Vd1;
            const a3 = params.k1/params.Vd2;
            const e = params.b/params.Vd1;
            const sum = a2 + a3;
            const dt = params.dt;
            const b2 = (a3*dt*e)/(sum) + (a3*e*(expn(- sum*dt) - 1.0))/(sum*sum);

            const a21 = a3*(1.0 - expn(-dt*sum))/sum;
            const a22 = (a2 + a3*expn(-dt*sum))/sum;
            
            return a21*C1 + a22*C2 + b2;
            
        }
        else {
            const a1 = -(params.Cl + params.k1)/params.Vd1;
            const a2 = params.k1/params.Vd1;
            const a3 = params.k1/params.Vd2;
            const a4 = -params.k1/params.Vd2;
            const e = params.b/params.Vd1;
            const sqrtfun = math.sqrt(a1*a1 - 2.0*a1*a4 + a4*a4 + 4.0*a2*a3);
            const dt = params.dt;
        
            const a22 = (expn((dt*(a1 + a4 - sqrtfun))/2.0)*sqrtfun - a1*expn((dt*(a1 + a4 + sqrtfun))/2) + a4*expn((dt*(a1 + a4 + sqrtfun))/2) + expn((dt*(a1 + a4 + sqrtfun))/2.0)*sqrtfun + a1*expn((dt*(a1 + a4 - sqrtfun))/2.0) - a4*expn((dt*(a1 + a4 - sqrtfun))/2.0))/(2.0*sqrtfun);

            const a21 = -(a3*(expn((dt*(a1 + a4 - sqrtfun))/2.0) - expn((dt*(a1 + a4 + sqrtfun))/2.0)))/sqrtfun;

            const b2 = (a3*e*(2.0/(a1 + a4 - sqrtfun) - (2.0*expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn(-(dt*sqrtfun)/2.0))/(a1 + a4 - sqrtfun)))/sqrtfun + (2.0*a3*e*(expn((a1*dt)/2.0)*expn((a4*dt)/2.0)*expn((dt*sqrtfun)/2.0) - 1.0))/((a1 + a4 + sqrtfun)*sqrtfun);

            return a21*C1 + a22*C2 + b2;
        }
    }
    */
    
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
    params.dt = 0.01;

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
    //let counterperiod = 0;
    while (counter < N) {
        if (counter < Nhalf) {
            params.b = bnum.value/tbolusnum.value;    
        }
        else {
            params.b = infusionnum.value;
        }
        ys1[counter + 1] = iterate1(ts[counter], ys1[counter], ys2[counter], ys3[counter], params);
        ys2[counter + 1] = iterate2(ts[counter], ys1[counter], ys2[counter], ys3[counter], params);
        ys3[counter + 1] = iterate3(ts[counter], ys1[counter], ys2[counter], ys3[counter], params);
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
            }
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
            }
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
            }
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
    bslider.value = 0;
    bnum.value = 0;
    tbolusslider.value = 0;
    tbolusnum.value = 0;
    infusionslider.value = 100;
    infusionnum.value = infusionslider.value/10;
    initialpslider.value = 0;
    initialpnum.value = 0;
    tfinalslider.value = 10000;
    tfinalnum.value = 1000;
    dfsolve();
}

function onecompartment() {
    k1slider.value = 0;
    k1num.value = 0;
    k2slider.value = 0;
    k2num.value = 0;
    //infusionslider.value = 10*bslider.value/tbolusslider.value;
    //infusionnum.value = infusionslider.value/10;
    dfsolve();
}

function propofol() {
    Vd1slider.value = 700;
    Vd1num.value = 70;
    Vd2slider.value = 600;
    Vd2num.value = 60;
    Vd3slider.value = 600;
    Vd3num.value = 60;
    Clslider.value = 500;
    Clnum.value = 50;
    k1slider.value = 10000;
    k1num.value = 1000;
    k2slider.value = 10000;
    k2num.value = 1000;
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
