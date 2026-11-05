import { expect } from "bun:test";
import { docker, waitForHttp } from "./docker";

/** Replace the image while keeping the actual database, file volume, secrets and instance identity. */
export async function upgradeProvider(
    name: string,
    image: string,
    version: string,
    operatorToken: string,
    instanceId: string,
    cleanupNames: string[],
    controlUrl: string,
) {
    const inspected = JSON.parse((await docker(["inspect", name])).stdout)[0];
    const environment = inspected.Config.Env.flatMap((value: string) => ["--env", value]);
    const network = Object.keys(inspected.NetworkSettings.Networks)[0]!;
    await docker([
        "run",
        "--rm",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,noexec,size=256m",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
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
        "--read-only",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,noexec,size=256m",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--network",
        network,
        "--network-alias",
        "ulvia-provider",
        "--volumes-from",
        previous,
        ...environment,
        image,
    ]);
    const url = controlUrl;
    const headers = { Authorization: `Bearer ${operatorToken}`, "Content-Type": "application/json" };
    await waitForHttp(`${url}/ulvia/operator/instances`, headers);
    const response = await fetch(`${url}/ulvia/operator/instances/${encodeURIComponent(instanceId)}/profile`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id: "ulvia", version }),
        signal: AbortSignal.timeout(120_000),
    });
    const result = await response.json();
    expect(result, "real Provider profile transition").toMatchObject({
        status: "ready",
        profile: { id: "ulvia", version },
    });
    expect(response.status).toBe(200);
}
