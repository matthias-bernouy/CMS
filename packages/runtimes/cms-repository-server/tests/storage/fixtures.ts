import { chmod, lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class TemporaryRoots {
    readonly #roots: string[] = [];

    async create(): Promise<string> {
        const root = await mkdtemp(join(tmpdir(), "cms-repository-server-"));
        this.#roots.push(root);
        return root;
    }

    async cleanup(): Promise<void> {
        await Promise.all(
            this.#roots.splice(0).map(async (root) => {
                await makeWritable(root);
                await rm(root, { recursive: true, force: true });
            }),
        );
    }
}

async function makeWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (!metadata.isDirectory()) {
        return;
    }
    await chmod(path, 0o750);
    for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            await makeWritable(join(path, entry.name));
        }
    }
}
