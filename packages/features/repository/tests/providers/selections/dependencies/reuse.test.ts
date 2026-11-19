import { expect, test } from "bun:test";
import { planContractSelections } from "@bernouy/ulvia-providers/selections";
import { CatalogueSelectionDependencies } from "repository/providers/selections/default-implementation/CatalogueSelectionDependencies";
import { dependencySnapshotReaders } from "repository/providers/selections/default-implementation/dependencySnapshotReaders";
import { captureFixture } from "./fixture";
import { siteId } from "../fixtures";

test("bounded coherent capture reuses already validated records without reloading graph artifacts", async () => {
    const f = await captureFixture();
    const target = [await f.select("ulvia/commerce"), await f.select("ulvia/payment")];
    const captured = await f.dependencies.capture(siteId);
    const reads = new Map(f.calls);
    const planned = await planContractSelections(siteId, target, captured);
    expect(f.calls).toEqual(reads);
    const reference = await planContractSelections(siteId, target, {
        ...captured,
        releases: f.releases,
        manifests: f.manifests,
    });
    expect(planned).toEqual(reference);
    expect(f.calls.get("release.get")).toBeGreaterThan(0);
    expect(f.calls.get("manifest.get")).toBeGreaterThan(0);
    expect(reads.get("release.list")).toBe(1);
    expect(reads.get("manifest.list")).toBe(1);
    expect(reads.get("installation.list")).toBe(1);
    expect(reads.get("release.revision")).toBe(2);
    expect(await f.dependencies.isCurrent(siteId, captured.revision)).toBeTrue();
    expect(f.calls.get("release.revision")).toBe(3);
});

test("snapshot readers retain ordering, filters, missing pins, timestamps and immutable metadata", async () => {
    const f = await captureFixture();
    await f.releases.setDeprecation("ulvia/payment", "1.0.0", { reason: "Prefer the replacement" });
    await f.releases.setYank("ulvia/payment", "1.0.0", { reason: "Retired" });
    const captured = await f.dependencies.capture(siteId);
    for (const reader of [captured.releases, captured.manifests]) {
        const records = await reader.list();
        expect(Object.isFrozen(records)).toBeTrue();
        for (const record of records) {
            expect(await reader.findByDigest(record.admission.digest)).toEqual(record);
            expect(Object.isFrozen(record)).toBeTrue();
        }
        expect(await reader.get("missing/id", "1.0.0")).toBeNull();
        expect(await reader.list("missing/id")).toEqual([]);
    }
    expect(await captured.releases.list()).toEqual(await f.releases.list());
    expect(await captured.manifests.list()).toEqual(await f.manifests.list());
    expect(await captured.releases.list("ulvia/payment")).toEqual(await f.releases.list("ulvia/payment"));
    const retired = (await captured.releases.get("ulvia/payment", "1.0.0"))!;
    expect(Reflect.set(retired.yank!, "reason", "poison")).toBeFalse();
    expect(Reflect.set(retired.deprecation!, "reason", "poison")).toBeFalse();
    expect(captured.releases.revision).toBeUndefined();
    expect(captured.manifests.revision).toBeUndefined();
    const digest = retired.admission.digest;
    expect(await captured.releases.readDocumentation?.(digest, "missing.md")).toEqual(
        await f.releases.readDocumentation?.(digest, "missing.md"),
    );
});

test("unversioned or oversized catalogues keep original live readers without new refusals", async () => {
    const f = await captureFixture();
    const records = await f.dependencies.read(siteId);
    const largeCount = { ...records, releases: Array.from({ length: 129 }, () => records.releases[0]!) };
    expect(dependencySnapshotReaders(f.releases, f.manifests, largeCount)).toEqual({
        releases: f.releases,
        manifests: f.manifests,
    });
    const largeText = {
        ...records,
        releases: [
            {
                ...records.releases[0]!,
                admission: { ...records.releases[0]!.admission, canonicalJson: "x".repeat(4 * 1024 ** 2 + 1) },
            },
        ],
    };
    expect(dependencySnapshotReaders(f.releases, f.manifests, largeText)).toEqual({
        releases: f.releases,
        manifests: f.manifests,
    });
    const live = new CatalogueSelectionDependencies(f.unversionedReleases, f.manifests, f.installationStore);
    const captured = await live.capture(siteId);
    expect(captured.releases).toBe(f.unversionedReleases);
    expect(captured.manifests).toBe(f.manifests);
});
