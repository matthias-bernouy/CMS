import {
    IMAGE_PERFORMANCE_PROVENANCE_SCHEMA,
    type BrowserPerformanceArtifact,
    type BrowserPerformanceCase,
    type BrowserPerformanceProvenance,
    type ImagePerformanceArtifact,
} from "../../contracts";
import { buildBrowserPerformanceArtifact } from "../../browser/evidence";
import { performanceEvidenceFingerprint } from "../../provenance";
import { TEST_NOW_MS } from "./artifacts";

export function browserArtifact(candidate: ImagePerformanceArtifact): BrowserPerformanceArtifact {
    const cases: BrowserPerformanceCase[] = [];
    for (const rollout of ["baseline", "candidate"] as const) {
        for (const loading of ["lazy", "eager"] as const) {
            for (const dpr of [1, 2]) {
                const widths = expectedWidths(rollout, loading, dpr);
                cases.push({
                    rollout,
                    loading,
                    dpr,
                    cls: 0,
                    images: {
                        narrow: image("narrow", widths.narrow),
                        wide: image("wide", widths.wide),
                    },
                    requests: [image("narrow", widths.narrow).currentSrc, image("wide", widths.wide).currentSrc],
                    responseCaptures: [responseCapture("narrow", widths.narrow), responseCapture("wide", widths.wide)],
                    activationOrder:
                        rollout === "candidate"
                            ? {
                                  narrow: ["width", "height", "sizes", "srcset", "src"],
                                  wide: ["width", "height", "sizes", "srcset", "src"],
                              }
                            : { narrow: ["src"], wide: ["src"] },
                    domProbes: domProbes(),
                    currentSrcMismatches: 0,
                    requestMismatches: 0,
                    responseCaptureMismatches: 0,
                    doubleFetches: 0,
                    representationMismatches: 0,
                    activationOrderMismatches: 0,
                    unresolvedBindingMismatches: 0,
                    recycleMismatches: 0,
                });
            }
        }
    }
    return buildBrowserPerformanceArtifact(cases, provenance(candidate));
}

function provenance(candidate: ImagePerformanceArtifact): BrowserPerformanceProvenance {
    return {
        schema: IMAGE_PERFORMANCE_PROVENANCE_SCHEMA,
        suiteId: candidate.provenance.suiteId,
        generatedAtMs: TEST_NOW_MS - 500,
        codeFingerprint: candidate.provenance.codeFingerprint,
        suiteFingerprint: candidate.provenance.suiteFingerprint,
        candidateEvidenceFingerprint: performanceEvidenceFingerprint(candidate),
        engine: { name: "chromium", version: "test-chromium" },
        component: {
            productionEntry: true,
            entryFingerprint: "c".repeat(64),
            enabledBundleFingerprint: "d".repeat(64),
            disabledBundleFingerprint: "e".repeat(64),
        },
        adapter: {
            name: candidate.adapter,
            implementation: { ...candidate.implementation },
        },
    };
}

function domProbes(): BrowserPerformanceCase["domProbes"] {
    return {
        empty: { src: null, srcset: null },
        unresolved: {
            source: { src: null, srcset: null },
            width: { src: null, srcset: null },
            height: { src: null, srcset: null },
            sizes: { src: null, srcset: null },
        },
        recycled: {
            firstSizes: "(max-width: 640px) 100vw, 30vw",
            secondSizes: "50vw",
            secondSrc: "http://fixture.invalid/image/original.png?slot=recycle-second",
            clearedSizes: "25vw",
            clearedSrc: "http://fixture.invalid/image/other-owner.png?slot=recycle-owned-src",
            clearedSrcset: "/image/other-owner-640.png?slot=recycle-owned-srcset 640w",
            clearedWidth: "321",
            clearedHeight: "123",
        },
    };
}

function expectedWidths(
    rollout: BrowserPerformanceCase["rollout"],
    loading: BrowserPerformanceCase["loading"],
    dpr: number,
): Record<"narrow" | "wide", number | null> {
    if (rollout === "baseline") {
        return { narrow: null, wide: null };
    }
    if (loading === "lazy") {
        return dpr === 1 ? { narrow: 384, wide: 1_024 } : { narrow: 768, wide: 1_600 };
    }
    return dpr === 1 ? { narrow: 1_024, wide: 1_024 } : { narrow: 1_600, wide: 1_600 };
}

function image(slot: "narrow" | "wide", width: number | null) {
    const cmsWidth = width === null ? "" : `&cms-width=${width}`;
    const decodedWidth = width ?? 1_600;
    return {
        currentSrc: `http://fixture.invalid/image/original.png?slot=${slot}${cmsWidth}`,
        selectedWidth: width,
        responseStatus: 200,
        decodedWidth,
        decodedHeight: Math.round(decodedWidth * 0.75),
        responseContentType: width === null ? "image/png" : "image/webp",
    };
}

function responseCapture(slot: "narrow" | "wide", width: number | null) {
    const evidence = image(slot, width);
    return {
        url: evidence.currentSrc,
        responseStatus: evidence.responseStatus,
        responseContentType: evidence.responseContentType,
        bodyBytes: 100,
    };
}
