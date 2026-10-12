import { rmSync } from "node:fs";

const adminRuntimeTargetDir = "src/browser/";
const adminRuntimeTargetName = "admin-runtime.js";
const adminRuntimeTargetFile = adminRuntimeTargetDir + adminRuntimeTargetName;
const adminRuntimeOrigin = "src/browser/runtime.ts";

export default async function prebuildAdmin() {
    if (await Bun.file(adminRuntimeTargetFile).exists()) {
        rmSync(adminRuntimeTargetFile);
    }

    const result = await Bun.build({
        "entrypoints": [adminRuntimeOrigin],
        "outdir": adminRuntimeTargetDir,
        "naming": adminRuntimeTargetName,
        "format": "iife",
        "target": "browser",
    });

    if (!result.success) {
        for (const log of result.logs) {
            console.error(log);
        }
        throw new Error("prebuildAdmin: Bun.build failed");
    }
}

if (import.meta.main) {
    await prebuildAdmin();
}
