import { expect, test } from "bun:test";
import {
    assertPublicationBytes,
    assertPublicationSource,
    assertPublicationState,
    assertUploadProgress,
    assertCollectionPreflight,
} from "./oracles";
import { conflictingCollection } from "./collection";
import { publicationCollection } from "../../resources/collection";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import { auditPlan } from "../../../../capabilities/coverage";
import { assessmentScenarios } from "../../../plan";

const digest: `sha256:${string}` = `sha256:${"a".repeat(64)}`;
test("publication read oracles reject stale upload, yank, source, digest and byte outcomes", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(() => assertPublicationBytes(bytes, bytes)).not.toThrow();
    expect(() => assertPublicationBytes(new Uint8Array([1, 2]), bytes)).toThrow();
    expect(() => assertPublicationBytes(new Uint8Array([1, 2, 4]), bytes)).toThrow();
    expect(() =>
        assertPublicationSource({ sourceJson: "owned", releaseDigest: digest }, "owned", digest),
    ).not.toThrow();
    expect(() => assertPublicationSource({ sourceJson: "foreign", releaseDigest: digest }, "owned", digest)).toThrow();
    expect(() => assertPublicationSource({ sourceJson: "owned", releaseDigest: "foreign" }, "owned", digest)).toThrow();
    expect(() => assertPublicationState({ revision: 0, yank: null }, 0, null)).not.toThrow();
    expect(() =>
        assertPublicationState(
            { revision: 1, yank: { reason: "owned", yankedAt: new Date().toISOString() } },
            1,
            "owned",
        ),
    ).not.toThrow();
    expect(() => assertPublicationState({ revision: 0, yank: null }, 1, "owned")).toThrow();
    expect(() =>
        assertPublicationState(
            { revision: 1, yank: { reason: "foreign", yankedAt: new Date().toISOString() } },
            1,
            "owned",
        ),
    ).toThrow();
    expect(() =>
        assertUploadProgress(
            { uploadId: "owned", expiresAt: "expiry", uploadedAssetIds: ["docs/readme.md"] },
            "owned",
            "expiry",
            ["docs/readme.md"],
        ),
    ).not.toThrow();
    expect(() =>
        assertUploadProgress({ uploadId: "owned", expiresAt: "expiry", uploadedAssetIds: [] }, "owned", "expiry", [
            "docs/readme.md",
        ]),
    ).toThrow();
    expect(() =>
        assertUploadProgress(
            { uploadId: "foreign", expiresAt: "expiry", uploadedAssetIds: ["docs/readme.md"] },
            "owned",
            "expiry",
            ["docs/readme.md"],
        ),
    ).toThrow();
    expect(() => assertCollectionPreflight({ complete: true, digest }, digest)).not.toThrow();
    expect(() => assertCollectionPreflight({ complete: false, digest }, digest)).toThrow();
    expect(() => assertCollectionPreflight({ complete: true, digest: "foreign" }, digest)).toThrow();
});

test("the conflicting preflight candidate stays a valid exact-coordinate collection with different canonical content", async () => {
    const resource = await publicationCollection("performance-read-oracle", {
        contractId: "ulvia/cms.content",
        version: "1.0.0",
        digest,
    });
    const conflict = conflictingCollection(resource.release);
    expect(conflict).not.toBe(resource.canonicalJson);
    const parsed = JSON.parse(conflict);
    expect(parsed.collectionId).toBe(resource.id);
    expect(parsed.version).toBe(resource.version);
    expect(parsed.assets).toEqual(resource.release.assets);
    expect(parsed.configuration.schema.properties.performanceFlag.type).toBe("boolean");
});

test("all eight publication readers have their current HTTP invalidation plans without changing other requirements", async () => {
    const inventory = await performanceCapabilityInventory();
    const all = assessmentScenarios(inventory, "unit").map((row) => row.definition);
    const selected = all.filter(
        (row) => row.id.startsWith("repository-publication-read.") || row.id.startsWith("repository-collection-read."),
    );
    expect(selected).toHaveLength(8);
    expect(
        selected.every(
            (row) =>
                row.obligations[0]!.variant === "invalidation" &&
                row.obligations[0]!.binding === "http" &&
                row.samples === 10,
        ),
    ).toBe(true);
    const keys = new Set(selected.map((row) => row.obligations[0]!.target));
    const targets = inventory.targets.filter((row) => keys.has(row.key));
    const definitions = all.filter((row) => row.obligations.every((obligation) => keys.has(obligation.target)));
    expect(targets).toHaveLength(8);
    expect(auditPlan({ ...inventory, targets }, definitions)).toEqual([]);
    expect(
        auditPlan(
            { ...inventory, targets },
            definitions.filter((row) => row.id !== selected[0]!.id),
        ).some((row) => row.code === "missing-scenario" && row.obligation?.variant === "invalidation"),
    ).toBe(true);
});
