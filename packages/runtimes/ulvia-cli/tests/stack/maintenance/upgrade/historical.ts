import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { runCommand } from "../../../../src/runtime/process";
export const historicalCommit = "bde42cc0f20953190832f9b8258edf86c07154cd";
export const historicalVersion = "0.1.0-upgrade-source";
export const workspace = resolve(import.meta.dir, "../../../../../../..");
export const historicalSource = join(workspace, "artifacts/upgrade-historical", historicalCommit);
export async function prepareHistoricalSource() {
    if (!(await Bun.file(join(historicalSource, "package.json")).exists())) {
        await mkdir(historicalSource, { recursive: true });
        const archive = `${historicalSource}.tar`;
        await runCommand(["git", "archive", historicalCommit, "--output", archive], { cwd: workspace });
        await runCommand(["tar", "-xf", archive, "-C", historicalSource]);
    }
    await runCommand([process.execPath, "install", "--frozen-lockfile"], { cwd: historicalSource });
    await runCommand([process.execPath, "run", "infra/bootstrap.ts"], { cwd: historicalSource });
}
if (import.meta.main) {
    await prepareHistoricalSource();
    for (const component of ["provider", "edge"]) {
        const image = `docker.io/cyaxis/ulvia-${component}:${historicalVersion}`;
        const found = await runCommand(["docker", "image", "inspect", image], { allowFailure: true });
        const labels = found.exitCode === 0 ? JSON.parse(found.stdout)[0]?.Config?.Labels : undefined;
        if (
            labels?.["org.opencontainers.image.revision"] !== historicalCommit ||
            labels?.["org.opencontainers.image.version"] !== historicalVersion
        ) {
            await runCommand(
                [
                    "docker",
                    "build",
                    "--build-arg",
                    `IMAGE_VERSION=${historicalVersion}`,
                    "--build-arg",
                    `VCS_REF=${historicalCommit}`,
                    "--file",
                    join(historicalSource, "infra/images", component, "Dockerfile"),
                    "--tag",
                    image,
                    historicalSource,
                ],
                { inherit: true },
            );
        }
    }
}
