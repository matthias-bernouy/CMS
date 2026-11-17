import { CollectionSources } from "@bernouy/ulvia-provider";
import { assertCollectionResourceIsolation } from "@bernouy/repository/collections/installations";
import { FilesystemRepositoryCatalogueIndex } from "@bernouy/repository/repository/filesystem";
import { assertMaximum, benchmark, printResults, benchmarkEvidence } from "../../benchmark";
import type { BenchmarkResult } from "../../benchmark";
import { beginSupplementary, writeSupplementary } from "../../../reporting/storage/supplementary";
import { repositoryFixture } from "./fixture";
import { measureRecipeDiscovery } from "./recipes";

const start = await beginSupplementary("repository");
const fixture = await repositoryFixture().catch(async () => {
    await writeSupplementary(start, { failure: "fixture-preparation-failed" }, "failed");
    throw new Error("Repository performance fixture preparation failed");
});
const results: BenchmarkResult[] = [];
const work: Array<{ name: string; reads: typeof fixture.reads; network: typeof fixture.network }> = [];
let status: "passed" | "failed" = "failed";
const report: Record<string, unknown> = { work };
try {
    async function measure(name: string, operation: () => Promise<unknown>, cold = false) {
        const result = await benchmark(name, operation, cold ? { samples: 3, warmups: 0 } : undefined);
        results.push(result);
        fixture.reset();
        await operation();
        work.push({ name, reads: { ...fixture.reads }, network: { ...fixture.network } });
        // These are regression ceilings, not acceptable production latency objectives.
        assertMaximum(`${name} p95`, result.p95Ms, cold ? 15_000 : 5_000);
    }
    await measure(
        "filesystem index cold (all artifact kinds)",
        () => new FilesystemRepositoryCatalogueIndex(fixture.root).list("collections"),
        true,
    );
    await measure("HTTP collections catalogue", () => fixture.collections.list());
    await measure("HTTP contracts catalogue", () => fixture.providers.list("contract"));
    await measure("HTTP providers catalogue", () => fixture.providers.list("provider-manifest"));
    const reference = (await fixture.collections.list())[0]!;
    await measure("HTTP complete collection and all assets", () => fixture.collections.get(reference), true);
    await measure("installed catalogue summary", () => fixture.store.listInstalled("installed"));
    await measure("installed collection snapshot", () => fixture.store.snapshot("installed"));
    await measure("installed graph and examples validation only", async () =>
        assertCollectionResourceIsolation([fixture.artifact.release]),
    );
    const coldCatalogue = () => new CollectionSources(fixture.store, [fixture.collections]).catalogue("installed");
    await measure("available collections cold", coldCatalogue, true);
    const cold = work.at(-1)!;
    assertMaximum("cold listing HTTP requests without assets", cold.network.requests, 2);
    assertMaximum(
        "cold listing full metadata and asset storage reads",
        cold.reads.metadata + cold.reads.asset + cold.reads.bundle,
        0,
    );
    const sources = new CollectionSources(fixture.store, [fixture.collections]);
    await sources.catalogue("installed");
    await measure("available collections warm / installed site", () => sources.catalogue("installed"));
    const warm = work.at(-1)!;
    assertMaximum("warm listing catalogue HTTP requests", warm.network.requests, 1);
    assertMaximum("warm listing site reads", warm.reads.site, 1);
    assertMaximum("warm listing release metadata reads", warm.reads.metadata, 0);
    assertMaximum("warm listing summary batches", warm.reads.summaries, 1);
    assertMaximum("warm listing latency p95", results.at(-1)!.p95Ms, 100);
    assertMaximum("warm listing asset reads", warm.reads.asset + warm.reads.bundle, 0);
    await measure("available collections warm / empty site", () => sources.catalogue("empty"));
    printResults("Repository and installation catalogue phases (real loopback HTTP)", results);
    console.table(work.map(({ name, reads, network }) => ({ phase: name, ...reads, ...network })));
    const recipeDiscovery = await measureRecipeDiscovery(fixture);
    Object.assign(report, {
        recipeDiscovery,
        generatedAt: new Date().toISOString(),
        environment: { bun: Bun.version, platform: process.platform, arch: process.arch },
        collection: {
            digest: fixture.artifact.digest,
            blocs: fixture.artifact.release.blocs.length,
            examples: fixture.artifact.release.examples?.length ?? 0,
            assets: fixture.artifact.assets.length,
        },
    });
    status = "passed";
} finally {
    try {
        const path = await writeSupplementary(start, { ...report, ...benchmarkEvidence() }, status);
        console.log(`Repository performance report: ${path}`);
    } finally {
        await fixture.close();
    }
}
