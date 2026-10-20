import {FluidGrid,RHO} from '../src/fluid';

// References are evaluated independently of the solver's stencil.
export function projection(n:number,boundaryFault=false){
 const g=new FluidGrid([1,1,1],[n,n,n]);g.pressureDt=.025;
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=1;x<n;x++)
  g.u[g.uid(x,y,z)]=-Math.PI*Math.sin(Math.PI*x/n);
 if(boundaryFault)g.u[g.uid(0,0,0)]=.1;
 const start=performance.now();g.project(1000,1e-10);
 const mean=g.fluid.reduce((s,k)=>s+g.p[k],0)/g.fluid.length;
 let pressureError=0,velocityError=0;
 // Discrete pressure amplitude tends to the continuum amplitude with O(h²).
 for(const k of g.fluid){const x=g.point(k)[0];pressureError=Math.max(pressureError,Math.abs((g.p[k]-mean)*g.pressureDt/RHO-Math.cos(Math.PI*x)));}
 for(const u of g.u)velocityError=Math.max(velocityError,Math.abs(u));
 return {case:'cosine pressure projection',n,dt:g.pressureDt,iterations:1000,tolerance:1e-10,runtimeMs:performance.now()-start,pressureError,velocityError,residual:g.pressureResidual};
}
export function diffusion(n:number,transportFault=false){
 const alpha=.01,g=new FluidGrid([1,1,1],[n,n,n],27,[0,0,0],alpha),zero=new Float64Array(g.count);
 for(const k of g.fluid)g.T[k]=27+Math.cos(Math.PI*g.point(k)[0]);
 if(transportFault)g.diffusivity=0;
 const dt=.1/n**2,steps=n*n,start=performance.now(),energy0=g.energy();
 for(let i=0;i<steps;i++)g.transport(dt,zero,zero,zero,zero);
 const t=dt*steps;let temperatureError=0;
 for(const k of g.fluid){const expected=27+Math.exp(-alpha*Math.PI**2*t)*Math.cos(Math.PI*g.point(k)[0]);temperatureError=Math.max(temperatureError,Math.abs(g.T[k]-expected));}
 return {case:'insulated cosine heat diffusion',n,dt,steps,time:t,runtimeMs:performance.now()-start,temperatureError,energyError:Math.abs(g.energy()-energy0)};
}
export function benchmarkReport(){const pressure=[8,16].map(n=>projection(n)),heat=[8,16].map(n=>diffusion(n));return {model:'FluidGrid numerical verification; not physical validation',pressure,heat,sensitivity:{pressureErrorRatio:pressure[0].pressureError/pressure[1].pressureError,temperatureErrorRatio:heat[0].temperatureError/heat[1].temperatureError},unverified:['obstructed channel pressure drop','developed heated plume','CPU/WebGPU parity','measured PC and room airflow']};}
