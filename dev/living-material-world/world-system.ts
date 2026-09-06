import { defineScript, prop } from 'xrift:script';
import { Mesh, MeshPhysicalMaterial, ShaderMaterial, TubeGeometry, CatmullRomCurve3, Vector3, SphereGeometry, BackSide, DoubleSide, Color } from 'three';

const TARGETS = [{"name":"terrain-main","id":"entity-72e89b57-69ae-4905-a1fb-c1999657f623"},{"name":"terrain-ridges","id":"entity-2eefc48d-647c-4a75-a253-5c2932a6c3fc"},{"name":"node-core","id":"entity-3ab04314-90a2-426c-8876-516ce96b14c7"},{"name":"monolith","id":"entity-977f76d0-8bdd-429e-b2af-77a0415e4a7a"},{"name":"distant-ring","id":"entity-5025e191-fbfa-4182-bade-11d14a9b4ada"},{"name":"distant-architecture","id":"entity-dc3566a2-8890-4c28-aa81-43a5932d0def"},{"name":"terrain-distant","id":"entity-ce929637-5691-4878-8869-fe0d396b9921"},{"name":"membrane","id":"entity-e7087797-a98e-4491-bc68-a913d3255041"},{"name":"anisotropic-disc","id":"entity-67a4f027-e0aa-4eb0-931b-ded5034a5d5e"},{"name":"volume-crystal","id":"entity-341dee33-4730-4a5d-8e2f-89e4ea9b3525"},{"name":"node-parts","id":"entity-40a75833-b032-4ee6-a3e0-d863d2a91787"},{"name":"grass-cluster","id":"entity-b63ab8a4-af25-4a77-974c-f399eacdc392"},{"name":"abstract-vegetation","id":"entity-8bf4b634-b948-4ec6-a164-61895269fab5"},{"name":"grass-cluster","id":"entity-a52639e0-2af0-4745-8212-93287fe13f83"},{"name":"grass-cluster","id":"entity-42d22895-8ec1-4733-9418-7f48bf9174ad"},{"name":"grass-cluster","id":"entity-d3d2b22d-cb91-4f33-ab28-9ad33ea56748"},{"name":"grass-cluster","id":"entity-7ac557ab-4d93-4fcd-bcbb-23d5647ae77c"},{"name":"grass-cluster","id":"entity-c5ff5e53-c9a0-44e9-87fb-c3fa97e72394"},{"name":"grass-cluster","id":"entity-d8eb6a7f-dfd5-4605-8fd9-79dbfe689333"},{"name":"grass-cluster","id":"entity-4fe0f577-8820-44ad-a78a-cee91db7890d"},{"name":"grass-cluster","id":"entity-a2ba5c58-0ff8-46c6-b6be-f36af27e3e3d"},{"name":"node-parts","id":"entity-f35ad42e-a055-4270-b672-2ae033029026"},{"name":"node-parts","id":"entity-143c7efb-9a9d-4409-b04f-79b6aca0ae49"},{"name":"node-parts","id":"entity-eb09c558-e1ce-4f07-84f5-54481a965db9"},{"name":"node-parts","id":"entity-d8f70d1d-4681-472c-a0ce-5f09a3163f1e"},{"name":"membrane","id":"entity-59faeaac-bb8b-4238-a8bf-e1b7bb494c1d"},{"name":"abstract-vegetation","id":"entity-d63e873f-80f0-4def-96ce-18cfe1a84994"}];
const sharedGLSL = `
uniform float uTime;
uniform float uWind;
uniform vec2 uDirection;
uniform float uPulse;
uniform float uEnergy;
uniform float uPhase;
varying vec3 vLivingWorld;
float pulseAt(vec3 p) {
  float d=length(p.xz-vec2(-5.0,-7.0));
  return exp(-pow((d-uPulse*9.0)/1.7,2.0))*step(0.0,uPulse);
}
`;

