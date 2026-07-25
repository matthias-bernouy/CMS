import type { BrowserImageEvidence, BrowserPerformanceCase } from "../contracts";
import { recycleMismatches, unresolvedBindingMismatches } from "../domEvidence";
import { doubleFetches, matchesExpectedUrl, requestMismatches, responseCaptureMismatches } from "./network";

type DerivedKey =
    | "currentSrcMismatches"
    | "requestMismatches"
    | "responseCaptureMismatches"
    | "doubleFetches"
    | "representationMismatches"
    | "activationOrderMismatches"
    | "unresolvedBindingMismatches"
    | "recycleMismatches";
export type BrowserCaseMeasurement = Omit<BrowserPerformanceCase, DerivedKey>;

export function evaluateBrowserCase(measurement: BrowserCaseMeasurement): BrowserPerformanceCase {
    const images = {
        narrow: imageEvidence(measurement.images.narrow),
        wide: imageEvidence(measurement.images.wide),
    };
    const expectedWidths = expectedSelectedWidths(measurement.rollout, measurement.loading, measurement.dpr);
    return {
        ...measurement,
        images,
        currentSrcMismatches: currentSrcMismatches(images, expectedWidths),
        requestMismatches: requestMismatches(measurement.requests, expectedWidths),
        responseCaptureMismatches: responseCaptureMismatches(
            measurement.requests,
            measurement.responseCaptures,
            images,
        ),
        doubleFetches: doubleFetches(measurement.requests),
        representationMismatches: representationMismatches(measurement.rollout, images, expectedWidths),
        activationOrderMismatches:
            measurement.rollout === "candidate" ? activationOrderMismatches(measurement.activationOrder) : 0,
        unresolvedBindingMismatches: unresolvedBindingMismatches(measurement),
        recycleMismatches: recycleMismatches(measurement),
    };
}

function expectedSelectedWidths(
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

function imageEvidence(measurement: BrowserImageEvidence): BrowserImageEvidence {
    const currentSrc = measurement.currentSrc ?? "";
    const widthValue = currentSrc ? new URL(currentSrc).searchParams.get("cms-width") : null;
    const selectedWidth = widthValue === null ? null : Number(widthValue);
    return {
        ...measurement,
        currentSrc,
        selectedWidth: Number.isSafeInteger(selectedWidth) && selectedWidth! > 0 ? selectedWidth : null,
    };
}

function representationMismatches(
    rollout: BrowserPerformanceCase["rollout"],
    images: BrowserPerformanceCase["images"],
    expectedWidths: Record<"narrow" | "wide", number | null>,
): number {
    return imageSlots().filter((slot) => {
        const expectedWidth = rollout === "baseline" ? 1_600 : expectedWidths[slot];
        const expectedHeight = expectedWidth === null ? null : Math.round(expectedWidth * 0.75);
        const expectedType = rollout === "baseline" ? "image/png" : "image/webp";
        const actualType = images[slot].responseContentType?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
        return (
            images[slot].responseStatus !== 200 ||
            images[slot].decodedWidth !== expectedWidth ||
            images[slot].decodedHeight !== expectedHeight ||
            actualType !== expectedType
        );
    }).length;
}

function currentSrcMismatches(
    images: BrowserPerformanceCase["images"],
    expectedWidths: Record<"narrow" | "wide", number | null>,
): number {
    return imageSlots().filter((slot) => !matchesExpectedUrl(images[slot].currentSrc, slot, expectedWidths[slot]))
        .length;
}

function activationOrderMismatches(order: Record<string, string[]>): number {
    return imageSlots().filter((slot) => {
        const unique = order[slot]?.filter((name, index, values) => values.indexOf(name) === index) ?? [];
        const positions = ["width", "height", "sizes", "srcset", "src"].map((name) => unique.indexOf(name));
        return (
            positions.some((position) => position < 0) ||
            positions.some((position, index) => index > 0 && position < positions[index - 1]!)
        );
    }).length;
}

function imageSlots(): Array<"narrow" | "wide"> {
    return ["narrow", "wide"];
}
