import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

export function runIsolatedTestFixture(fixtureUrl: URL): void {
    const result = Bun.spawnSync({
        cmd: [process.execPath, "test", fileURLToPath(fixtureUrl), "--only-failures"],
        cwd: workspaceRoot,
        stdout: "pipe",
        stderr: "pipe",
    });
    if (result.exitCode === 0) {
        return;
    }
    const decoder = new TextDecoder();
    throw new Error(`${decoder.decode(result.stdout)}${decoder.decode(result.stderr)}`);
}
