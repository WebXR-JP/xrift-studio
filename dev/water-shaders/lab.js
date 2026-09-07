/* Offline WebGL2 verification harness. Uses the catalog's literal GLSL.
 * The small built-in/chunk adapter below emulates the standard ShaderMaterial
 * inputs. This is NOT an integration test of Three.js, R3F or the Tauri shell.
 */
const data = JSON.parse(document.getElementById('catalog-data').textContent);
const entries = data.entries;
const canvas = document.getElementById('water');
const errorBox = document.getElementById('error');
const gl = canvas.getContext('webgl2', {antialias:true, alpha:false, preserveDrawingBuffer:true});
if (!gl) { errorBox.textContent = 'WebGL2を利用できません。ハードウェアアクセラレーションを有効にしたブラウザで開いてください。'; throw new Error('WebGL2 unavailable'); }
const errors = [];
const identity = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const programs = new Map();
const VERT_PREFIX = `#version 300 es
precision highp float;
#define attribute in
#define varying out
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
in vec3 position;
in vec3 normal;
`;
const FRAG_PREFIX = `#version 300 es
precision highp float;
#define varying in
out vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
uniform vec3 cameraPosition;
vec3 linearToSRGB(vec3 value) {
  return mix(12.92*value, 1.055*pow(max(value,vec3(0.0)),vec3(1.0/2.4))-0.055, step(vec3(0.0031308),value));
}
vec3 RRTAndODTFit(vec3 v) { vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }
vec3 ACESFilmicToneMapping(vec3 color) {
  mat3 inputMat=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));
  mat3 outputMat=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));
  return clamp(outputMat*RRTAndODTFit(inputMat*(color/0.6)),0.0,1.0);
}
`;
function chunks(source) {
  const replacements = {
    fog_pars_vertex: '#ifdef USE_FOG\nout float vFogDepth;\n#endif',
    fog_vertex: '#ifdef USE_FOG\nvFogDepth = -mvPosition.z;\n#endif',
    fog_pars_fragment: '#ifdef USE_FOG\nin float vFogDepth;\nuniform vec3 fogColor;\nuniform float fogNear;\nuniform float fogFar;\n#endif',
    fog_fragment: '#ifdef USE_FOG\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFogDepth));\n#endif',
    tonemapping_fragment: 'gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);',
    colorspace_fragment: 'gl_FragColor.rgb = linearToSRGB(gl_FragColor.rgb);',
  };
  return source.replace(/#include\s*<([^>]+)>/g, (_all, key) => {
    if (!(key in replacements)) throw new Error('Unknown Three.js shader chunk: '+key);
    return replacements[key];
  });
}
function compile(type, source) {
  const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) { const reason=gl.getShaderInfoLog(shader); gl.deleteShader(shader); errors.push(reason); throw new Error(reason); }
  return shader;
}
function createProgram(vertex, fragment) {
  const v=compile(gl.VERTEX_SHADER,vertex), f=compile(gl.FRAGMENT_SHADER,fragment), p=gl.createProgram();
  gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p); gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) { const reason=gl.getProgramInfoLog(p); gl.deleteProgram(p); errors.push(reason); throw new Error(reason); }
  const uniforms={};
  for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++) {const info=gl.getActiveUniform(p,i);uniforms[info.name]={type:info.type,location:gl.getUniformLocation(p,info.name)};}
  return {p,uniforms};
}
function programFor(entry, fog=false) {
  const defineMap=entry.shader.variants[0].defines;
  const key=JSON.stringify([defineMap,fog]);
  if(programs.has(key)) return programs.get(key);
  const defines=Object.entries(defineMap).map(([n,v])=>`#define ${n} ${v}\n`).join('')+(fog?'#define USE_FOG 1\n':'');
  const program=createProgram(VERT_PREFIX+defines+chunks(entry.shader.vertexShader),FRAG_PREFIX+defines+chunks(entry.shader.fragmentShader));
  programs.set(key,program);return program;
}
function uniform(program,name,value){
  const item=program.uniforms[name];if(!item)return;
  const loc=item.location;
  if(item.type===gl.FLOAT) gl.uniform1f(loc,value);
  else if(item.type===gl.FLOAT_VEC2) gl.uniform2fv(loc,value);
  else if(item.type===gl.FLOAT_VEC3) gl.uniform3fv(loc,value);
  else if(item.type===gl.FLOAT_VEC4) gl.uniform4fv(loc,value);
  else if(item.type===gl.FLOAT_MAT3) gl.uniformMatrix3fv(loc,false,value);
  else if(item.type===gl.FLOAT_MAT4) gl.uniformMatrix4fv(loc,false,value);
}
function rgb(hex,linear=true){let c=[1,3,5].map(p=>parseInt(hex.slice(p,p+2),16)/255);return linear?c.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4):c;}
function normalize(v){const n=Math.hypot(...v)||1;return v.map(x=>x/n);}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0);}
function cameraMatrices(width,height,mode=0){
  const eye=mode===1?[3,16,10]:mode===2?[7,-2,10]:[8,5.6,12];
  const target=mode===1?[0,0,-4]:[0,0,-10];
  const z=normalize(eye.map((v,i)=>v-target[i])), x=normalize(cross([0,1,0],z)), y=cross(z,x);
  const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
  const f=1/Math.tan(44*Math.PI/360), n=.1, far=500;
  const projection=new Float32Array([f/(width/height),0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0]);
  return {eye, view, projection, normal:new Float32Array([x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]])};
}
function grid(segments){
  const points=[],indices=[];
  for(let z=0;z<=segments;z++)for(let x=0;x<=segments;x++)points.push((x/segments-.5)*120,0,(z/segments-.5)*120,0,1,0);
  for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){const a=z*(segments+1)+x,b=a+1,c=a+segments+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const vb=gl.createBuffer(),ib=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(indices),gl.STATIC_DRAW);
  return {vb,ib,count:indices.length};
}
const flat=grid(1),subdivided=grid(128);
const bed=createProgram(VERT_PREFIX+`uniform float bedHeight;void main(){vec3 p=position;p.y=bedHeight;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);}`,
  FRAG_PREFIX+`uniform vec3 color;void main(){gl_FragColor=vec4(linearToSRGB(ACESFilmicToneMapping(color)),1.0);}`);
