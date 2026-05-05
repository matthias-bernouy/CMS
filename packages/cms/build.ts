import { rmSync } from "node:fs";
import prebuildControl from "src/control/prebuildControl";


// Pre-build: bundle the admin control-components IIFE
await prebuildControl();


// Build to dist/: emit type declarations via tsc
rmSync("dist", { recursive: true, force: true });

const tsc = Bun.spawn(["bun", "x", "tsc", "--emitDeclarationOnly"], {
    stdout: "inherit",
    stderr: "inherit",
});

const exitCode = await tsc.exited;
if ( exitCode !== 0 ) {
    throw new Error(`tsc exited with code ${exitCode}`);
}
