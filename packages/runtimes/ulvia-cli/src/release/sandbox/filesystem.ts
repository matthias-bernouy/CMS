import { chmod, lstat, opendir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

export async function removeReleaseSandbox(root: string): Promise<void> {
    await makeOwnerWritable(root);
    await rm(root, { recursive: true, force: true });
}

async function makeOwnerWritable(path: string): Promise<void> {
    const metadata = await lstat(path).catch(() => null);
    if (!metadata) {
        return;
    }
    if (metadata.isSymbolicLink()) {
        await unlink(path);
        return;
    }
    await chmod(path, metadata.isDirectory() ? 0o700 : 0o600);
    if (!metadata.isDirectory()) {
        return;
    }
    const entries = await opendir(path);
    for await (const entry of entries) {
        await makeOwnerWritable(join(path, entry.name));
    }
}
