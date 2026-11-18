import { expect, test } from "bun:test";
import { parseVersionRange } from "@bernouy/ulvia-providers";
import { officialCapabilityInventory } from "../../capabilities/inventory";
import { auditPlan, coverageMatrix } from "../../capabilities/coverage";
import { settingsTenants } from "../content/settings/tenant";
import { providerScenarios } from "./plan";
import { assertPreview, assertSelectionUnchanged, assertApprovalStateUnchanged } from "./oracles";

test("Provider and Gateway plans include exact variants and a blocking delegation invalidation case", async () => {
    const inventory = await officialCapabilityInventory();
    const scenarios = providerScenarios(inventory, "test-only", settingsTenants(inventory)).map(
        (row) => row.definition,
    );
    expect(scenarios).toHaveLength(50);
    const keys = new Set(scenarios.flatMap((row) => row.obligations.map((item) => item.target)));
    expect(keys.size).toBe(12);
    const scoped = { ...inventory, targets: inventory.targets.filter((row) => keys.has(row.key)), templates: [] };
    expect(auditPlan(scoped, scenarios)).toEqual([]);
    const matrix = coverageMatrix(scoped, scenarios, []);
    expect(matrix).toHaveLength(50);
    expect(matrix.filter((row) => row.status === "unattempted")).toHaveLength(50);
    const gaps = matrix.filter((row) => row.status === "missing-plan");
    expect(gaps).toHaveLength(0);
    expect(auditPlan(scoped, scenarios.slice(1)).some((row) => row.code === "missing-scenario")).toBe(true);
});

test("Provider previews match independently admitted identity, implementations and requests without exposing credentials", () => {
    const digest = `sha256:${"a".repeat(64)}` as const;
    const peer = {
        token: "private-test-provider-token",
        digest,
        endpoint: "http://ulvia-provider:5103",
        manifest: {
            name: "Test Provider",
            version: "1.0.0",
            requires: [
                {
                    contractId: "ulvia/cms.observability",
                    capabilityId: "logs.append",
                    versionRange: parseVersionRange("^1.0.0", "$.requires[0].versionRange"),
                    optional: true,
                },
            ],
            implementations: [],
        },
        report: {
            providerId: "test/provider",
            account: { id: "remote-account", label: "Remote" },
            implementations: [{ contractId: "test/content", version: "1.0.0", digest, status: "ready" as const }],
        },
    };
    const output = {
        ticket: "owned-ticket",
        operation: "connect",
        providerId: peer.report.providerId,
        accountId: peer.report.account.id,
        accountLabel: "Remote",
        endpoint: peer.endpoint,
        providerName: "Test Provider",
        manifestVersion: "1.0.0",
        manifestDigest: digest,
        contracts: [{ contractId: "test/content", version: "1.0.0", status: "ready" }],
        requests: peer.manifest.requires,
        authorityDigest: digest,
    };
    expect(assertPreview(output, peer, false)).toBe(output);
    expect(() => assertPreview(output, peer, true)).toThrow();
    for (const change of [
        { accountId: "another-account" },
        { providerId: "foreign/provider" },
        { manifestDigest: `sha256:${"b".repeat(64)}` },
        { contracts: [] },
        { requests: [] },
        { endpoint: "https://ulvia.fr" },
        { authorityDigest: "missing" },
        { ticket: "" },
        { check: peer.token },
    ]) {
        expect(() => assertPreview({ ...output, ...change }, peer, false)).toThrow();
    }
});

test("connection administration must preserve the selected Provider pins and selection revision", () => {
    const before = {
        selections: [{ contractId: "test/content", installationId: "native", digest: "exact" }],
        selectionRevision: 4,
    };
    expect(() => assertSelectionUnchanged(before, structuredClone(before))).not.toThrow();
    expect(() => assertSelectionUnchanged(before, { ...before, selections: [] })).toThrow();
    expect(() => assertSelectionUnchanged(before, { ...before, selectionRevision: 5 })).toThrow();
});

test("immutable manifest import allows refreshed observations while refusing approval, selection or identity mutations", () => {
    const row = {
        id: "native",
        accountId: "owned",
        endpoint: "http://provider.localhost",
        status: "enabled",
        manifestVersion: "1.0.0",
        revision: 1,
        observedAt: "2026-11-18T00:00:00Z",
    };
    const before = {
        selections: [{ installationId: "native", digest: "exact" }],
        selectionRevision: 1,
        installations: [row],
    };
    const refreshed = { ...row, revision: 2, observedAt: "2026-11-18T00:00:31Z" };
    expect(() => assertApprovalStateUnchanged(before, { ...before, installations: [refreshed] })).not.toThrow();
    for (const patch of [
        { id: "foreign" },
        { accountId: "foreign" },
        { endpoint: "http://other.localhost" },
        { status: "disabled" },
        { manifestVersion: "1.1.0" },
        { revision: 0 },
    ]) {
        expect(() =>
            assertApprovalStateUnchanged(before, { ...before, installations: [{ ...refreshed, ...patch }] }),
        ).toThrow();
    }
    expect(() => assertApprovalStateUnchanged(before, { ...before, installations: [] })).toThrow();
    expect(() => assertApprovalStateUnchanged(before, { ...before, selectionRevision: 2 })).toThrow();
});
