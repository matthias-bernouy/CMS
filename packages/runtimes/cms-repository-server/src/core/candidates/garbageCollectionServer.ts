import type { RepositoryServer } from "../repositoryServer";
import type { RepositoryOperationalTelemetry } from "../observability/telemetry";
import { type CandidateGarbageCollectionPolicy, ProductionCandidateGarbageCollector } from "./garbageCollection";

export async function startRepositoryWithCandidateGarbageCollection(
    input: Readonly<{
        root: string;
        policy: CandidateGarbageCollectionPolicy;
        telemetry: RepositoryOperationalTelemetry;
        startServer: () => RepositoryServer;
    }>,
): Promise<RepositoryServer> {
    const collector = new ProductionCandidateGarbageCollector({
        root: input.root,
        ...input.policy,
        observe: (entry) => input.telemetry.observeCandidateGarbageCollection(entry),
    });
    await collector.start();
    let server: RepositoryServer;
    try {
        server = input.startServer();
    } catch (error) {
        await collector.stop();
        throw error;
    }
    let stopPromise: Promise<void> | undefined;
    return Object.freeze({
        refreshCatalog: () => server.refreshCatalog(),
        stop() {
            stopPromise ??= stopRepositoryAndCollector(server, collector);
            return stopPromise;
        },
    });
}

async function stopRepositoryAndCollector(
    server: RepositoryServer,
    collector: ProductionCandidateGarbageCollector,
): Promise<void> {
    const results = await Promise.allSettled([server.stop(), collector.stop()]);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) {
        throw failure.reason;
    }
}
