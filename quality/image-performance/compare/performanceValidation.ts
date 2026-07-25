import { SOURCE_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-source-images";
import { IMAGE_PERFORMANCE_SCHEMA, type ImagePerformanceArtifact, type ListingSample } from "../contracts";
import { summarizeListing } from "../core/math";
import { stableSerialize } from "../provenance";
import { assertReleaseProfile, assertSmokeProfile } from "./releaseProfile";

export function assertPerformanceArtifact(
    artifact: ImagePerformanceArtifact,
    role: "baseline" | "candidate",
    approvedCorpusFingerprint: string,
): void {
    assertPerformanceArtifactStructure(artifact, role);
    assertReleaseProfile(artifact, approvedCorpusFingerprint);
}

export function assertSmokeCandidateArtifact(artifact: ImagePerformanceArtifact): void {
    assertPerformanceArtifactStructure(artifact, "candidate");
    assertSmokeProfile(artifact);
}

function assertPerformanceArtifactStructure(artifact: ImagePerformanceArtifact, role: "baseline" | "candidate"): void {
    assertNonNegativeFiniteNumbers(artifact, role);
    if (artifact.schema !== IMAGE_PERFORMANCE_SCHEMA) {
        throw new Error(`Unsupported ${role} image performance artifact`);
    }
    if (artifact.adapter !== (role === "baseline" ? "original" : "source-responsive-webp-v1-local-fs")) {
        throw new Error(`Unexpected ${role} image performance adapter`);
    }
    if (
        artifact.implementation?.mode !== (role === "baseline" ? "original" : "source-image") ||
        artifact.implementation.recipeId !== SOURCE_RESPONSIVE_WEBP_V1.id ||
        !artifact.implementation.encoderIdentity
    ) {
        throw new Error(`Invalid ${role} adapter implementation`);
    }
    assertCorpus(artifact, role);
    assertListingMatrix(artifact);
    const summary = summarizeListing(artifact.listing);
    if (stableSerialize(summary) !== stableSerialize(artifact.summary)) {
        throw new Error(`${role} summary does not match raw listing samples`);
    }
}

export function assertNonNegativeFiniteNumbers(value: unknown, path = "artifact"): void {
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`${path} contains a negative or non-finite number`);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertNonNegativeFiniteNumbers(item, `${path}[${index}]`));
        return;
    }
    if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            assertNonNegativeFiniteNumbers(item, `${path}.${key}`);
        }
    }
}

function assertCorpus(artifact: ImagePerformanceArtifact, role: "baseline" | "candidate"): void {
    const rejections = artifact.corpus?.rejections;
    if (
        !rejections ||
        Object.keys(rejections).sort().join(",") !== "animated,invalidOrUnsafe,oversizedBytes" ||
        !["animated", "invalidOrUnsafe", "oversizedBytes"].every((key) =>
            Number.isSafeInteger(rejections[key as keyof typeof rejections]),
        )
    ) {
        throw new Error(`Invalid ${role} corpus rejection summary`);
    }
    const rejectionTotal = Object.values(rejections).reduce((sum, value) => sum + value, 0);
    if (
        !isHash(artifact.corpus.fingerprint) ||
        artifact.corpus.accepted !== artifact.corpus.assets.length ||
        artifact.corpus.rejected !== rejectionTotal
    ) {
        throw new Error(`Invalid ${role} corpus identity`);
    }
    const ids = new Set<string>();
    for (const asset of artifact.corpus.assets) {
        if (
            !asset.assetId ||
            ids.has(asset.assetId) ||
            !asset.passthrough ||
            asset.sourceWidth < 1 ||
            asset.sourceHeight < 1
        ) {
            throw new Error(`Invalid ${role} corpus asset`);
        }
        ids.add(asset.assetId);
        assertCorpusResponse(asset.passthrough, `${role} corpus passthrough`);
        const expected = artifact.configuration.ladder.filter((width) => width <= asset.sourceWidth);
        const actual = asset.variants.map(({ targetWidth }) => targetWidth);
        if (stableSerialize(actual) !== stableSerialize(expected)) {
            throw new Error(`Incomplete ${role} corpus variant matrix`);
        }
        for (const variant of asset.variants) {
            assertCorpusResponse(variant, `${role} corpus variant`);
            if (!variant.error && role === "candidate") {
                if (variant.outputMediaType !== "image/webp" || variant.outputFormat !== "webp") {
                    throw new Error("Candidate corpus contains a non-WebP derivative");
                }
            }
            if (!variant.error && role === "baseline" && variant.outputMediaType !== asset.mediaType) {
                throw new Error("Baseline corpus media type changed");
            }
        }
    }
}

function assertCorpusResponse(
    response: ImagePerformanceArtifact["corpus"]["assets"][number]["passthrough"],
    label: string,
): void {
    if (
        (!response.error &&
            (response.status === null ||
                response.outputBytes === null ||
                response.actualWidth === null ||
                response.actualHeight === null ||
                response.matchesSourceBytes === null ||
                typeof response.normalizedThumbnailMae !== "number")) ||
        (response.status === null && (response.matchesSourceBytes !== null || response.normalizedThumbnailMae !== null))
    ) {
        throw new Error(`Invalid ${label}`);
    }
}

function assertListingMatrix(artifact: ImagePerformanceArtifact): void {
    const expected = new Map<string, number>();
    for (const layout of ["narrow", "wide"]) {
        for (const dpr of [1, 2]) {
            for (const users of artifact.configuration.users) {
                for (let repetition = 1; repetition <= artifact.configuration.repetitions; repetition++) {
                    for (const phase of ["cold", "warm"]) {
                        expected.set([phase, layout, dpr, users, repetition].join(":"), 1);
                    }
                }
            }
        }
    }
    const actual = new Map<string, number>();
    for (const sample of artifact.listing) {
        assertListingSample(sample, artifact.configuration.foregroundRequests);
        const key = sampleKey(sample);
        actual.set(key, (actual.get(key) ?? 0) + 1);
    }
    if (stableSerialize(actualEntries(actual)) !== stableSerialize(actualEntries(expected))) {
        throw new Error("Image performance listing matrix is incomplete or duplicated");
    }
}

function assertListingSample(sample: ListingSample, foregroundMinimum: number): void {
    if (
        !["cold", "warm"].includes(sample.phase) ||
        !["narrow", "wide"].includes(sample.layout) ||
        ![1, 2].includes(sample.dpr) ||
        sample.foregroundSamples < foregroundMinimum ||
        !Number.isSafeInteger(sample.stats.encodes) ||
        !Number.isSafeInteger(sample.stats.upstreamReads)
    ) {
        throw new Error("Invalid image performance listing sample");
    }
}

function sampleKey(sample: ListingSample): string {
    return [sample.phase, sample.layout, sample.dpr, sample.users, sample.repetition].join(":");
}

function actualEntries(value: Map<string, number>): Array<[string, number]> {
    return [...value.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function isHash(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value);
}
