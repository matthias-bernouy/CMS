import { chmod, cp, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

// Production stages core API artifacts only; full snapshots remain available for authoring tests.
const args = Bun.argv.slice(2);
if (args.some((arg) => arg !== "--core-only") || args.length > 1) {
    throw new Error("Usage: generate:official-bootstrap [--core-only]");
}
const coreOnly = args.includes("--core-only");
const child = Bun.spawn(
    [
        process.execPath,
        "run",
        "--cwd",
        "packages/runtimes/ulvia-cli",
        "generate:bootstrap",
        ...(coreOnly ? ["--core-only"] : []),
    ],
    {
        stdout: "inherit",
        stderr: "inherit",
    },
);
if (await child.exited) {
    throw new Error("Official bootstrap compilation failed");
}
const source = resolve(`packages/runtimes/ulvia-cli/dist/${coreOnly ? "bootstrap-core" : "bootstrap"}/repository`);
const destination = resolve("packages/runtimes/ulvia-provider-server/dist/bootstrap");
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
await makePublicSnapshotReadable(destination);

/** Shipped releases are public data; Compose may run under an arbitrary host UID. */
async function makePublicSnapshotReadable(root: string): Promise<void> {
    await chmod(root, 0o755);
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const path = resolve(root, entry.name);
        if (entry.isDirectory()) {
            await makePublicSnapshotReadable(path);
        } else if (entry.isFile()) {
            await chmod(path, 0o644);
        } else {
            throw new Error("The public bootstrap snapshot contains a non-regular entry");
        }
    }
}
