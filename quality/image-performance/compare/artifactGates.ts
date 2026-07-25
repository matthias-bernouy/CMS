import type { GateResult, ImagePerformanceArtifact, ListingSample } from "../contracts";

export function artifactIntegrityGates(
    baseline: ImagePerformanceArtifact,
    candidate: ImagePerformanceArtifact,
    maximumThumbnailMae: number,
): GateResult[] {
    return [
        exactGate("baseline_corpus_errors", corpusTransformErrors(baseline), 0),
        exactGate("baseline_failed_images", baseline.summary.failedImages, 0),
        exactGate("legacy_original_mismatches", legacyOriginalMismatches(baseline), 0),
        ...candidateArtifactIntegrityGates(candidate, maximumThumbnailMae),
    ];
}

export function candidateArtifactIntegrityGates(
    candidate: ImagePerformanceArtifact,
    maximumThumbnailMae: number,
): GateResult[] {
    return [
        exactGate("corpus_transform_errors", corpusTransformErrors(candidate), 0),
        exactGate("corpus_output_mismatches", corpusOutputMismatches(candidate), 0),
        exactGate("descriptor_mismatches", descriptorMismatches(candidate), 0),
        exactGate("source_passthrough_mismatches", sourcePassthroughMismatches(candidate), 0),
        exactGate("cold_single_flight_encode_mismatches", singleFlightMismatches(candidate, "encodes"), 0),
        exactGate("cold_single_flight_upstream_mismatches", singleFlightMismatches(candidate, "upstreamReads"), 0),
        maximumGate("normalized_thumbnail_mae", maximumObservedThumbnailMae(candidate), maximumThumbnailMae),
    ];
}

function corpusOutputMismatches(artifact: ImagePerformanceArtifact): number {
    return artifact.corpus.assets.reduce(
        (count, asset) =>
            count +
            asset.variants.filter(
                (variant) => variant.outputMediaType !== "image/webp" || variant.outputFormat !== "webp",
            ).length,
        0,
    );
}

function corpusTransformErrors(artifact: ImagePerformanceArtifact): number {
    return artifact.corpus.assets.reduce(
        (count, asset) =>
            count +
            Number(Boolean(asset.passthrough.error) || asset.passthrough.outputBytes === null) +
            asset.variants.filter((variant) => variant.error || variant.outputBytes === null).length,
        0,
    );
}

function descriptorMismatches(artifact: ImagePerformanceArtifact): number {
    return artifact.corpus.assets.reduce(
        (count, asset) =>
            count +
            asset.variants.filter((variant) => {
                const expectedWidth = Math.min(variant.targetWidth, asset.sourceWidth);
                const expectedHeight = Math.round((expectedWidth * asset.sourceHeight) / asset.sourceWidth);
                return (
                    variant.actualWidth !== expectedWidth ||
                    variant.actualHeight === null ||
                    Math.abs(variant.actualHeight - expectedHeight) > 1
                );
            }).length,
        0,
    );
}

function sourcePassthroughMismatches(artifact: ImagePerformanceArtifact): number {
    return artifact.corpus.assets.reduce(
        (count, asset) => count + Number(!isExactPassthrough(asset.passthrough, asset)),
        0,
    );
}

function maximumObservedThumbnailMae(artifact: ImagePerformanceArtifact): number {
    return Math.max(
        0,
        ...artifact.corpus.assets.flatMap((asset) =>
            asset.variants.map(({ normalizedThumbnailMae }) => normalizedThumbnailMae ?? Number.POSITIVE_INFINITY),
        ),
    );
}

function singleFlightMismatches(artifact: ImagePerformanceArtifact, key: "encodes" | "upstreamReads"): number {
    return artifact.listing
        .filter(({ phase }) => phase === "cold")
        .reduce(
            (mismatches, sample) =>
                mismatches + Math.abs(sample.stats[key] - expectedColdDerivatives(artifact, sample)),
            0,
        );
}

function expectedColdDerivatives(artifact: ImagePerformanceArtifact, sample: ListingSample): number {
    const keys = new Set<string>();
    for (let index = 0; index < artifact.configuration.cardCount; index++) {
        const asset = artifact.corpus.assets[index % artifact.corpus.assets.length]!;
        const displayWidth = artifact.configuration.viewportWidth * (sample.layout === "narrow" ? 0.3 : 1);
        const required = Math.ceil(displayWidth * sample.dpr);
        const producible = artifact.configuration.ladder.filter((width) => width <= asset.sourceWidth);
        const selected = producible.find((width) => width >= required) ?? producible.at(-1);
        if (selected) {
            keys.add(`${asset.assetId}:${selected}`);
        }
    }
    return keys.size;
}

function legacyOriginalMismatches(artifact: ImagePerformanceArtifact): number {
    if (artifact.adapter !== "original") {
        return 1;
    }
    return artifact.corpus.assets.reduce(
        (count, asset) =>
            count +
            Number(!isExactPassthrough(asset.passthrough, asset)) +
            asset.variants.filter((variant) => !isExactPassthrough(variant, asset)).length,
        0,
    );
}

function isExactPassthrough(
    sample: ImagePerformanceArtifact["corpus"]["assets"][number]["passthrough"],
    asset: ImagePerformanceArtifact["corpus"]["assets"][number],
): boolean {
    return (
        sample.status === 200 &&
        sample.actualWidth === asset.sourceWidth &&
        sample.actualHeight === asset.sourceHeight &&
        sample.outputBytes === asset.sourceBytes &&
        sample.matchesSourceBytes === true &&
        sample.outputMediaType === asset.mediaType &&
        sample.outputFormat === expectedOriginalFormat(asset.mediaType) &&
        !sample.error
    );
}

function expectedOriginalFormat(mediaType: string): string {
    return mediaType === "image/jpeg" ? "jpg" : mediaType.slice("image/".length);
}

function exactGate(id: string, actual: number, expected: number): GateResult {
    return { id, passed: actual === expected, actual, expected };
}

function maximumGate(id: string, actual: number, maximum: number): GateResult {
    return { id, passed: actual <= maximum, actual, expected: `<=${maximum}` };
}
