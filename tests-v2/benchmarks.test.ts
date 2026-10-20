import {test} from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkReport,projection,diffusion} from '../scripts/benchmarks';

test('analytic pressure and heat references converge at two resolutions',()=>{
 const r=benchmarkReport();
 for(const p of r.pressure){assert.ok(p.velocityError<1e-8);assert.ok(p.residual<1e-9);assert.ok(p.pressureError<.007);}
 for(const h of r.heat){assert.ok(h.temperatureError<.00013);assert.ok(h.energyError<1e-8);}
 assert.ok(r.sensitivity.pressureErrorRatio>3.8&&r.sensitivity.pressureErrorRatio<4.2);
 assert.ok(r.sensitivity.temperatureErrorRatio>3.8&&r.sensitivity.temperatureErrorRatio<4.2);
});
test('reference checks reject a leaking wall and corrupted temperature',()=>{
 assert.ok(projection(8,true).velocityError>1e-8);
 assert.ok(diffusion(8,true).temperatureError>.00013);
});

test('case/room interface heat diagnostic measures assembled transfer at nonuniform temperatures',async()=>{
 const {CoupledModel}=await import('../src/coupled');const {preset}=await import('../src/config');
 const m=new CoupledModel(preset());
 for(const k of m.pc.fluid)m.pc.T[k]=35+3*Math.sin(k);
 for(const k of m.room.fluid)m.room.T[k]=24+2*Math.cos(k);
 m.makeTerms();assert.ok(Math.abs(m.lastHeatError)<1e-8);
 // A broken interface patch normalization must appear in the actual diagnostic.
 const port=m.ports.find(p=>p.q>0)!;port.cp=port.cp.map(([k,w])=>[k,2*w]);
 m.makeTerms();assert.ok(Math.abs(m.lastHeatError)>1);
});
