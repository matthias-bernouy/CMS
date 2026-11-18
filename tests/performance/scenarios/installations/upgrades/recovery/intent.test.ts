import { expect, test } from "bun:test";
import { catalogueRevision } from "@bernouy/ulvia-contracts/protocol";
import { preparedContractIntent } from "./intent";
import { assertUpgradeSeedScope } from "../../recovery/scope";

test("recovery fixtures pin the exact prepared source, target, grants and logical site", async () => {
    const selection = {
        contractId: "ulvia/cms.content",
        version: "1.0.0",
        digest: `sha256:${"a".repeat(64)}`,
        installationId: "owned",
    };
    const grants = { default: "allow-selected", denied: [] };
    const original = { status: "applicable", expectedRevision: 3, selections: [selection], grants };
    const reviewed = {
        ...original,
        grants: { ...grants, denied: [{ contractId: "ulvia/cms.content", capabilityId: "site.get" }] },
        planDigest: `sha256:${"b".repeat(64)}`,
    };
    const intent = await preparedContractIntent(original, reviewed);
    expect(intent.status).toBe("prepared");
    expect(intent.siteId).toBe("default");
    expect(intent.sourceStateDigest).toBe(
        await catalogueRevision({ revision: 3, selections: [{ ...selection, siteId: "default" }], grants }),
    );
    expect(intent.targetStateDigest).toBe(
        await catalogueRevision({
            revision: 4,
            selections: [{ ...selection, siteId: "default" }],
            grants: reviewed.grants,
        }),
    );
    expect(intent.id).toBe(
        await catalogueRevision({ siteId: "default", kind: "contracts", planDigest: reviewed.planDigest }),
    );
    await expect(preparedContractIntent(original, { ...reviewed, expectedRevision: 4 })).rejects.toThrow();
    await expect(preparedContractIntent(original, { ...reviewed, planDigest: "invalid" })).rejects.toThrow();
    await expect(preparedContractIntent(original, { ...reviewed, status: "blocked" })).rejects.toThrow();
    await expect(preparedContractIntent(original, { ...reviewed, grants })).rejects.toThrow();
    await expect(
        preparedContractIntent(original, { ...reviewed, selections: [{ ...selection, installationId: "foreign" }] }),
    ).rejects.toThrow();
});

test("recovery seeding refuses production, shared and foreign fixture scopes before opening storage", () => {
    const args = [
        "ulvia-mcp-aabbccdd",
        "ulvia-mcp-aabbccdd-provider",
        "instance:00000000-0000-4000-8000-000000000001",
        "http://perf-settings-0.localhost:3000",
    ] as const;
    expect(() => assertUpgradeSeedScope(...args)).not.toThrow();
    for (const origin of [
        "https://ulvia.fr",
        "http://site.localhost",
        `${args[3]}/path`,
        `${args[3]}?token=x`,
        args[3].replace("http://", "http://x:y@"),
    ]) {
        expect(() => assertUpgradeSeedScope(args[0], args[1], args[2], origin)).toThrow();
    }
    expect(() => assertUpgradeSeedScope(args[0], "foreign-provider", args[2], args[3])).toThrow();
    expect(() => assertUpgradeSeedScope(args[0], args[1], "foreign-instance", args[3])).toThrow();
});
