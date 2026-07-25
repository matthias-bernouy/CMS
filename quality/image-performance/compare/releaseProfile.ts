import type { ImagePerformanceArtifact } from "../contracts";

const CANONICAL_LADDER = [64, 128, 256, 384, 512, 768, 1_024, 1_280, 1_600, 1_920, 2_560];
const CANONICAL_VIEWPORT_WIDTH = 1_000;

export function assertReleaseProfile(artifact: ImagePerformanceArtifact, approvedCorpusFingerprint: string): void {
    const { configuration, corpus } = artifact;
    if (corpus.kind !== "directory") {
        throw new Error("Release evidence must use a directory corpus");
    }
    if (corpus.fingerprint !== approvedCorpusFingerprint) {
        throw new Error("Release evidence does not use the explicitly approved corpus fingerprint");
    }
    if (corpus.accepted < 12) {
        throw new Error("Release evidence must contain at least 12 accepted images");
    }
    if (JSON.stringify(configuration.ladder) !== JSON.stringify(CANONICAL_LADDER)) {
        throw new Error("Release evidence must use the canonical source image ladder");
    }
    if (configuration.cardCount !== 12) {
        throw new Error("Release evidence must use the 12-card listing");
    }
    if (configuration.viewportWidth !== CANONICAL_VIEWPORT_WIDTH) {
        throw new Error(`Release evidence must use the canonical ${CANONICAL_VIEWPORT_WIDTH}px viewport`);
    }
    if (configuration.repetitions < 5) {
        throw new Error("Release evidence must include at least five repetitions");
    }
    if (!configuration.users.includes(1) || !configuration.users.includes(4)) {
        throw new Error("Release evidence must include one-user and four-user samples");
    }
    if (configuration.foregroundRequests < 24) {
        throw new Error("Release evidence must sustain at least 24 foreground requests per sample");
    }
    if (configuration.imageUpstreamDelayMs < 10) {
        throw new Error("Release evidence must force cold upstream overlap");
    }
}

export function assertSmokeProfile(artifact: ImagePerformanceArtifact): void {
    const { configuration, corpus } = artifact;
    if (
        corpus.kind !== "synthetic" ||
        corpus.accepted < 2 ||
        JSON.stringify(configuration.ladder) !== JSON.stringify(CANONICAL_LADDER) ||
        configuration.cardCount !== 12 ||
        configuration.viewportWidth !== CANONICAL_VIEWPORT_WIDTH ||
        configuration.repetitions < 1 ||
        !configuration.users.includes(1) ||
        configuration.foregroundRequests < 4 ||
        configuration.imageUpstreamDelayMs < 10
    ) {
        throw new Error("CI smoke evidence does not use the canonical synthetic profile");
    }
}