function draw(program,geometry){
  gl.bindBuffer(gl.ARRAY_BUFFER,geometry.vb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,geometry.ib);
  for(const[name,offset]of[['position',0],['normal',12]]){const loc=gl.getAttribLocation(program.p,name);if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset);}}
  gl.drawElements(gl.TRIANGLES,geometry.count,gl.UNSIGNED_INT,0);
}
let index=1,time=12.5,playing=true,mode=0,wind=1,fog=false,overrides={};
const select=document.getElementById('preset');
entries.forEach((e,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${e.label} — ${e.features.join(' / ')}`;select.append(option);});
select.value=index;
function drawAt(i,t,opts={}) {
  const entry=entries[i];if(!entry)throw new Error('Unknown preset');
  const width=opts.width??canvas.width,height=opts.height??canvas.height;
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const values=Object.fromEntries(Object.entries(entry.shader.uniforms).map(([name,u])=>[name,u.value]));
  Object.assign(values,opts.values||{});
  values.uTime=t;values.uWindSpeed=opts.wind??wind;values.uWindTurbulence=.25;
  const camera=cameraMatrices(width,height,opts.mode??mode);
  gl.viewport(0,0,width,height);const bg=rgb(values.uHorizonColor,false);gl.clearColor(...bg,1);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  gl.useProgram(bed.p);uniform(bed,'viewMatrix',camera.view);uniform(bed,'projectionMatrix',camera.projection);uniform(bed,'bedHeight',-.8);uniform(bed,'color',rgb('#7b817a'));if((opts.mode??mode)!==2)draw(bed,flat);
  const program=programFor(entry,opts.fog??fog);gl.useProgram(program.p);
  uniform(program,'modelMatrix',identity);uniform(program,'viewMatrix',camera.view);uniform(program,'projectionMatrix',camera.projection);uniform(program,'normalMatrix',camera.normal);uniform(program,'cameraPosition',camera.eye);
  uniform(program,'fogColor',rgb('#8da5b5'));uniform(program,'fogNear',20);uniform(program,'fogFar',100);
  for(const[name,value]of Object.entries(values)) uniform(program,name,typeof value==='string'?rgb(value):value);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  draw(program,values.uWaveDisplacement>0?subdivided:flat);gl.depthMask(true);gl.finish();
  const error=gl.getError();if(error!==gl.NO_ERROR){errors.push('GL error '+error);throw new Error('GL error '+error);}
  return {id:entry.id,width,height,programs:programs.size};
}
function info(){const e=entries[index];document.getElementById('title').textContent=e.label;document.getElementById('description').textContent=e.description;document.getElementById('features').textContent=e.features.join(' / ');}
function updateControls(){
  const e=entries[index],controls=document.getElementById('controls');controls.replaceChildren();
  for(const name of ['uWaveHeight','uDetailStrength','uFoamAmount','uRoughness','uOpacity',
    ...e.parameters.filter(p=>p.group==='演出'&&p.kind==='number').map(p=>p.uniform)]) {
    const p=e.parameters.find(p=>p.uniform===name);if(!p)continue;
    const label=document.createElement('label');label.className='control';
    const text=document.createElement('span');text.textContent=p.label;
    const output=document.createElement('output');output.textContent=e.shader.uniforms[name].value;
    const input=document.createElement('input');input.type='range';input.min=p.min;input.max=p.max;input.step=p.step;input.value=e.shader.uniforms[name].value;
    input.oninput=()=>{overrides[name]=Number(input.value);output.textContent=input.value;render();};
    label.title=p.hint;label.append(text,output,input);controls.append(label);
  }
}
function setPreset(i){index=Number(i);select.value=index;overrides={};document.getElementById('displace').checked=false;document.getElementById('quality').value=entries[index].shader.uniforms.uDetailQuality.value;info();updateControls();render();}
function render(){try{drawAt(index,time,{values:overrides});errorBox.textContent='';}catch(e){errorBox.textContent=e.message;playing=false;}}
function resize(){const rect=canvas.getBoundingClientRect();canvas.width=Math.round(Math.min(1440,rect.width));canvas.height=Math.round(Math.min(1000,rect.height));render();}
select.onchange=()=>setPreset(select.value);
document.getElementById('play').onclick=()=>{playing=!playing;document.getElementById('play').textContent=playing?'一時停止':'再生';};
document.getElementById('camera').onchange=e=>{mode=Number(e.target.value);render();};
document.getElementById('quality').onchange=e=>{overrides.uDetailQuality=Number(e.target.value);render();};
document.getElementById('displace').onchange=e=>{overrides.uWaveDisplacement=e.target.checked?1:0;render();};
document.getElementById('wind').onchange=e=>{wind=e.target.checked?1:0;render();};
document.getElementById('fog').onchange=e=>{fog=e.target.checked;render();};
document.getElementById('reset').onclick=()=>setPreset(index);
let last=0;
function loop(t){if(playing&&!document.hidden){time+=Math.min((t-last)/1000||0,.1);render();}last=t;requestAnimationFrame(loop);}
window.addEventListener('resize',resize);info();updateControls();resize();requestAnimationFrame(loop);
window.__waterLab={entries,errors,drawAt,programs,pause(){playing=false;},setPreset,
  pixels(){const a=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);return Array.from(a);},
  png(){return canvas.toDataURL('image/png');},
  get renderer(){return gl.getParameter(gl.RENDERER);},
};
