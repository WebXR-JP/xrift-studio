import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ShaderEditorDialog } from "../src/components/visual-editor/ShaderEditorDialog";
import { ScriptEditorDialog } from "../src/components/visual-editor/ScriptEditorDialog";
import { createScriptAsset } from "../src/lib/visual-editor";
import "../src/index.css";

function Harness() {
  const [source, setSource] = useState("// initial");
  const [started, setStarted] = useState(0);
  const [saved, setSaved] = useState("");
  const [closed, setClosed] = useState(false);
  const [fail, setFail] = useState(false);
  const save = async (value: string) => {
    setStarted(n => n + 1);
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (fail) throw new Error("test save failure");
    setSaved(value); setSource(value);
  };
  return <><aside style={{ position: "fixed", bottom: 0, zIndex: 999 }}>
    <output data-testid="started">{started}</output>
    <output data-testid="saved">{saved}</output>
    <output data-testid="closed">{String(closed)}</output>
    <button onClick={() => setFail(v => !v)}>toggle failure</button>
  </aside>{!closed && (location.search.includes("script") ?
    <ScriptEditorDialog asset={createScriptAsset("test", "Test", "scripts/test.ts", null, "ts")}
      source={source} loading={false} error={null} playing={false}
      runtime={{ status: "idle", failureRevision: 0, compileErrors: [], failures: [], logs: [], trust: { status: "not-required", pending: [], disabled: [], running: [] } }}
      onSave={save} onClose={() => setClosed(true)} /> :
    <ShaderEditorDialog title="Test" stage="fragment" source={source} loading={false} error={null}
      onSave={save} onClose={() => setClosed(true)} />)}</>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
