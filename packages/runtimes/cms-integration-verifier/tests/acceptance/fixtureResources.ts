import { chmod, lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createRepositoryManagementGuard, createRepositoryWorkerGuard } from "@bernouy/cms-repository-management";
import { buildOfficialIntegrationCandidates } from "@bernouy/cms-official-integrations/publication";
import { readRepositoryRuntimeEnv } from "@bernouy/cms-repository-server/runtime-env";
import { type BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";

export const PRODUCTION_RUNNER = readRepositoryRuntimeEnv({}).verifierRunner;

export type AcceptanceResources = {
    taskRoot: string;
    server?: { stop(): Promise<void> };
    adapter?: { dispose?(): Promise<void> };
    postgres?: { close(): Promise<void> };
};

export function createAcceptanceCleanup(resources: AcceptanceResources): () => Promise<void> {
    let cleanupPromise: Promise<void> | undefined;
    return () => {
        cleanupPromise ??= cleanupResources(resources);
        return cleanupPromise;
    };
}

export async function rethrowAfterCleanup(error: unknown, cleanup: () => Promise<void>): Promise<never> {
    try {
        await cleanup();
    } catch (cleanupError) {
        const errors = cleanupError instanceof AggregateError ? [...cleanupError.errors] : [cleanupError];
        throw new AggregateError([error, ...errors], "Official candidate acceptance setup and cleanup both failed");
    }
    throw error;
}

export function repositoryGuard(token: string, worker: boolean) {
    const config = {
        serviceToken: token,
        servicePrincipal: worker ? "official-verifier" : "official-management",
        rateLimiter: new InMemoryRateLimiter({ limit: 100, windowSeconds: 60 }),
    };
    return worker ? createRepositoryWorkerGuard(config) : createRepositoryManagementGuard(config);
}

export function runnerOrigin(runner: BunRunner): string {
    if (!runner.port) {
        throw new Error("Official candidate acceptance runner did not bind a port");
    }
    return `http://127.0.0.1:${runner.port}`;
}

export async function officialPhotoAlbumsCandidate() {
    const candidate = (await buildOfficialIntegrationCandidates()).find(
        ({ kind, version }) => kind === "photo-albums" && version === "1.1.0",
    );
    if (!candidate) {
        throw new Error("Official Photo Albums 1.1.0 candidate is unavailable");
    }
    return candidate;
}

async function cleanupResources(resources: AcceptanceResources): Promise<void> {
    const operations: (() => Promise<void>)[] = [];
    if (resources.server) {
        operations.push(() => resources.server!.stop());
    }
    if (resources.adapter?.dispose) {
        operations.push(() => resources.adapter!.dispose!());
    }
    if (resources.postgres) {
        operations.push(() => resources.postgres!.close());
    }
    const settled = await Promise.allSettled(operations.map(async (operation) => await operation()));
    const failures = settled.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    try {
        await removeAcceptanceRoot(resources.taskRoot);
    } catch (error) {
        failures.push(error);
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, "Official candidate acceptance cleanup failed");
    }
}

async function removeAcceptanceRoot(root: string): Promise<void> {
    try {
        await makeWritable(root);
    } catch (error) {
        if (!isMissingPath(error)) {
            throw error;
        }
    }
    await rm(root, { recursive: true, force: true });
}

async function makeWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (!metadata.isDirectory()) {
        return;
    }
    await chmod(path, 0o750);
    for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            await makeWritable(join(path, entry.name));
        }
    }
}

function isMissingPath(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
