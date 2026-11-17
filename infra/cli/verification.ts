import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../process";

/** Even command help initializes paths; probes must never inherit personal installation locations. */
export async function verifyCli(staging: string, version: string): Promise<void> {
    const temporary = await mkdtemp(join(tmpdir(), "ulvia-cli-build-verification-"));
    try {
        const env = { ULVIA_DATA_DIR: join(temporary, "data"), ULVIA_CONFIG_DIR: join(temporary, "config") };
        const run = (args: string[]) =>
            command(["bun", "dist/index.js", ...args], { cwd: staging, capture: true, env });
        await run(["--help"]);
        const reported = (await run(["--version"])).trim();
        if (reported !== version) {
            throw new Error(`Built CLI reports ${reported} instead of ${version}`);
        }
        if (!(await run(["apply", "--help"])).includes(`Bundled stack release: ${version}`)) {
            throw new Error(`Built CLI does not report its ${version} initial stack version`);
        }
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}
