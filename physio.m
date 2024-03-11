syms Vdc Vdp b Cl k;
sol = dsolve('Vdc*Dy = b - Cl*y - k*(y - z)','Vdp*Dz = k*(y - z)','y(0) = 1','z(0) = 0');
sol.z = subs(sol.z,b,0);
sol.y = subs(sol.y,b,0);