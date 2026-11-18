import { createHash } from "node:crypto";
import { ClientFailure } from "../../../harness/clients/failure";

export const RECOVERY_WORKER_LIMITS = { cpus: 1, memoryBytes: 1024 ** 3 } as const;
type Stack = Readonly<{ id: string; providerName: string }>;

/** Refuse foreign runtimes before copying any environment into an ephemeral private file. */
export function recoveryWorkerConfiguration(stack: Stack, inspected: unknown) {
    const fail = () => {
        throw new ClientFailure("recovery-worker-scope-refused");
    };
    if (!/^ulvia-mcp-[a-f0-9]{8}$/u.test(stack.id) || stack.providerName !== `${stack.id}-provider`) {
        return fail();
    }
    const rows = inspected as {
        Name?: string;
        Image?: string;
        State?: { Running?: boolean; OOMKilled?: boolean };
        HostConfig?: { NetworkMode?: string };
        Config?: { Labels?: Record<string, string>; Env?: unknown };
        NetworkSettings?: { Networks?: Record<string, unknown> };
    }[];
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : undefined;
    if (
        !row ||
        row.Name !== `/${stack.providerName}` ||
        !/^sha256:[a-f0-9]{64}$/u.test(row.Image ?? "") ||
        row.State?.Running !== true ||
        row.State.OOMKilled !== false ||
        row.HostConfig?.NetworkMode !== stack.id ||
        !row.NetworkSettings?.Networks?.[stack.id] ||
        row.Config?.Labels?.["io.ulvia.component"] !== "provider" ||
        !Array.isArray(row.Config.Env) ||
        row.Config.Env.length > 256
    ) {
        return fail();
    }
    const values = row.Config.Env as unknown[];
    if (
        values.some(
            (value) => typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*=/u.test(value) || /[\r\n\0]/u.test(value),
        )
    ) {
        return fail();
    }
    const env = `${values.join("\n")}\n`;
    if (
        new Set((values as string[]).map((value) => value.slice(0, value.indexOf("=")))).size !== values.length ||
        Buffer.byteLength(env) > 64 * 1024 ||
        !values.includes("MONGO_URL=mongodb://mongo:27017/mcp_provider_control?retryWrites=false") ||
        !values.includes("CMS_FILES_DIR=/var/lib/cms/files")
    ) {
        return fail();
    }
    return { image: row.Image!, env };
}

export async function recoveryWorkerProfile() {
    const hash = createHash("sha256").update(JSON.stringify(RECOVERY_WORKER_LIMITS));
    for (const path of [
        "workerConfiguration.ts",
        "worker.ts",
        "boundary.ts",
        "../collection-upgrades/recovery/seed.ts",
    ]) {
        hash.update(path).update(new Uint8Array(await Bun.file(new URL(path, import.meta.url)).arrayBuffer()));
    }
    return { ...RECOVERY_WORKER_LIMITS, programDigest: hash.digest("hex") };
}
