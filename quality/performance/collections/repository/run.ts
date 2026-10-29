import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CollectionSources } from "@bernouy/ulvia-provider";
import { assertCollectionResourceIsolation } from "@bernouy/cms-repository/collections/installations";
import { FilesystemRepositoryCatalogueIndex } from "@bernouy/cms-repository/repository/filesystem";
import { assertMaximum, benchmark, printResults, type BenchmarkResult } from "../../benchmark";
import { repositoryFixture } from "./fixture";

const fixture = await repositoryFixture();
const results: BenchmarkResult[] = [];
const work: Array<{ name: string; reads: typeof fixture.reads; network: typeof fixture.network }> = [];
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
    const report = {
        generatedAt: new Date().toISOString(),
        environment: { bun: Bun.version, platform: process.platform, arch: process.arch },
        collection: {
            digest: fixture.artifact.digest,
            blocs: fixture.artifact.release.blocs.length,
            examples: fixture.artifact.release.examples?.length ?? 0,
            assets: fixture.artifact.assets.length,
        },
        results,
        work,
    };
    const output = join(import.meta.dir, "../../../../artifacts/performance/repository/optimized.json");
    await mkdir(join(output, ".."), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Repository performance report: ${output}`);
} finally {
    await fixture.close();
}
