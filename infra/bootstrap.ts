import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

// One compiler and one admitted snapshot; stage its filesystem form for the Provider.
const child = Bun.spawn([process.execPath, "run", "--cwd", "packages/runtimes/ulvia-cli", "generate:bootstrap"], {
    stdout: "inherit",
    stderr: "inherit",
});
if (await child.exited) {
    throw new Error("Official bootstrap compilation failed");
}
const source = resolve("packages/runtimes/ulvia-cli/dist/bootstrap/repository");
const destination = resolve("packages/runtimes/ulvia-provider-server/dist/bootstrap");
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
