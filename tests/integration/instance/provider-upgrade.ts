import { expect } from "bun:test";
import { docker, mappedPort, waitForHttp } from "./docker";

/** Replace the image while keeping the actual database, file volume, secrets and instance identity. */
export async function upgradeProvider(
    name: string,
    image: string,
    version: string,
    operatorToken: string,
    instanceId: string,
    cleanupNames: string[],
) {
    const inspected = JSON.parse((await docker(["inspect", name])).stdout)[0];
    const environment = inspected.Config.Env.flatMap((value: string) => ["--env", value]);
    const network = Object.keys(inspected.NetworkSettings.Networks)[0]!;
    await docker([
        "run",
        "--rm",
        "--network",
        network,
        "--volumes-from",
        name,
        ...environment,
        image,
        "bun",
        "--no-macros",
        "run",
        "packages/runtimes/ulvia-provider-server/src/checkRetention.ts",
    ]);
    await docker(["stop", name]);
    const previous = `${name}-previous`;
    await docker(["rename", name, previous]);
    cleanupNames.push(previous);
    await docker([
        "run",
        "--detach",
        "--init",
        "--name",
        name,
        "--network",
        network,
        "--network-alias",
        "ulvia-provider",
        "--publish",
        "127.0.0.1::5103",
        "--volumes-from",
        previous,
        ...environment,
        image,
    ]);
    const url = await mappedPort(name, 5103);
    const headers = { Authorization: `Bearer ${operatorToken}`, "Content-Type": "application/json" };
    await waitForHttp(`${url}/ulvia/operator/instances`, headers);
    const response = await fetch(`${url}/ulvia/operator/instances/${encodeURIComponent(instanceId)}/profile`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id: "ulvia.official", version }),
        signal: AbortSignal.timeout(120_000),
    });
    const result = await response.json();
    expect(result, "real Provider profile transition").toMatchObject({
        status: "ready",
        profile: { id: "ulvia.official", version },
    });
    expect(response.status).toBe(200);
}
