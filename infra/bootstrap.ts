import { chmod, cp, readdir, rm } from "node:fs/promises";
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
