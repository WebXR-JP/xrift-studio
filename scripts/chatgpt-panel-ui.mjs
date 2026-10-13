import assert from "node:assert/strict";
import { mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const folder = resolve(`dev/chatgpt-ui-check-${process.pid}`);
await mkdir(folder, { recursive: true });
const root = folder.split(/[\\/]/).at(-1);
await writeFile(`${folder}/index.html`, '<html lang="ja"><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
await writeFile(`${folder}/main.tsx`, `import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import '@fontsource/noto-sans-jp/400.css';
import {ChatgptWorldPanel} from '../../src/components/visual-editor/ChatgptWorldPanel';
import {tauri} from '../../src/lib/tauri';
import type {ChatgptGeneration} from '../../src/lib/visual-editor/chatgpt-generation';
let signedIn=false;
const account=()=>document.body.dataset.accountId??'fixture-account-a';
const state=()=>({signedIn,email:signedIn?'fixture@example.invalid':null,accountId:signedIn?account():null,planUsageEnabled:signedIn,connecting:false,error:null});
tauri.chatgptStatus=async()=>{document.body.dataset.statusCalls=String(Number(document.body.dataset.statusCalls??0)+1);await new Promise(r=>setTimeout(r,5));return state();};
tauri.chatgptLogin=async()=>{signedIn=true;return state();};
tauri.chatgptLogout=async()=>{signedIn=false;return state();};
tauri.chatgptModels=async()=>{const requested=account();if(document.body.dataset.modelGate===requested){document.body.dataset.modelWaiting=requested;while(document.body.dataset.modelGate===requested)await new Promise(r=>setTimeout(r,25));document.body.dataset.modelReturned=requested;}return [{slug:requested==='fixture-account-a'?'fixture-model':'fixture-model-'+requested.slice(-1),displayName:'検証用モデル',supportedReasoningEfforts:['low','medium','high'],defaultReasoningEffort:'medium'}];};
function Harness(){
const [generation,setGeneration]=useState<ChatgptGeneration|null>(null);
const release=useRef<(()=>void)|null>(null);
const make=(model,prompt,options,status):ChatgptGeneration=>({generationId:'fixture-generation',status,model,prompt,options,sourceProjectId:'fixture-world',projectId:'fixture-world',plan:{title:'検証用Plan',description:'床をひとつ追加します',objects:[{name:'床',shape:'plane'}]},progress:{phase:status==='planned'?'planned':'placing',message:status==='planned'?'Planを確認してください':'依頼を反映中です',completed:0,total:1,recentEvents:[]}});
return <ChatgptWorldPanel generation={generation} onGenerate={async(model,prompt,options,mode,reasoningEffort)=>{
await new Promise(r=>setTimeout(r,200));if(prompt==='error')throw new Error('検証用エラー');
document.body.dataset.result=model+':'+prompt;document.body.dataset.options=JSON.stringify(options);document.body.dataset.reasoningEffort=reasoningEffort??'';
const job=make(model,prompt,options,mode==='plan'?'planned':'running');setGeneration(job);
if(prompt==='stop'){await new Promise<void>(r=>{release.current=r;});return;}
if(mode!=='plan'){await new Promise(r=>setTimeout(r,200));setGeneration({...job,status:'completed',progress:{...job.progress,phase:'completed',message:'床を保存しました',completed:1}});}
}} onApplyPlan={async()=>{setGeneration(current=>({...current!,status:'running',progress:{...current!.progress,message:'Planを反映中です'}}));await new Promise(r=>setTimeout(r,200));setGeneration(current=>({...current!,status:'completed',progress:{...current!.progress,phase:'completed',message:'Planを反映して保存しました',completed:1}}));document.body.dataset.applied='true';}}
onCancel={async()=>{setGeneration(current=>({...current!,status:'cancelled',progress:{...current!.progress,phase:'cancelled',message:'制作を停止しました'}}));release.current?.();document.body.dataset.cancelled='true';}}/>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><div style={{fontFamily:'"Noto Sans JP", sans-serif',margin:'0 auto',display:'flex',height:'calc(100dvh - 1rem)',width:'100%',maxWidth:'20rem',flexDirection:'column',padding:'0.5rem',fontSize:'0.75rem',color:'#475569'}}><Harness/></div></React.StrictMode>);`);
const server = await createServer({ mode: "e2e", cacheDir: "node_modules/.vite-chatgpt-panel-ui", server: { host: "127.0.0.1", port: 0, hmr: false, ws: false, watch: null }, clearScreen: false });
let browser;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({ headless: true, ...(process.env.XRIFT_TEST_CHROME ? { executablePath: process.env.XRIFT_TEST_CHROME } : {}) });
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/dev/${root}/index.html`);
  const generate = page.getByRole("button", { name: "依頼を送信", exact: true });
  await generate.waitFor();
  assert.equal(await generate.isDisabled(), true);
  // StrictMode remounts effects while the first asynchronous status read is
  // pending. That abandoned read must not start a second polling loop.
  await page.waitForFunction(() => document.body.dataset.statusCalls === "2");
  const beforePoll = await page.evaluate(() => Number(document.body.dataset.statusCalls));
  await page.waitForTimeout(4300);
  const polls = await page.evaluate(() => Number(document.body.dataset.statusCalls));
  assert.ok(polls - beforePoll >= 2 && polls - beforePoll <= 3, `one status polling loop: ${polls - beforePoll} reads`);
  await page.getByRole("button", { name: "ChatGPTに接続", exact: true }).click();
  await page.getByRole("combobox", { name: "ワールド制作のモデル" }).selectOption("fixture-model");
  await page.getByRole("combobox", { name: "思考量", exact: true }).selectOption("high");
  await page.getByLabel("ChatGPTアカウント", { exact: true }).click();
  await page.getByText("接続中：fixture@example.invalid", { exact: true }).waitFor();
  await page.getByLabel("ChatGPTアカウント", { exact: true }).click();
  const prompt = page.getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  await prompt.fill("秋の公園");
  await mkdir("dev/chatgpt-ui-artifacts", { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "dev/chatgpt-ui-artifacts/narrow.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.getByRole("checkbox").count(), 0);
  await generate.click();
  assert.equal(await prompt.isDisabled(), true);
  await page.waitForFunction(() => document.body.dataset.result === "fixture-model:秋の公園");
  assert.equal(await page.evaluate(() => document.body.dataset.reasoningEffort), "high");
  assert.deepEqual(JSON.parse(await page.evaluate(() => document.body.dataset.options)), {models:true,materials:true,audio:true});
  await page.getByRole("status").filter({ hasText: "床を保存しました" }).waitFor();
  await prompt.fill("Planを相談");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await generate.click();
  const applyPlan = page.getByRole("button", { name: "Planを反映", exact: true });
  await applyPlan.waitFor();
  await page.screenshot({ path: "dev/chatgpt-ui-artifacts/plan-narrow.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "dev/chatgpt-ui-artifacts/plan-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await applyPlan.click();
  await page.waitForFunction(() => document.body.dataset.applied === "true");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await prompt.fill("stop");
  await generate.click();
  await page.getByRole("button", { name: "制作を停止", exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.cancelled === "true");
  await prompt.fill("error");
  await generate.click();
  await page.getByRole("alert").filter({ hasText: "検証用エラー" }).waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "dev/chatgpt-ui-artifacts/error.png", fullPage: true });
  await prompt.fill("アカウント変更後の依頼");
  await page.evaluate(() => { document.body.dataset.modelGate = "fixture-account-b"; document.body.dataset.accountId = "fixture-account-b"; });
  await page.waitForFunction(() => document.body.dataset.modelWaiting === "fixture-account-b");
  assert.equal(await generate.isDisabled(), true, "old account model cannot be used during discovery");
  assert.equal(await page.getByRole("combobox", { name: "ワールド制作のモデル" }).inputValue(), "");
  // A second account switch must keep polling while the previous catalog is pending.
  await page.evaluate(() => { document.body.dataset.accountId = "fixture-account-c"; });
  await page.waitForFunction(() => document.querySelector('select[aria-label="ワールド制作のモデル"]').value === "fixture-model-c");
  await page.evaluate(() => { delete document.body.dataset.modelGate; });
  await page.waitForFunction(() => document.body.dataset.modelReturned === "fixture-account-b");
  assert.equal(await page.getByRole("combobox", { name: "ワールド制作のモデル" }).inputValue(), "fixture-model-c", "late catalog cannot replace the current account model");
  await generate.click();
  await page.waitForFunction(() => document.body.dataset.result === "fixture-model-c:アカウント変更後の依頼");
  await page.getByRole("status").filter({ hasText: "床を保存しました" }).waitFor();
  await page.getByLabel("ChatGPTアカウント", { exact: true }).click();
  await page.getByRole("button", { name: "接続を解除", exact: true }).click();
  await page.waitForFunction(() => !document.body.textContent.includes("fixture@example.invalid"));
  assert.deepEqual(errors, []);
  console.log("ChatGPT panel UI: connect/account switches, stale model catalog, composer, all assets, Plan/apply, build/cancel, failure, disconnect, narrow layout and one polling loop passed (mocked native IPC).");
} finally {
  await browser?.close();
  await server.close();
  await unlink(`${folder}/index.html`);
  await unlink(`${folder}/main.tsx`);
  await rmdir(folder);
}
