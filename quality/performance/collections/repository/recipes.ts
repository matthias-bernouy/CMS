import { admitCollectionRelease } from "@bernouy/repository/collections";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import {
    FilesystemRepositoryCatalogueIndex,
    LocalCollectionRepository,
} from "@bernouy/repository/repository/filesystem";
import { compareSemVer, releaseChannel } from "@bernouy/ulvia-contracts/compatibility";
import { assertMaximum, benchmark, printResults } from "../../benchmark";
import type { repositoryFixture } from "./fixture";

/** Compare the former discovery workload with indexed discovery over the same real loopback HTTP host. */
export async function measureRecipeDiscovery(fixture: Awaited<ReturnType<typeof repositoryFixture>>) {
    const translations = Object.fromEntries(
        Object.entries(fixture.artifact.release.translations).map(([locale, values]) => [
            locale,
            {
                ...values,
                ...Object.fromEntries(
                    Array.from({ length: 5000 }, (_, i) => [`padding-${i}`, `Label ${i}: ${"content ".repeat(16)}`]),
                ),
            },
        ]),
    );
    const artifact = await admitCollectionRelease(
        {
            ...fixture.artifact.release,
            version: "2.0.0",
            translations,
            bootstraps: [
                {
                    id: "sample",
                    label: fixture.artifact.release.name,
                    description: fixture.artifact.release.name,
                    requires: [],
                    includes: [],
                    pages: [],
                },
            ],
        },
        fixture.artifact.assets,
        { contracts: fixture.contracts },
    );
    await new LocalCollectionRepository(fixture.root).store(artifact);
    fixture.index.invalidate();

    const former = async () => {
        // Historical algorithm, including inline metadata validation. No authored JavaScript executes.
        const entries = (await fixture.collections.list()).filter(
            ({ version }) => releaseChannel(version) === "stable",
        );
        const latest = entries.sort((a, b) => compareSemVer(b.version, a.version))[0]!;
        const metadata = await inlineCollectionVerifier.metadata(
            await fixture.collections.getMetadata(latest),
            latest.digest,
        );
        return metadata.release.bootstraps?.length;
    };
    const indexed = () => fixture.collections.recipes({ limit: 4, locale: "en" });
    const options = { samples: 5, warmups: 1 };
    const before = await benchmark("recipe discovery: former history + full metadata", former, options);
    fixture.reset();
    await former();
    const beforeWork = { ...fixture.network };
    const after = await benchmark("recipe discovery: indexed HTTP summaries", indexed, options);
    fixture.reset();
    const result = await indexed();
    const afterWork = { ...fixture.network };
    if (result.items.length !== 1 || result.items[0]!.root.digest !== artifact.digest) {
        throw new Error("Recipe benchmark did not discover the exact fixture recipe");
    }
    const cold = await benchmark(
        "recipe discovery: cold projection index",
        () => new FilesystemRepositoryCatalogueIndex(fixture.root).recipePage({ limit: 4 }),
        { samples: 3, warmups: 0 },
    );
    assertMaximum("indexed recipe discovery requests", afterWork.requests, 1);
    assertMaximum("indexed recipe discovery response bytes", afterWork.bytes, 64 * 1024);
    assertMaximum("indexed recipe discovery warm p95", after.p95Ms, 500);
    printResults("Recipe discovery: identical large collection, before/after", [before, after, cold]);
    console.table([
        { phase: "before", ...beforeWork },
        { phase: "after", ...afterWork },
    ]);
    return {
        fixtureDigest: artifact.digest,
        metadataBytes: Buffer.byteLength(artifact.canonicalJson),
        before,
        after,
        cold,
        beforeWork,
        afterWork,
    };
}
