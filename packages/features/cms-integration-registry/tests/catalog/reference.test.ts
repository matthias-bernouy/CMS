import { describe, expect, test } from "bun:test";
import {
    createIntegrationRegistryCatalogSnapshot,
    IntegrationRegistryCatalogSnapshotReference,
    type IntegrationRegistryCatalogSnapshot,
} from "@bernouy/cms-integration-registry";
import { catalogEntry } from "./fixtures";

describe("IntegrationRegistryCatalogSnapshotReference", () => {
    test("atomically swaps one reference while old readers retain their snapshot", () => {
        const first = createIntegrationRegistryCatalogSnapshot({ entries: [catalogEntry("first")] });
        const reference = new IntegrationRegistryCatalogSnapshotReference(first);
        const readerSnapshot = reference.current();
        const second = createIntegrationRegistryCatalogSnapshot({ entries: [catalogEntry("second")] });

        expect(reference.swap(second)).toBe(first);
        expect(reference.current()).toBe(second);
        expect(readerSnapshot.getIndex("first")?.kind).toBe("first");
        expect(readerSnapshot.getIndex("second")).toBeNull();
    });

    test("supports compare-and-swap without replacing a newer snapshot", () => {
        const first = createIntegrationRegistryCatalogSnapshot({ entries: [catalogEntry("first")] });
        const second = createIntegrationRegistryCatalogSnapshot({ entries: [catalogEntry("second")] });
        const third = createIntegrationRegistryCatalogSnapshot({ entries: [catalogEntry("third")] });
        const reference = new IntegrationRegistryCatalogSnapshotReference(first);

        expect(reference.compareAndSwap(first, second)).toBe(true);
        expect(reference.compareAndSwap(first, third)).toBe(false);
        expect(reference.current()).toBe(second);
    });

    test("rejects structurally compatible snapshots that bypass validation", () => {
        const first = createIntegrationRegistryCatalogSnapshot({ entries: [] });
        const reference = new IntegrationRegistryCatalogSnapshotReference(first);
        const forged = { ...first } as IntegrationRegistryCatalogSnapshot;

        expect(() => reference.swap(forged)).toThrow(/must be created/);
    });
});