export default defineScript({
  name: 'Living Material World',
  props: {
    windStrength: prop.number({ default: 0.3, min: 0, max: 1.5 }),
    windDirection: prop.number({ default: 35, min: 0, max: 360 }),
    windFrequency: prop.number({ default: 0.8, min: 0.1, max: 3 }),
    worldPulse: prop.number({ default: 0, min: 0, max: 100000 }),
    worldEnergy: prop.number({ default: 0.65, min: 0, max: 2 }),
    environmentPhase: prop.number({ default: 0, min: 0, max: 1 }),
    iridescence: prop.number({ default: 0.8, min: 0, max: 1 }),
    clearcoat: prop.number({ default: 0.7, min: 0, max: 1 }),
    nodeSpeed: prop.number({ default: 0.16, min: 0.01, max: 1 }),
    bgmVolume: prop.number({ default: 0.12, min: 0, max: 1 }),
  },
  start(ctx) {
    const uniforms = {
      uTime: { value: 0 }, uWind: { value: .3 },
      uDirection: { value: [Math.cos(.6),Math.sin(.6)] },
      uPulse: { value: 0 }, uEnergy: { value: .65 }, uPhase: { value: 0 },
    };
    const replacements: any[] = [];
    const rotating: any[] = [];
    const created: any[] = [];
    let elapsed = 0, pulseStart = 0, lastPulse = ctx.props.worldPulse;
    const seen = new WeakSet();
    const scan = () => { for (const target of TARGETS) {
      const root = ctx.find(target.id);
      if (!root) continue;
      root.traverse((object: any) => {
        if (!object.isMesh || !object.geometry || seen.has(object)) return;
        seen.add(object);
        const original = object.material;
        const old = Array.isArray(original) ? original[0] : original;
        const role = target.name;
        const membrane = role === 'membrane';
        const grass = role === 'grass-cluster' || role === 'abstract-vegetation';
        const ground = role.startsWith('terrain');
        const hero = role === 'node-core';
        const distant = role.startsWith('distant');
        object.geometry.computeBoundingBox();
        const bottom = object.geometry.boundingBox.min.y;
        const height = Math.max(.01, object.geometry.boundingBox.max.y-bottom);
        const mat = new MeshPhysicalMaterial({
          color: old.color?.clone() ?? new Color('#92c7bc'),
          metalness: grass ? .15 : ground ? .32 : .65,
          roughness: grass ? .56 : ground ? .52 : .22,
          clearcoat: ground ? .22 : .7,
          iridescence: membrane || hero || role==='monolith' ? .8 : distant ? .35 : 0,
          iridescenceIOR: 1.35,
          iridescenceThicknessRange: [120,480],
          transmission: membrane ? .45 : role==='volume-crystal' ? .65 : 0,
          thickness: membrane ? .08 : .7,
          ior: 1.35,
          emissive: old.emissive?.clone() ?? new Color('#000000'),
          emissiveIntensity: Math.min(old.emissiveIntensity ?? 0,.45),
          side: grass || membrane ? DoubleSide : old.side,
        });
        if (ground) mat.color.multiplyScalar(0.5);
        mat.onBeforeCompile = (shader: any) => {
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = sharedGLSL + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
            #include <begin_vertex>
            vec3 wp=(modelMatrix*vec4(position,1.0)).xyz;
            float wave=sin(dot(wp.xz,uDirection)*.7-uTime*1.2)+.3*sin(uTime*.37+wp.z*.21);
            ${grass ? `float tip=clamp((position.y-(${bottom.toFixed(6)}))/${height.toFixed(6)},0.0,1.0); transformed.xz+=uDirection*wave*uWind*tip*tip*.45;` : ''}
            ${membrane ? 'transformed+=normal*(sin(uTime*.65+position.y*1.3)*.055+wave*uWind*.085+pulseAt(wp)*.1);' : ''}
            vLivingWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
          `);
          shader.fragmentShader=sharedGLSL+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>', `
            #include <emissivemap_fragment>
            float pulse=pulseAt(vLivingWorld);
            vec3 signal=mix(vec3(.08,.65,.48),vec3(.45,.12,.7),.5+.5*sin(uPhase*6.283));
            totalEmissiveRadiance+=signal*pulse*uEnergy*.7;
            ${ground ? `
              float contour=abs(fract(vLivingWorld.y*2.8)-.5);
              float line=1.0-smoothstep(.012,.032,contour);
              float grid=min(abs(fract(vLivingWorld.x*.2)-.5),abs(fract(vLivingWorld.z*.2)-.5));
              totalEmissiveRadiance+=signal*(line*.09+(1.0-smoothstep(.002,.006,grid))*.022);
            ` : ''}
            ${membrane || distant ? 'float fres=pow(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),2.0);totalEmissiveRadiance+=signal*fres*.12;' : ''}
          `);
          shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
            #include <roughnessmap_fragment>
            ${ground || role==='monolith' ? 'roughnessFactor=mix(roughnessFactor,.14,.5+.5*sin(vLivingWorld.x*.21+vLivingWorld.z*.1-uTime*.08));' : ''}
          `);
        };
        mat.customProgramCacheKey=()=>`living-${role}-${bottom}-${height}`;
        object.material=mat;
        replacements.push({ object,original,mat,role });
        if(hero && /ring/.test(object.name)) rotating.push({object,quaternion:object.quaternion.clone()});
      });
    }};
    scan();
    const paths=[
      [[-8,.7,9],[-7,.7,3],[-6,1,-3],[-5,3.8,-7]],
      [[-5,3.8,-7],[0,.18,-9],[4,.7,-10],[12,.7,-9],[12,7,-15]],
      [[12,.7,-9],[16,.2,-5],[15,4,-1],[12,3,7]],
      [[-5,3.8,-7],[-12,9,-35],[-14,25,-96]],
    ];
    paths.forEach((points,index)=>{
      const geometry=new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),80,.022,4,false);
      const material=new ShaderMaterial({uniforms:{...uniforms,uSpeed:{value:ctx.props.nodeSpeed},uOffset:{value:index*.19}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform float uTime;uniform float uSpeed;uniform float uOffset;uniform float uEnergy;varying vec2 vUv;void main(){float head=pow(max(0.0,sin((vUv.x-uTime*uSpeed+uOffset)*18.85)),18.0);gl_FragColor=vec4(vec3(.20,1.4,1.0)*(.45+head*uEnergy*2.0),1.0);}`});
      const mesh=new Mesh(geometry,material);ctx.object3d.add(mesh);created.push(mesh);
    });
    const skyMat=new ShaderMaterial({side:BackSide,depthWrite:false,uniforms,vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform float uTime;uniform float uPhase;varying vec3 vDir;void main(){vec3 d=normalize(vDir);float h=clamp(d.y*.8+.25,0.0,1.0);vec3 low=mix(vec3(.13,.25,.29),vec3(.27,.16,.28),.5+.5*sin(uPhase*6.283));vec3 c=mix(low,vec3(.018,.028,.075),h);float flow=sin(d.x*8.0+d.z*3.0+sin(d.y*14.0)-uTime*.025);c+=vec3(.018,.025,.026)*pow(max(flow,0.0),7.0);gl_FragColor=vec4(c,1.0);}`});
    const sky=new Mesh(new SphereGeometry(450,32,16),skyMat);ctx.object3d.add(sky);created.push(sky);
    ctx.lifecycle.onDispose(()=>{
      replacements.forEach(({object,original,mat})=>{object.material=original;mat.dispose();});
      rotating.forEach(({object,quaternion})=>object.quaternion.copy(quaternion));
      created.forEach(mesh=>{mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();});
    });
    ctx.graph.on('living.pulse',()=>{pulseStart=elapsed;});
    ctx.log('Living world ready: shared wind, pulse, materials and node flow.');
    return { update(delta) {
      const previousScanBucket = Math.floor(elapsed * 2);
      elapsed+=delta;
      if (Math.floor(elapsed * 2) !== previousScanBucket) scan();
      if(ctx.props.worldPulse!==lastPulse){lastPulse=ctx.props.worldPulse;pulseStart=elapsed;}
      if(elapsed-pulseStart>18)pulseStart=elapsed;
      uniforms.uTime.value=elapsed*ctx.props.windFrequency;
      uniforms.uWind.value=ctx.props.windStrength;
      uniforms.uDirection.value=[Math.cos(ctx.props.windDirection*Math.PI/180),Math.sin(ctx.props.windDirection*Math.PI/180)];
      uniforms.uPulse.value=elapsed-pulseStart;
      uniforms.uEnergy.value=ctx.props.worldEnergy;
      uniforms.uPhase.value=ctx.props.environmentPhase+elapsed/480;
      rotating.forEach(({object},i)=>object.rotateY(delta*(i%2 ? -.055 : .04)));
      replacements.forEach(({mat,role})=>{
        if(role==='membrane'||role==='node-core'||role==='monolith')mat.iridescence=ctx.props.iridescence;
        if(!role.startsWith('terrain'))mat.clearcoat=ctx.props.clearcoat;
      });
      created.forEach(mesh=>{if(mesh.material.uniforms.uSpeed)mesh.material.uniforms.uSpeed.value=ctx.props.nodeSpeed;});
      ctx.audioSources.setVolume(ctx.props.bgmVolume);
    }};
  },
});


