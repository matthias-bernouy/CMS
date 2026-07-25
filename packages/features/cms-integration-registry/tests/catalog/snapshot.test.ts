import { describe, expect, test } from "bun:test";
import { createIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry";
import { catalogEntry, diagnostic } from "./fixtures";

describe("integration registry catalog snapshot", () => {
    test("builds sorted immutable indexes and exact package locations", () => {
        const alpha = catalogEntry("alpha");
        const snapshot = createIntegrationRegistryCatalogSnapshot({
            entries: [catalogEntry("zulu"), alpha],
        });

        alpha.index.label = "changed after construction";

        expect(snapshot.health).toBe("healthy");
        expect(snapshot.summaries.map((summary) => summary.kind)).toEqual(["alpha", "zulu"]);
        expect(snapshot.getIndex("alpha")?.label).toBe("alpha");
        expect(snapshot.listVersions("alpha")).toHaveLength(1);
        expect(snapshot.locateExactVersion("alpha", "1.0.0")?.package.digest).toBe("a".repeat(64));
        expect(snapshot.locateExactVersion("missing", "1.0.0")).toBeNull();
        expect(() => {
            (snapshot.summaries as unknown[]).push({});
        }).toThrow();
        expect(() => {
            snapshot.getIndex("alpha")!.label = "mutated";
        }).toThrow();
    });

    test("derives degraded health from structured diagnostics", () => {
        const snapshot = createIntegrationRegistryCatalogSnapshot({
            entries: [catalogEntry("valid")],
            diagnostics: [diagnostic("/registry/corrupt")],
            quarantined: [
                {
                    source: "/registry/corrupt",
                    diagnosticCodes: ["invalid-integration"],
                },
            ],
        });

        expect(snapshot.health).toBe("degraded");
        expect(snapshot.diagnostics[0]).toMatchObject({
            code: "invalid-integration",
            stage: "index",
        });
        expect(snapshot.quarantined[0]?.diagnosticCodes).toEqual(["invalid-integration"]);
    });

    test("rejects duplicate or incomplete validated identities", () => {
        expect(() =>
            createIntegrationRegistryCatalogSnapshot({
                entries: [catalogEntry("duplicate"), catalogEntry("duplicate")],
            }),
        ).toThrow(/Duplicate integration kind/);

        const incomplete = catalogEntry("incomplete");
        expect(() =>
            createIntegrationRegistryCatalogSnapshot({
                entries: [{ ...incomplete, versions: [] }],
            }),
        ).toThrow(/Missing exact version locations/);
    });
});
