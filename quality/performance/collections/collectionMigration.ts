import {
    CollectionStore,
    MemoryCollectionStorage,
    prepareCollectionMigration,
} from "@bernouy/cms-repository/collections/installations";
import { assertGrowth, assertMaximum, benchmark, printResults } from "../benchmark";
import { affectedCount, migrationRelease, syntheticCorpus } from "./collectionMigrationFixture";

export async function runCollectionMigrationBenchmarks(): Promise<void> {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const previous = await collections.importRelease(migrationRelease("1.0.0", "performance-migration-card"));
    const next = await collections.importRelease({
        ...migrationRelease("2.0.0", "performance-migration-panel"),
        dataGeneration: 2,
        migrations: [
            {
                fromGeneration: 1,
                toGeneration: 2,
                operations: [
                    {
                        kind: "rename-bloc",
                        from: "performance-migration-card",
                        to: "performance-migration-panel",
                    },
                ],
            },
        ],
    });
    await collections.install("performance", previous.digest, 0, "performance-suite");
    const target = [{ digest: next.digest, repositoryId: "performance-suite" }];
    const small = await migrationBenchmark("plan 1,000 pages (10% affected)", 1_000, 10, collections, target);
    const medium = await migrationBenchmark("plan 10,000 pages (10% affected)", 10_000, 10, collections, target);
    const large = await migrationBenchmark("plan 100,000 pages (10% affected)", 100_000, 10, collections, target);
    const sparse = await migrationBenchmark("plan 10,000 pages (1% affected)", 10_000, 1, collections, target);
    const dense = await migrationBenchmark("plan 10,000 pages (100% affected)", 10_000, 100, collections, target);
    printResults("Complete collection migration planning over synthetic Page corpora", [
        small.result,
        medium.result,
        large.result,
        sparse.result,
        dense.result,
    ]);
    console.table(
        [small, medium, large, sparse, dense].map(({ result, metrics, pageCount, affectedPercent }) => ({
            benchmark: result.name,
            pages: pageCount,
            affectedPercent,
            scans: metrics.scans,
            largestScan: metrics.largestScan,
            largestChangeBatch: metrics.largestChangeBatch,
            observedPeakHeapMiB: Number((metrics.peakHeapBytes / 1024 / 1024).toFixed(2)),
        })),
    );
    assertGrowth("1,000 to 10,000 Page migration-plan growth", small.result, medium.result, 20);
    assertGrowth("10,000 to 100,000 Page migration-plan growth", medium.result, large.result, 20);
    assertGrowth("1% to 100% affected migration-plan growth", sparse.result, dense.result, 20);
    assertMaximum("100,000 Page migration planning p95", large.result.p95Ms, 120_000);
}

async function migrationBenchmark(
    name: string,
    pageCount: number,
    affectedPercent: 1 | 10 | 100,
    collections: CollectionStore,
    targets: Parameters<typeof prepareCollectionMigration>[3],
) {
    const corpus = syntheticCorpus(pageCount, affectedPercent);
    const expectedChanges = affectedCount(pageCount, affectedPercent);
    const result = await benchmark(
        name,
        async () => {
            corpus.reset();
            const prepared = await prepareCollectionMigration(
                corpus.repository,
                collections,
                "performance",
                targets,
                1,
                [],
                {
                    pagePreviewLimit: 100,
                    onPageChanges: async (pages) => corpus.observeChanges(pages.length),
                },
            );
            const metrics = corpus.metrics();
            if (
                prepared.blockedReasons.length ||
                prepared.pageCount !== expectedChanges ||
                prepared.pages.length !== Math.min(100, expectedChanges) ||
                metrics.largestScan > 500 ||
                metrics.largestChangeBatch > 500
            ) {
                throw new Error(`Migration planning produced an invalid or unbounded ${pageCount}-Page plan`);
            }
        },
        { samples: 3, warmups: 1 },
    );
    return { result, metrics: corpus.metrics(), pageCount, affectedPercent };
}
