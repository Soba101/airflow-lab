import { FluidGrid } from "./fluid";
// WebGPU accelerates the pressure Poisson solve. Transport and geometry remain in the worker.
export class GPUProjector {
  device: any;
  pipeline: any;
  available = true;
  reason = "";
  static async create(): Promise<GPUProjector | null> {
    const gpu = (globalThis.navigator as any)?.gpu;
    if (!gpu) return null;
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const solver = new GPUProjector();
      solver.device = device;
      device.lost.then((info: any) => {
        solver.available = false;
        solver.reason = info.message || "GPU device lost";
      });
      const code = `@group(0) @binding(0) var<storage,read> p:array<f32>; @group(0) @binding(1) var<storage,read_write> outp:array<f32>; @group(0) @binding(2) var<storage,read> diag:array<f32>; @group(0) @binding(3) var<storage,read> rhs:array<f32>; @group(0) @binding(4) var<storage,read> ns:array<i32>; @group(0) @binding(5) var<storage,read> weights:array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let k=id.x;if(k>=arrayLength(&diag)){return;}if(diag[k]<=0.0){outp[k]=0.0;return;}var v=rhs[k];for(var a=0u;a<6u;a++){let j=ns[k*6u+a];if(j>=0){v+=weights[k*6u+a]*p[u32(j)];}}outp[k]=v/diag[k];}`;
      solver.pipeline = await device.createComputePipelineAsync({
        layout: "auto",
        compute: { module: device.createShaderModule({ code }), entryPoint: "main" },
      });
      return solver;
    } catch {
      return null;
    }
  }
  async project(g: FluidGrid) {
    if (!this.available) throw new Error(this.reason);
    const d = this.device,
      storage = 128,
      copyDst = 8,
      copySrc = 4,
      mapRead = 1;
    const buffers: any[] = [];
    const buffer = (a: ArrayBufferView, usage = storage | copyDst) => {
      const b = d.createBuffer({ size: Math.max(4, a.byteLength), usage });
      d.queue.writeBuffer(b, 0, a.buffer, a.byteOffset, a.byteLength);
      buffers.push(b);
      return b;
    };
    try {
      const rhs = g.rhs(),
        mean = g.fluid.reduce((a, k) => a + rhs[k], 0) / g.fluid.length;
      for (const k of g.fluid) rhs[k] -= mean;
      const a = buffer(new Float32Array(g.count), storage | copyDst | copySrc),
        b = buffer(new Float32Array(g.count), storage | copyDst | copySrc),
        diag = buffer(Float32Array.from(g.diag)),
        r = buffer(Float32Array.from(rhs)),
        ns = buffer(g.neighbors),
        weights = buffer(Float32Array.from(g.coef));
      const group = (src: any, dst: any) =>
        d.createBindGroup({
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [src, dst, diag, r, ns, weights].map((buffer, binding) => ({ binding, resource: { buffer } })),
        });
      const ab = group(a, b),
        ba = group(b, a),
        encoder = d.createCommandEncoder();
      for (let i = 0; i < 160; i++) {
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, i % 2 ? ba : ab);
        pass.dispatchWorkgroups(Math.ceil(g.count / 64));
        pass.end();
      }
      const read = d.createBuffer({ size: g.count * 4, usage: mapRead | copyDst });
      buffers.push(read);
      encoder.copyBufferToBuffer(a, 0, read, 0, g.count * 4);
      d.queue.submit([encoder.finish()]);
      await read.mapAsync(1);
      const p = new Float32Array(read.getMappedRange()).slice();
      read.unmap();
      g.correct(p);
      const coarse = p.slice();
      g.project(45, 1e-6);
      for (const k of g.fluid) g.p[k] += (coarse[k] * 1.2) / g.pressureDt;
    } finally {
      buffers.forEach((b) => b.destroy());
    }
  }
}
