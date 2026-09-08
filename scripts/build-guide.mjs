import { buildGuide } from "./guide/build.mjs";
buildGuide().catch((error) => { console.error(error); process.exitCode = 1; });
