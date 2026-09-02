import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { runCommand } from "../runtime/process";

export async function runAuthorTests(sourceRoot: string): Promise<boolean> {
    const tests = join(sourceRoot, "tests");
    const metadata = await lstat(tests).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!metadata) {
        return false;
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error("Integration tests must be a non-symlink directory");
    }
    await runCommand([process.execPath, "test", tests], {
        cwd: sourceRoot,
        inherit: true,
        env: authorTestEnvironment(),
    });
    return true;
}

function authorTestEnvironment(): Record<string, string | undefined> {
    return {
        CI: "true",
        LANG: process.env.LANG,
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
    };
}
