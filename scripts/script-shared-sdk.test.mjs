import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Run against a prepared official world template, whose publication toolchain
// includes Vite and @originjs/vite-plugin-federation. No app data is modified.
// XRIFT_WORLD_TEMPLATE_DIR=/path/to/template node --test scripts/script-shared-sdk.test.mjs
const template=process.env.XRIFT_WORLD_TEMPLATE_DIR;
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('published Script retains the host storage, screen sharing and Vehicle contexts', {skip:!template}, async()=>{
 const require=createRequire(path.join(path.resolve(template),'package.json'));
 const localRequire=createRequire(path.join(repo,'package.json'));
 const {build}=await import(pathToFileURL(require.resolve('vite')).href);
 const federation=(await import(pathToFileURL(require.resolve('@originjs/vite-plugin-federation')).href)).default;
 const cache=path.join(repo,'node_modules','.cache');await fs.mkdir(cache,{recursive:true});
 const root=await fs.mkdtemp(path.join(cache,'script-shared-sdk-'));
 const previousCwd=process.cwd();
 try{
  await fs.writeFile(path.join(root,'package.json'),'{"type":"module"}');
  const source=path.join(repo,'packages','xrift-studio-runtime','src','script');
  for(const file of ['world-components.ts','seat.tsx','interactable.tsx','interaction-layer.ts'])await fs.copyFile(path.join(source,file),path.join(root,file));
  await fs.writeFile(path.join(root,'entry.ts'),"export {useWorldStorage,Vehicle,ScreenShareDisplay,useScreenShareContext} from './world-components';");
  await fs.writeFile(path.join(root,'main.ts'),'export {};');process.chdir(root);
  await build({root,configFile:false,publicDir:false,logLevel:'silent',plugins:[federation({name:'script_sdk_probe',filename:'remoteEntry.js',exposes:{'./probe':path.join(root,'entry.ts')},shared:{react:{requiredVersion:'*'},'react/jsx-runtime':{},three:{requiredVersion:'*'},'@react-three/fiber':{requiredVersion:'*'},'@xrift/world-components':{requiredVersion:'*'}}})],build:{target:'esnext',minify:false,assetsDir:'',modulePreload:false,rollupOptions:{input:path.join(root,'main.ts')}},resolve:{alias:{'@originjs/vite-plugin-federation':require.resolve('@originjs/vite-plugin-federation')},dedupe:['react','three','@xrift/world-components']}});
  const playerStorage={owner:'host-authenticated-player'};
  const hostStorageHook=()=>playerStorage,hostVehicle=()=>null;
  const sharing={isRoomConnected:true,videoElement:null};
  const hostScreen=()=>null,hostScreenHook=()=>sharing;
  const versions={react:['19.2.8',localRequire('react')],'react/jsx-runtime':['19.2.8',localRequire('react/jsx-runtime')],three:['0.185.1',localRequire('three')],'@xrift/world-components':['0.57.1',{useWorldStorage:hostStorageHook,Vehicle:hostVehicle,ScreenShareDisplay:hostScreen,useScreenShareContext:hostScreenHook}]};
  const scope=Object.fromEntries(Object.entries(versions).map(([name,[version,module]])=>[name,{[version]:{get:()=>()=>module,loaded:true}}]));
  const remote=await import(pathToFileURL(path.join(root,'dist','remoteEntry.js')).href);remote.init(scope);
  const probe=(await remote.get('./probe'))();
  assert.equal(probe.useWorldStorage,hostStorageHook,'export-star must not create a second WorldStorageContext in the remote');
  assert.equal(probe.useWorldStorage(),playerStorage);
  assert.equal(probe.ScreenShareDisplay,hostScreen,'screen display must consume the player host media provider');
  assert.equal(probe.useScreenShareContext,hostScreenHook);
  assert.equal(probe.useScreenShareContext(),sharing);
  assert.equal(probe.Vehicle,hostVehicle,'Seat and Vehicle must keep their shared private SDK context');
 }finally{
  process.chdir(previousCwd);
  const relative=path.relative(cache,root);
  assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  await fs.rm(root,{recursive:true,force:true});
 }
});
