/** Catalog-only integrity check and offline WebGL gallery generator.
 * Usage: node scripts/sky-shaders/check.cjs [output-directory]
 * Uses the project's existing Vite TypeScript transform; no Tauri runtime.
 * This transpiles only the catalog modules; it is NOT a whole-app typecheck.
 */
const fs = require('node:fs');
const path = require('node:path');
const out=path.resolve(process.argv[2] || path.join(require('node:os').tmpdir(),'xrift-sky-shader-check'));
async function main() {
const { createServer } = await import('vite');
const server = await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let catalog, quality;
try {
  catalog = await server.ssrLoadModule('/src/lib/visual-editor/sky-shader-catalog.ts');
  quality = await server.ssrLoadModule('/src/lib/visual-editor/sky-shader-quality.ts');
} finally { await server.close(); }
fs.mkdirSync(out,{recursive:true});
const entries=catalog.SKY_SHADER_CATALOG;
const ids=new Set(); let checks=0;
function assert(v,msg) { checks++; if(!v)throw new Error(msg); }
assert(entries.length>=33,'Sky catalog lost presets');
for (const e of entries) {
 assert(!ids.has(e.id),e.id+' duplicate'); ids.add(e.id);
 assert(/^[a-z0-9-]+$/.test(e.id),e.id+' id');
 assert(e.shader.vertexShader.includes('uCenter'),e.id+' vertex');
 assert(e.shader.variants.every(v=>v.side==='back'&&!v.depthWrite),e.id+' variant');
 assert(Object.values(e.shader.uniforms).every(u=>u.kind!=='texture'),e.id+' texture');
 const seen=new Set();
 for(const p of e.parameters) {
  const u=e.shader.uniforms[p.uniform];
  assert(!seen.has(p.uniform),e.id+' duplicate control '+p.uniform);seen.add(p.uniform);
  assert(u&&u.kind===p.kind,e.id+' control kind '+p.uniform);
  assert(e.shader.fragmentShader.includes(p.uniform),e.id+' control declaration '+p.uniform);
  if(p.kind==='number') assert(Number.isFinite(u.value)&&u.value>=p.min&&u.value<=p.max,e.id+' range '+p.uniform+'='+u.value);
 }
 if(e.shader.uniforms.uStarCount?.value>0) assert(seen.has('uStarCount'),e.id+' star control');
 for(const q of ['low','balanced','high']) {
  const s=quality.withSkyShaderQuality(e.shader,q);
  assert(s!==e.shader&&s.variants!==e.shader.variants,e.id+' quality clone');
  assert(s.uniforms===e.shader.uniforms,e.id+' uniforms preservation');
 }
 const d=catalog.defaultSkyShaderParameterValues(e);
 const edited=catalog.applySkyShaderParameters(e,{...d,uUnknown:3});
 assert(!edited.uniforms.uUnknown,e.id+' unknown uniform');
}
const categories=[...new Set(entries.map(e=>e.category))];
assert(categories.length===11,'11 categories');
for(const c of catalog.SKY_SHADER_CATEGORIES) assert(categories.includes(c),'empty category '+c);
const qualityVariants=Object.fromEntries(entries.map(e=>[e.id,Object.fromEntries(['low','balanced','high'].map(q=>[q,quality.withSkyShaderQuality(e.shader,q).variants[0].defines]))]));
const data={revision:catalog.SKY_SHADER_CATALOG_REVISION,entries,qualityVariants};
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(data,null,2));
const template=fs.readFileSync(path.join(__dirname,'gallery.template.html'),'utf8');
fs.writeFileSync(path.join(out,'sky-shader-gallery.html'),template
  .replace('__DATA__',JSON.stringify(data).replace(/<\//g,'<\\/'))
  .replace('__COUNTS__',`${entries.length} presets · ${categories.length} categories`));
const report={presets:entries.length,categories,checks,qualityVariants:entries.length*3};
fs.writeFileSync(path.join(out,'catalog-check.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,outputDirectory:out}));

}
main().catch(error => {console.error(error);process.exitCode=1;});
