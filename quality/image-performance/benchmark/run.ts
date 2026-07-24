import { IMAGE_PERFORMANCE_SCHEMA, type ImagePerformanceArtifact } from "../contracts";
import { createAdapter } from "../core/adapter";
import { integerListArgument, parseArguments, positiveIntegerArgument, textArgument } from "../core/args";
import { loadCorpus } from "../core/corpus";
import { percentile } from "../core/math";
import { safeLabel, writeJsonArtifact } from "../core/output";
import { benchmarkCorpus } from "./corpusBenchmark";
import { benchmarkListing } from "./listingBenchmark";

const DEFAULT_LADDER = [64, 128, 256, 384, 512, 768, 1_024, 1_280, 1_600, 1_920, 2_560];

async function main(): Promise<void> {
    const args = parseArguments(process.argv.slice(2));
    const output = textArgument(args, "output");
    const label = safeLabel(textArgument(args, "label"));
    const adapter = await createAdapter(textArgument(args, "adapter"));
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
    };
    const listing = await benchmarkListing(corpus, adapter, configuration);
    const imageBytes = listing.map((sample) => sample.imageBytes);
    const artifact: ImagePerformanceArtifact = {
        schema: IMAGE_PERFORMANCE_SCHEMA,
        label,
        adapter: safeLabel(adapter.name),
        corpus: {
            fingerprint: corpus.fingerprint,
            accepted: corpus.assets.length,
            rejected: corpus.rejected,
            assets: corpusSamples,
        },
        configuration,
        listing,
        summary: {
            listingImageBytesMedian: percentile(imageBytes, 0.5),
            listingImageBytesP95: percentile(imageBytes, 0.95),
            foregroundP50Ms: percentile(listing.map(({ foregroundP50Ms }) => foregroundP50Ms), 0.5),
            foregroundP95Ms: percentile(listing.map(({ foregroundP95Ms }) => foregroundP95Ms), 0.95),
            foregroundP99Ms: percentile(listing.map(({ foregroundP99Ms }) => foregroundP99Ms), 0.99),
            warmEncodes: sumWarm(listing, "encodes"),
            warmUpstreamReads: sumWarm(listing, "upstreamReads"),
            failedImages: listing.reduce((sum, sample) => sum + sample.failedImages, 0),
        },
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
}

function sumWarm(listing: ImagePerformanceArtifact["listing"], key: "encodes" | "upstreamReads"): number {
    return listing.filter(({ phase }) => phase === "warm").reduce((sum, sample) => sum + sample.stats[key], 0);
}

await main().catch((error: unknown) => {
    console.error(`[image-performance] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
