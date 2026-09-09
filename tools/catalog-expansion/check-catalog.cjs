// Focused graph/data tests only. Disk/network imports are deliberately blocked.
// Uses the project's pinned TypeScript test API; does not install dependencies.
let ts;
try { ts=require('typescript-test-api'); }
catch { ts=require('typescript'); }
const Module=require('module'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const originalResolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...args){
 if(id.startsWith('.') && id.endsWith('.js') && parent?.filename){
  const p=path.resolve(path.dirname(parent.filename),id.slice(0,-3)+'.ts');
  if(fs.existsSync(p)) return p;
 }
 return originalResolve.call(this,id,parent,...args);
};
const originalLoad=Module._load;
Module._load=function(id,parent,...args){
 if(id.endsWith('/asset-import-persistence') || id==='./asset-import-persistence') return new Proxy({}, {get:(_,k)=>()=>{throw new Error('Filesystem boundary called during pure catalog test: '+String(k));}});
 return originalLoad.call(this,id,parent,...args);
};
for(const ext of ['.ts','.tsx']) require.extensions[ext]=(m,filename)=>{
 let source=fs.readFileSync(filename,'utf8').replaceAll('import.meta.url',JSON.stringify('file://'+filename)).replaceAll('import.meta.env','({})');
 const result=ts.transpileModule(source,{fileName:filename,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
 if(result.diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(result.diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 const wrapped=require('vm').runInThisContext(Module.wrap(result.outputText.replaceAll("import.meta", "({env:{},url:"+JSON.stringify("file://"+filename)+"})")),{filename});
 wrapped(m.exports,m.require.bind(m),m,filename,path.dirname(filename));
};
const catalog=require(root+'/src/lib/visual-editor/scene-recipe-catalog.ts');
const materials=require(root+'/src/lib/visual-editor/material-showcase-catalog.ts');
for(const shelf of ['materials','gimmicks','models']) console.log(shelf,catalog.getSceneRecipesForProjectKind('world',shelf).length);
console.log('materials',materials.MATERIAL_SHOWCASE_ASSETS.length);
require(root+'/src/lib/visual-editor/scene-recipe-catalog.fixture.ts').runSceneRecipeCatalogFixtureAssertions();
console.log('scene recipe fixtures passed');
require(root+'/src/lib/visual-editor/material-showcase-catalog.fixture.ts').runMaterialShowcaseCatalogFixtureAssertions();
console.log('material fixtures passed');

require(root+'/src/lib/visual-editor/scene-recipe-runtime.fixture.ts').runSceneRecipeRuntimeFixtureAssertions();
console.log("runtime graph fixtures passed (three executions per graph)");

const reportDirectory=path.join(root,'docs/catalog-expansion');
fs.mkdirSync(reportDirectory,{recursive:true});
const recipes=catalog.SCENE_RECIPES;
const validation={
  materialRecipes:catalog.getSceneRecipesForProjectKind('world','materials').length,
  itemMaterialRecipes:catalog.getSceneRecipesForProjectKind('item','materials').length,
  gimmickRecipes:catalog.getSceneRecipesForProjectKind('world','gimmicks').length,
  behaviourGraphs:recipes.reduce((n,r)=>n+(r.behaviours?.length??0),0),
  activationsPerGraph:3,
  fixtureSuites:['scene-recipe-catalog','material-showcase-catalog','scene-recipe-runtime'],
  result:'passed',
  scope:'Actual catalog, graph builder and runtime engine; property-recording host; filesystem boundary blocked.',
  otherChecks:'See README.ja.md for app typecheck, browser E2E and native verification; this script only runs graph/data fixtures.'
};
fs.writeFileSync(path.join(reportDirectory,'catalog-validation.json'),JSON.stringify(validation,null,2)+'\n');
console.log(JSON.stringify(validation,null,2));
