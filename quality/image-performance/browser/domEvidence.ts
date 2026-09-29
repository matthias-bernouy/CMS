import type { BrowserCaseMeasurement } from "./case/evaluate";

export function unresolvedBindingMismatches(measurement: BrowserCaseMeasurement): number {
    const probes = [measurement.domProbes.empty, ...Object.values(measurement.domProbes.unresolved)];
    const activatedAttributes = probes.flatMap(({ src, srcset }) => [src, srcset]).filter((value) => value !== null);
    const unexpectedRequests = measurement.requests.filter((request) => {
        const path = new URL(request, "http://fixture.invalid").pathname;
        return path.includes("/empty") || path.includes("/unresolved-");
    }).length;
    return activatedAttributes.length + unexpectedRequests;
}

export function recycleMismatches(measurement: BrowserCaseMeasurement): number {
    const recycled = measurement.domProbes.recycled;
    const mismatches = [
        recycled.firstSizes !== "(max-width: 640px) 100vw, 30vw",
        recycled.secondSizes !== "50vw",
        recycled.secondSrc !== "/.cms/media/performance/image/recycle-second",
        recycled.clearedSizes !== "25vw",
        recycled.clearedSrc !== "/image/other-owner",
        recycled.clearedSrcset !== "/image/other-owner-640 640w",
        recycled.clearedWidth !== "321",
        recycled.clearedHeight !== "123",
    ].filter(Boolean).length;
    const unexpectedRequests = measurement.requests.filter((request) =>
        new URL(request, "http://fixture.invalid").pathname.includes("/recycle-"),
    ).length;
    return mismatches + unexpectedRequests;
}
