import { IMAGE_PERFORMANCE_SCHEMA, type ImagePerformanceArtifact } from "../contracts";
import { assertReleaseAdapterSpecifier, createAdapter } from "../core/adapter";
import { integerListArgument, parseArguments, positiveIntegerArgument, textArgument } from "../core/args";
import { loadCorpus } from "../core/corpus";
import { summarizeListing } from "../core/math";
import { safeLabel, writeJsonArtifact } from "../core/output";
import { createPerformanceProvenance, currentCodeFingerprint } from "../provenance";
import { benchmarkCorpus } from "./corpusBenchmark";
import { benchmarkListing } from "./listingBenchmark";

const DEFAULT_LADDER = [64, 128, 256, 384, 512, 768, 1_024, 1_280, 1_600, 1_920, 2_560];

async function main(): Promise<void> {
    const args = parseArguments(process.argv.slice(2));
    const output = textArgument(args, "output");
    const label = safeLabel(textArgument(args, "label"));
    const suiteValue = args.get("suite-id")?.trim() || process.env.IMAGE_PERFORMANCE_SUITE_ID?.trim();
    if (!suiteValue) {
        throw new Error("Set --suite-id or IMAGE_PERFORMANCE_SUITE_ID");
    }
    const suiteId = safeLabel(suiteValue);
    const imageUpstreamDelayMs = positiveIntegerArgument(args, "image-upstream-delay-ms", 15);
    const adapterSpecifier = textArgument(args, "adapter");
    assertReleaseAdapterSpecifier(adapterSpecifier);
    const codeFingerprint = await currentCodeFingerprint();
    const adapter = await createAdapter(adapterSpecifier, { imageUpstreamDelayMs });
    try {
        const ladder = integerListArgument(args, "ladder", DEFAULT_LADDER);
        const synthetic = args.has("synthetic") ? positiveIntegerArgument(args, "synthetic", 12) : undefined;
        const directory = args.get("corpus")?.trim() || process.env.IMAGE_CORPUS_DIR?.trim();
        if (!directory && !synthetic) {
            throw new Error("Set --corpus, IMAGE_CORPUS_DIR, or an explicit --synthetic count");
        }
        const corpus = await loadCorpus({
            ...(directory ? { directory } : {}),
            ...(synthetic ? { syntheticCount: synthetic } : {}),
        });
        await adapter.reset();
        const corpusSamples = await benchmarkCorpus(corpus, adapter, ladder);
        const configuration = {
            ladder,
            cardCount: positiveIntegerArgument(args, "cards", 12),
            viewportWidth: positiveIntegerArgument(args, "viewport-width", 1_000),
            repetitions: positiveIntegerArgument(args, "repetitions", 5),
            users: integerListArgument(args, "users", [1, 4]),
            foregroundRequests: positiveIntegerArgument(args, "foreground-requests", 24),
            imageUpstreamDelayMs,
        };
        const listing = await benchmarkListing(corpus, adapter, configuration);
        const artifactWithoutProvenance: Omit<ImagePerformanceArtifact, "provenance"> = {
            schema: IMAGE_PERFORMANCE_SCHEMA,
            label,
            adapter: safeLabel(adapter.name),
            implementation: adapter.implementation,
            corpus: {
                kind: synthetic ? "synthetic" : "directory",
                fingerprint: corpus.fingerprint,
                accepted: corpus.assets.length,
                rejected: corpus.rejected,
                rejections: corpus.rejections,
                assets: corpusSamples,
            },
            configuration,
            listing,
            summary: summarizeListing(listing),
        };
        if ((await currentCodeFingerprint()) !== codeFingerprint) {
            throw new Error("Image performance code changed while the benchmark was running");
        }
        const artifact: ImagePerformanceArtifact = {
            ...artifactWithoutProvenance,
            provenance: createPerformanceProvenance({
                artifact: artifactWithoutProvenance,
                suiteId,
                codeFingerprint,
            }),
        };
        await writeJsonArtifact(output, artifact);
        console.info(
            JSON.stringify({
                schema: artifact.schema,
                label: artifact.label,
                adapter: artifact.adapter,
                corpusAssets: artifact.corpus.accepted,
                listingSamples: artifact.listing.length,
                output,
            }),
        );
    } finally {
        await adapter.dispose?.();
    }
}

await main().catch((error: unknown) => {
    console.error(`[image-performance] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
