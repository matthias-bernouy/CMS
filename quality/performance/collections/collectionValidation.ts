import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
    admitCollectionReleaseJson,
    describeCollectionResources,
    parseCollectionRelease,
    parseCollectionReleaseJson,
    verifyCollectionPublicationEvolution,
} from "@bernouy/cms-repository/collections";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import {
    assertCompatibleCollectionUpgrade,
    collectionUpgradeBreakingResources,
} from "@bernouy/cms-repository/collections/installations";
import { assertGrowth, assertMaximum, benchmark, printResults } from "../benchmark";
import { admittedFixture, collectionFixture } from "./collectionFixtures";
import { officialContractCatalogue } from "../officialContracts";

const OFFICIAL_RELEASE = join(
    import.meta.dir,
    "../../../packages/runtimes/ulvia-cli/dist/bootstrap/collections/ulvia-official/release.json",
);

export async function runCollectionValidationBenchmarks(): Promise<void> {
    const officialJson = await Bun.file(OFFICIAL_RELEASE).text();
    const officialAssets = parseCollectionReleaseJson(officialJson).assets.map(({ id }) => ({
        id,
        bytes: Bun.file(join(dirname(OFFICIAL_RELEASE), "assets", id)),
    }));
    const synthetic = [
        { blocs: 32, examples: 16 },
        { blocs: 128, examples: 64 },
        { blocs: 512, examples: 256 },
    ].map(({ blocs, examples }) => ({
        name: `${blocs} blocs / ${examples} examples`,
        value: collectionFixture(blocs, examples),
    }));
    const results = [await benchmark("official JSON validation", () => parseCollectionReleaseJson(officialJson))];
    for (const { name, value } of synthetic) {
        results.push(await benchmark(`semantic validation: ${name}`, () => parseCollectionRelease(value)));
    }
    printResults("Collection validation", results);
    assertMaximum("official collection validation p95", results[0]!.p95Ms, 2_500);
    assertMaximum("maximum-size synthetic validation p95", results.at(-1)!.p95Ms, 2_500);
    assertGrowth("128 to 512 bloc validation growth", results[2]!, results[3]!, 12);

    const largest = parseCollectionRelease(synthetic.at(-1)!.value);
    const nextLargest = parseCollectionRelease(collectionFixture(512, 256, "1.0.1"));
    const contracts = await officialContractCatalogue();
    const officialAdmission = await admitCollectionReleaseJson(officialJson, officialAssets, { contracts });
    const admissionResults = [
        await benchmark("official JSON admission and digest", () =>
            admitCollectionReleaseJson(officialJson, officialAssets, { contracts }),
        ),
        await benchmark("512-bloc synthetic admission and digest", () => admittedFixture(512, 256, "1.0.0")),
        await benchmark("describe official collection resources", () =>
            describeCollectionResources(officialAdmission.release),
        ),
        await benchmark("compare two 512-bloc collection releases", () =>
            verifyCollectionPublicationEvolution(largest, nextLargest),
        ),
        await benchmark("check compatible upgrade across 512 blocs", () =>
            assertCompatibleCollectionUpgrade(largest, nextLargest),
        ),
        await benchmark("scan breaking resources across 512 blocs", () =>
            collectionUpgradeBreakingResources(largest, nextLargest),
        ),
    ];
    printResults("Collection admission and evolution", admissionResults);
    for (const result of admissionResults) {
        assertMaximum(`${result.name} p95`, result.p95Ms, 4_000);
    }

    const historyResults = await historyBenchmarks();
    printResults("Filesystem history validation", historyResults);
    assertMaximum("30-version history read p95", historyResults[3]!.p95Ms, 3_500);
    assertGrowth("5 to 15 version history growth", historyResults[1]!, historyResults[2]!, 6);
    assertGrowth("15 to 30 version history growth", historyResults[2]!, historyResults[3]!, 4);
    assertMaximum("next publication after 15 versions p95", historyResults.at(-1)!.p95Ms, 3_000);
}

async function historyBenchmarks() {
    const results = [];
    for (const count of [1, 5, 15, 30]) {
        const root = await createHistory(count);
        try {
            const repository = new LocalCollectionRepository(root);
            results.push(await benchmark(`read ${count} stored version(s)`, () => repository.listMetadata()));
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }
    const publication = await publicationBenchmark(15);
    results.push(publication);
    return results;
}

async function publicationBenchmark(historyLength: number) {
    const root = await createHistory(historyLength);
    const next = await admittedFixture(32, 16, `1.0.${historyLength}`);
    try {
        const repository = new LocalCollectionRepository(root);
        const releases = await repository.listMetadata();
        const previous = releases.find((item) => item.release.version === `1.0.${historyLength - 1}`);
        if (!previous) {
            throw new Error("Publication benchmark history is incomplete");
        }
        return benchmark(`evolution check after ${historyLength} versions`, () =>
            verifyCollectionPublicationEvolution(previous.release, next.release),
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

async function createHistory(count: number): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "ulvia-history-perf-"));
    const repository = new LocalCollectionRepository(root);
    for (let index = 0; index < count; index += 1) {
        await repository.store(await admittedFixture(32, 16, `1.0.${index}`));
    }
    return root;
}
