import { rmSync } from "node:fs"

const controlComponentTargetDir = "src/control/static/assets/";
const controlComponentTargetNaming = "control-components.js";
const controlComponentTargetFile = controlComponentTargetDir+controlComponentTargetNaming;
const controlComponentOrigin = "src/control/components/index.ts";

export default async function prebuildControl(){


    if ( await Bun.file(controlComponentTargetFile).exists() ) {
        rmSync(controlComponentTargetFile)
    }

    const result = await Bun.build({
        "entrypoints": [ controlComponentOrigin ],
        "outdir": controlComponentTargetDir,
        "naming": controlComponentTargetNaming,
        "format": "iife",
        "target": "browser"
    })

    if ( !result.success ) {
        for ( const log of result.logs ) console.error(log);
        throw new Error("prebuildControl: Bun.build failed");
    }

}