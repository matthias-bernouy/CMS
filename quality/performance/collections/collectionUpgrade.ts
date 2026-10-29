import {
    CollectionStore,
    MemoryCollectionStorage,
    prepareCollectionUpgrade,
} from "@bernouy/cms-repository/collections/installations";
import { assertGrowth, assertMaximum, benchmark, printResults } from "../benchmark";
import { syntheticCorpus } from "./collectionUpgradeFixture";
import { admittedFixture } from "./collectionFixtures";

/** Exercise the current read-only upgrade analysis, without transforming Page content. */
export async function runCollectionUpgradeBenchmarks(): Promise<void> {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const previous = await admittedFixture(1, 1, "1.0.0");
    const next = await admittedFixture(1, 1, "1.0.1");
    await collections.importRelease(previous.release);
    await collections.importRelease(next.release);
    await collections.install("performance", previous.digest, 0, "performance-suite");
    const results = [];
    for (const pageCount of [100, 1_000, 10_000]) {
        const corpus = syntheticCorpus(pageCount);
        results.push(
            await benchmark(
                `analyse upgrade over ${pageCount} Pages`,
                async () => {
                    corpus.reset();
                    const plan = await prepareCollectionUpgrade(
                        corpus.repository,
                        collections,
                        "performance",
                        [{ digest: next.digest }],
                        {
                            contributors: [],
                            requiredConsumers: [],
                            validateCapabilities: async () => [],
                        },
                    );
                    const metrics = corpus.metrics();
                    if (
                        plan.status !== "applicable" ||
                        metrics.scans !== 2 * Math.ceil(pageCount / 500) ||
                        metrics.largestScan > 500
                    ) {
                        throw new Error(
                            `Invalid upgrade plan or scan budget: ${JSON.stringify({ status: plan.status, metrics, issues: plan.issues.slice(0, 3) })}`,
                        );
                    }
                },
                { samples: 3, warmups: 1 },
            ),
        );
    }
    printResults("Read-only collection upgrade analysis", results);
    assertGrowth("1,000 to 10,000 Page analysis growth", results[1]!, results[2]!, 25);
    assertMaximum("10,000 Page upgrade analysis p95", results[2]!.p95Ms, 60_000);
}
