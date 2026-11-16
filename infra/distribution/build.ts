import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { command } from "../process";
import { inspectImages } from "./images";
import { distributionRoot } from "./options";
import { writeManifest } from "./manifest";

/** Consume already prepared workspace outputs; all publication inputs live under this version. */
export async function buildDistribution(root: string, version: string): Promise<void> {
    const destination = distributionRoot(root, version);
    await rm(destination, { recursive: true, force: true });
    await mkdir(join(destination, "cli"), { recursive: true });
    await cp(join(root, "packages/runtimes/ulvia-cli/dist/bootstrap/repository"), join(destination, "repository"), {
        recursive: true,
    });
    const revision = (await command(["git", "rev-parse", "HEAD"], { capture: true, cwd: root })).trim();
    await command(["bun", "run", "infra/images/build.ts", "build", "--version", version], { cwd: root });
    await command(["bun", "run", "infra/cli/build.ts", "build", "--version", version, "--stack-version", version], {
        cwd: root,
    });
    for (const extension of ["tgz", "json"]) {
        const name = `cyaxis-ulvia-${version}.${extension}`;
        await cp(join(root, "artifacts/cli", name), join(destination, "cli", name));
    }
    await writeManifest(destination, version, revision, await inspectImages(version, revision));
}
