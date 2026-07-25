import type { BrowserCaseMeasurement } from "./case/evaluate";

export function unresolvedBindingMismatches(measurement: BrowserCaseMeasurement): number {
    const probes = [measurement.domProbes.empty, ...Object.values(measurement.domProbes.unresolved)];
    const activatedAttributes = probes.flatMap(({ src, srcset }) => [src, srcset]).filter((value) => value !== null);
    const unexpectedRequests = measurement.requests.filter((request) => {
        const slot = new URL(request, "http://fixture.invalid").searchParams.get("slot") ?? "";
        return slot === "empty" || slot.startsWith("unresolved-");
    }).length;
    return activatedAttributes.length + unexpectedRequests;
}

export function recycleMismatches(measurement: BrowserCaseMeasurement): number {
    const recycled = measurement.domProbes.recycled;
    const mismatches = [
        recycled.firstSizes !== "(max-width: 640px) 100vw, 30vw",
        recycled.secondSizes !== "50vw",
        !matchesSlot(recycled.secondSrc, "recycle-second"),
        recycled.clearedSizes !== "25vw",
        !matchesSlot(recycled.clearedSrc, "recycle-owned-src"),
        recycled.clearedSrcset !== "/image/other-owner-640.png?slot=recycle-owned-srcset 640w",
        recycled.clearedWidth !== "321",
        recycled.clearedHeight !== "123",
    ].filter(Boolean).length;
    const unexpectedRequests = measurement.requests.filter((request) =>
        (new URL(request, "http://fixture.invalid").searchParams.get("slot") ?? "").startsWith("recycle-"),
    ).length;
    return mismatches + unexpectedRequests;
}

function matchesSlot(value: string | null, slot: string): boolean {
    if (!value) {
        return false;
    }
    return new URL(value, "http://fixture.invalid").searchParams.get("slot") === slot;
}
