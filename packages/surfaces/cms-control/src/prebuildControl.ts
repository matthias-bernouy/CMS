import { rmSync } from "node:fs";

const controlRuntimeTargetDir = "src/browser/";
const controlRuntimeTargetName = "control-runtime.js";
const controlRuntimeTargetFile = controlRuntimeTargetDir + controlRuntimeTargetName;
const controlRuntimeOrigin = "src/browser/runtime.ts";

export default async function prebuildControl() {
    if (await Bun.file(controlRuntimeTargetFile).exists()) {
        rmSync(controlRuntimeTargetFile);
    }

    const result = await Bun.build({
        "entrypoints": [controlRuntimeOrigin],
        "outdir": controlRuntimeTargetDir,
        "naming": controlRuntimeTargetName,
        "format": "iife",
        "target": "browser",
    });

    if (!result.success) {
        for (const log of result.logs) {
            console.error(log);
        }
        throw new Error("prebuildControl: Bun.build failed");
    }
}

if (import.meta.main) {
    await prebuildControl();
}
