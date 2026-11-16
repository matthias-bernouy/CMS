import { join } from "node:path";
import { withRepositoryWriteLock } from "@bernouy/repository/repository/filesystem/lock";
import { command } from "./infra/process";
import { buildDistribution } from "./infra/distribution/build";
import { distributionVersion } from "./infra/distribution/options";

const version = distributionVersion(Bun.argv.slice(2), false);
const root = process.cwd();

async function build(): Promise<void> {
    await command(["bun", "run", "infra/bootstrap.ts"]);
    await command(["bun", "x", "tsc", "--build"]);
    await command(["bun", "run", "--cwd", "packages/features/content", "build:browser"]);
    if (version) {
        await buildDistribution(root, version);
        console.log(`Ulvia ${version} build done (contracts, Provider manifest, Edge, Provider, CLI)`);
    } else {
        console.log("workspace build done");
    }
}

await withRepositoryWriteLock(join(root, "artifacts/distributions"), build);
