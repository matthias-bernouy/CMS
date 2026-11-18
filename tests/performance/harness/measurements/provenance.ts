import { createHash, randomUUID } from "node:crypto";
import { cpus, totalmem } from "node:os";
import { resolve } from "node:path";
import { command } from "../../../../infra/process";
import type { EnvironmentProfile, ImageIdentity } from "../../reporting/types";

export const RESOURCE_LIMITS = {
    provider: { cpus: 2, memoryBytes: 2 * 1024 ** 3 },
    edge: { cpus: 1, memoryBytes: 1024 ** 3 },
    mongo: { cpus: 2, memoryBytes: 1024 ** 3 },
} as const;

export async function sourceProvenance(root = resolve(import.meta.dir, "../../../..")) {
    const revision = (await command(["git", "rev-parse", "HEAD"], { cwd: root, capture: true })).trim();
    const patch = await command(["git", "diff", "HEAD", "--binary"], { cwd: root, capture: true });
    const untracked = (
        await command(["git", "ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, capture: true })
    )
        .split("\0")
        .filter(Boolean)
        .toSorted();
    const hash = createHash("sha256").update(revision).update("\0").update(patch);
    for (const path of untracked) {
        hash.update("\0")
            .update(path)
            .update("\0")
            .update(new Uint8Array(await Bun.file(resolve(root, path)).arrayBuffer()));
    }
    return { revision, sourceDigest: hash.digest("hex"), dirty: Boolean(patch || untracked.length) };
}

export function environmentProfile(
    instrumentationDigest: string,
    services?: EnvironmentProfile["services"],
    bootstrap?: EnvironmentProfile["bootstrap"],
): EnvironmentProfile {
    const machine = cpus();
    const data = {
        id: "docker-cms-v1",
        architecture: process.arch,
        platform: process.platform,
        cpuModel: machine[0]?.model ?? "unknown",
        cpuCount: machine.length,
        memoryBytes: totalmem(),
        bunVersion: Bun.version,
        mongoVersion: "7.0.37",
        instrumentationDigest,
        limits: RESOURCE_LIMITS,
        ...(services ? { services: structuredClone(services) } : {}),
        ...(bootstrap ? { bootstrap: structuredClone(bootstrap) } : {}),
    };
    return { ...data, fingerprint: createHash("sha256").update(JSON.stringify(data)).digest("hex") };
}

export function runId(revision: string, now = new Date()): string {
    if (!/^[a-f0-9]{40}$/u.test(revision)) {
        throw new Error("A full source revision is required");
    }
    return `${now.toISOString().replace(/[-:]/gu, "").slice(0, 15)}Z-${revision.slice(0, 12)}-${randomUUID().slice(0, 8)}`;
}

export function verifyImage(
    value: unknown,
    component: "provider" | "edge",
    reference: string,
    revision?: string,
): ImageIdentity {
    const rows = value as { Id?: string; Config?: { Labels?: Record<string, string> } }[];
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : undefined;
    const labels = row?.Config?.Labels;
    if (
        !row?.Id ||
        !/^sha256:[a-f0-9]{64}$/u.test(row.Id) ||
        labels?.["io.ulvia.component"] !== component ||
        labels["io.ulvia.stack-api"] !== "1" ||
        labels["io.ulvia.hosting-api"] !== "1" ||
        !/^[a-f0-9]{40}$/u.test(labels["org.opencontainers.image.revision"] ?? "") ||
        (revision && labels["org.opencontainers.image.revision"] !== revision)
    ) {
        throw new Error(`Performance ${component} image does not match the required build`);
    }
    return { component, reference, id: row.Id, revision: labels!["org.opencontainers.image.revision"]! };
}
