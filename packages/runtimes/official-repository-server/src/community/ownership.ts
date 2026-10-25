import { mkdir, lstat } from "node:fs/promises";
import { join } from "node:path";

/** The kernel releases flock after a crash, independently of timestamps and reused container PIDs. */
export async function acquireRepositoryOwnership(root: string) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const metadata = await lstat(root);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("Repository storage must be a real directory");
    }
    const child = Bun.spawn(
        [
            "flock",
            "-n",
            join(root, ".server-lock"),
            process.execPath,
            "-e",
            'process.stdout.write("locked\\n"); await Bun.stdin.text();',
        ],
        { stdin: "pipe", stdout: "pipe", stderr: "ignore" },
    );
    const reader = child.stdout.getReader();
    const timeout = setTimeout(() => child.kill(), 5_000);
    try {
        const ready = await reader.read();
        if (ready.done || new TextDecoder().decode(ready.value) !== "locked\n") {
            throw new Error("Repository ownership is already held or flock is unavailable");
        }
    } catch (error) {
        child.stdin.end();
        child.kill();
        await child.exited;
        throw error;
    } finally {
        clearTimeout(timeout);
        reader.releaseLock();
    }
    let released = false;
    return {
        exited: child.exited,
        async release() {
            if (!released) {
                released = true;
                child.stdin.end();
            }
            await child.exited;
        },
    };
}
