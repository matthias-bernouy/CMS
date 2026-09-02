import { lstat } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
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
    await runCommand([process.execPath, "--no-env-file", "test", tests], {
        cwd: await testWorkspace(sourceRoot),
        inherit: true,
        env: authorTestEnvironment(),
    });
    return true;
}

async function testWorkspace(sourceRoot: string): Promise<string> {
    let current = sourceRoot;
    const filesystemRoot = parse(current).root;
    while (current !== filesystemRoot) {
        if (await lstat(join(current, "bunfig.toml")).catch(() => null)) {
            return current;
        }
        current = dirname(current);
    }
    return sourceRoot;
}

function authorTestEnvironment(): Record<string, string | undefined> {
    return {
        CI: "true",
        LANG: process.env.LANG,
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
    };
}
