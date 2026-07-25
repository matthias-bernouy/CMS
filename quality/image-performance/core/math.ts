import type { ImagePerformanceArtifact } from "../contracts";

export function percentile(values: readonly number[], quantile: number): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
    return sorted[index] ?? 0;
}

export function rounded(value: number, precision = 3): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

export function delta(after: number, before: number): number {
    return Math.max(0, after - before);
}

export function summarizeListing(listing: ImagePerformanceArtifact["listing"]): ImagePerformanceArtifact["summary"] {
    return {
        listingImageBytesMedian: percentile(
            listing.map(({ imageBytes }) => imageBytes),
            0.5,
        ),
        listingImageBytesP95: percentile(
            listing.map(({ imageBytes }) => imageBytes),
            0.95,
        ),
        foregroundP50Ms: percentile(
            listing.map(({ foregroundP50Ms }) => foregroundP50Ms),
            0.5,
        ),
        foregroundP95Ms: percentile(
            listing.map(({ foregroundP95Ms }) => foregroundP95Ms),
            0.95,
        ),
        foregroundP99Ms: percentile(
            listing.map(({ foregroundP99Ms }) => foregroundP99Ms),
            0.99,
        ),
        warmEncodes: sumWarm(listing, "encodes"),
        warmUpstreamReads: sumWarm(listing, "upstreamReads"),
        failedImages: listing.reduce((sum, sample) => sum + sample.failedImages, 0),
    };
}

function sumWarm(listing: ImagePerformanceArtifact["listing"], key: "encodes" | "upstreamReads"): number {
    return listing.filter(({ phase }) => phase === "warm").reduce((sum, sample) => sum + sample.stats[key], 0);
}
