import { randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";
import { docker, waitForHttp } from "../../../../integration/instance/docker";
import { dnsControl } from "./client";
import type { ContainerCluster } from "../../../../integration/instance/containers/cluster";

export async function buildDnsProgram() {
    const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "server.ts")], target: "bun" });
    if (!built.success || built.outputs.length !== 1) {
        throw new Error("Cannot compile controlled DNS service");
    }
    const program = await built.outputs[0]!.text();
    return {
        program,
        profile: {
            programDigest: createHash("sha256").update(program).digest("hex"),
            cpus: 0.25,
            memoryBytes: 64 * 1024 ** 2,
        },
    };
}

export async function startDnsService(
    cluster: ContainerCluster,
    image: string,
    built: Awaited<ReturnType<typeof buildDnsProgram>>,
) {
    const key = randomBytes(32).toString("base64url");
    const name = `${cluster.id}-dns`;
    await cluster.run(
        name,
        "performance-dns",
        image,
        [
            "--publish",
            "127.0.0.1::8053",
            "--entrypoint",
            "bun",
            "--cpus",
            "0.25",
            "--memory",
            String(64 * 1024 ** 2),
            "--memory-swap",
            String(64 * 1024 ** 2),
            "--env",
            `ULVIA_TEST_DNS_KEY=${key}`,
        ],
        ["-e", built.program],
        false,
    );
    const origin = await cluster.endpoint(name, 8053);
    await waitForHttp(`${origin}/readyz`);
    const inspected = JSON.parse((await docker(["inspect", name])).stdout);
    const address = inspected[0]?.NetworkSettings?.Networks?.[cluster.id]?.IPAddress;
    if (typeof address !== "string" || !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address)) {
        throw new Error("Controlled DNS service has no isolated address");
    }
    return {
        control: dnsControl(origin, key),
        providerOptions: ["--dns", address],
    };
}
