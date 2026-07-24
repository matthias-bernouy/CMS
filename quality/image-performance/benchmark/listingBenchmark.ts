import type { AdapterStats, ListingLayout, ListingPhase, ListingSample } from "../contracts";
import type { ImagePerformanceAdapter } from "../core/adapter";
import type { LoadedCorpus } from "../core/corpus";
import { delta, percentile, rounded } from "../core/math";
import { requestForeground, runListingUser } from "./listingRequests";
import { startListingServer } from "./listingServer";

export type ListingBenchmarkConfig = {
    ladder: readonly number[];
    cardCount: number;
    viewportWidth: number;
    repetitions: number;
    users: readonly number[];
    foregroundRequests: number;
};

export async function benchmarkListing(
    corpus: LoadedCorpus,
    adapter: ImagePerformanceAdapter,
    config: ListingBenchmarkConfig,
): Promise<ListingSample[]> {
    const server = startListingServer(corpus, adapter);
    const samples: ListingSample[] = [];
    try {
        for (const layout of ["narrow", "wide"] as const) {
            for (const dpr of [1, 2]) {
                for (const users of config.users) {
                    for (let repetition = 1; repetition <= config.repetitions; repetition++) {
                        await adapter.reset();
                        samples.push(
                            await runPhase(server.origin, corpus, adapter, config, layout, dpr, users, repetition, "cold"),
                        );
                        samples.push(
                            await runPhase(server.origin, corpus, adapter, config, layout, dpr, users, repetition, "warm"),
                        );
                    }
                }
            }
        }
    } finally {
        server.stop();
    }
    return samples;
}

async function runPhase(
    origin: string,
    corpus: LoadedCorpus,
    adapter: ImagePerformanceAdapter,
    config: ListingBenchmarkConfig,
    layout: ListingLayout,
    dpr: number,
    users: number,
    repetition: number,
    phase: ListingPhase,
): Promise<ListingSample> {
    const before = adapter.stats();
    const cpuBefore = process.cpuUsage();
    let peakRssBytes = process.memoryUsage.rss();
    const memoryTimer = setInterval(() => {
        peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
    }, 5);
    const startedAt = performance.now();
    const imageDurations: number[] = [];
    const foregroundDurations: number[] = [];
    const imageBytes = { value: 0 };
    const failures = { value: 0 };
    try {
        await Promise.all([
            ...Array.from({ length: users }, () =>
                runListingUser(origin, corpus, config, layout, dpr, imageDurations, imageBytes, failures),
            ),
            ...Array.from({ length: config.foregroundRequests }, () => requestForeground(origin, foregroundDurations)),
        ]);
    } finally {
        clearInterval(memoryTimer);
    }
    const cpu = process.cpuUsage(cpuBefore);
    return {
        phase,
        layout,
        dpr,
        users,
        repetition,
        imageBytes: imageBytes.value,
        failedImages: failures.value,
        firstImageMs: rounded(Math.min(...imageDurations)),
        allImagesMs: rounded(Math.max(...imageDurations)),
        foregroundP50Ms: rounded(percentile(foregroundDurations, 0.5)),
        foregroundP95Ms: rounded(percentile(foregroundDurations, 0.95)),
        foregroundP99Ms: rounded(percentile(foregroundDurations, 0.99)),
        elapsedMs: rounded(performance.now() - startedAt),
        cpuMs: rounded((cpu.user + cpu.system) / 1_000),
        peakRssBytes,
        stats: statsDelta(before, adapter.stats()),
    };
}

function statsDelta(before: AdapterStats, after: AdapterStats): AdapterStats {
    return {
        cacheHits: delta(after.cacheHits, before.cacheHits),
        encodes: delta(after.encodes, before.encodes),
        upstreamReads: delta(after.upstreamReads, before.upstreamReads),
    };
}
