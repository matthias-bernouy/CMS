import { expect } from "bun:test";
import { runCommand } from "../../../../../src/runtime/process";
import { until, journal } from "../database";
import type { UpgradeFixture } from "../fixture";
import type { HistoricalData } from "../seed";
export async function crashProvider(f: UpgradeFixture, data: HistoricalData) {
    const cli = await f.start("new", [
        "upgrade",
        "--version",
        f.targetVersion,
        "--backup-directory",
        `${f.root}/provider-checkpoint`,
    ]);
    const provider = await until(async () => {
        if (typeof cli.child.exitCode === "number") {
            throw new Error(`Upgrade ended before Provider startup; see ${f.root}`);
        }
        if ((await journal(f))?.phase !== "deploying") {
            return null;
        }
        return (await f.containers()).find(
            (row: any) =>
                row.State.Running &&
                row.Config.Labels["com.docker.compose.service"] === "provider" &&
                !row.Config.Labels["com.docker.compose.oneoff"]?.toLowerCase().includes("true"),
        );
    });
    const image = JSON.parse(
        (await runCommand([f.environment.ULVIA_UPGRADE_REAL_DOCKER, "image", "inspect", provider.Image])).stdout,
    )[0];
    expect(image.Config.Labels["org.opencontainers.image.version"]).toBe(f.targetVersion);
    await until(async () => {
        try {
            const response = await fetch(`http://127.0.0.1:${f.environment.ULVIA_PROVIDER_PORT}/readyz`, {
                signal: AbortSignal.timeout(1000),
            });
            await response.body?.cancel();
            return response.status === 204 && response.headers.get("ulvia-maintenance") === "paused";
        } catch {
            return false;
        }
    });
    const refused = await fetch(`http://127.0.0.1:${f.environment.ULVIA_PROVIDER_PORT}/forms/v2/get`, {
        method: "QUERY",
        body: "{}",
    });
    expect(refused.status).toBe(503);
    await refused.body?.cancel();
    // A stopped restart policy makes the killed process remain unavailable to Compose's real health check.
    await runCommand([f.environment.ULVIA_UPGRADE_REAL_DOCKER, "update", "--restart=no", provider.Id]);
    await runCommand([f.environment.ULVIA_UPGRADE_REAL_DOCKER, "kill", "--signal", "KILL", provider.Id]);
    expect(await cli.result).not.toBe(0);
    expect(await journal(f)).toBeNull();
    await data.legacy();
}
