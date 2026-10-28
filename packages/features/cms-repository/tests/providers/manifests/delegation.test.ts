import { compareProviderManifests } from "@bernouy/cms-repository/providers/compatibility";
import { expect, test } from "bun:test";
import { admitProviderManifest, parseProviderManifest, delegationAllows } from "@bernouy/cms-repository/providers";
import { contractDocument, implementation, manifestDocument, releaseCatalogue } from "../support/fixtures";

const rule = { contractId: "*", capabilityId: "*", effect: "query", sensitive: false };
async function fixture() {
    const catalogue = await releaseCatalogue(contractDocument("example.content", "render"));
    const release = (await catalogue.get("example.content", "1.0.0"))!.admission;
    const document = (delegation: unknown) =>
        manifestDocument([{ ...implementation("example.content", "1.0.0", release.digest), delegation }]);
    return { catalogue, document };
}
test("delegation sources are validated, target selectors do not create dependencies", async () => {
    const { catalogue, document } = await fixture();
    const policy = {
        sources: ["render"],
        allow: [{ ...rule, contractId: "unknown.future", capabilityId: "future.read" }],
    };
    await expect(admitProviderManifest(document(policy), catalogue)).resolves.toBeDefined();
    await expect(admitProviderManifest(document({ ...policy, sources: ["missing"] }), catalogue)).rejects.toThrow(
        "unknown delegation source",
    );
    await expect(admitProviderManifest(document({ ...policy, sources: ["*"] }), catalogue)).resolves.toBeDefined();
});
test("closed delegation syntax rejects partial wildcards, duplicate selectors and removed kind/batch fields", async () => {
    const { document } = await fixture();
    for (const policy of [
        { sources: [], allow: [rule] },
        { sources: ["*", "render"], allow: [rule] },
        { sources: ["render", "render"], allow: [rule] },
        { sources: ["render"], allow: [] },
        { sources: ["render"], allow: [rule, rule] },
        ...[
            { contractId: "example.*" },
            { capabilityId: "read*" },
            { effect: "batch" },
            { sensitive: "false" },
            { kind: "capability" },
            { batch: true },
        ].map((change) => ({ sources: ["render"], allow: [{ ...rule, ...change }] })),
    ]) {
        expect(() => parseProviderManifest(document(policy))).toThrow();
    }
});
test("delegation changes participate in manifest comparison and digest approval", async () => {
    const { catalogue, document } = await fixture();
    const before = await admitProviderManifest(document({ sources: ["render"], allow: [rule] }), catalogue);
    const after = await admitProviderManifest(
        { ...document({ sources: ["*"], allow: [{ ...rule, effect: "*" }] }), version: "1.1.0" },
        catalogue,
    );
    expect(await compareProviderManifests(before, after)).toMatchObject({
        requiresApproval: true,
        changes: expect.arrayContaining([expect.objectContaining({ category: "delegation" })]),
    });
});
test("selectors preserve query purity constraints and exact sensitivity matching", () => {
    const query = { id: "read", behavior: { effect: "query" as const, execution: "sync" as const, sensitive: false } };
    const command = {
        id: "write",
        behavior: {
            effect: "command" as const,
            execution: "sync" as const,
            idempotency: "natural" as const,
            sensitive: true,
        },
    };
    const policy = { sources: ["*"], allow: [{ contractId: "*", capabilityId: "*", effect: "*" as const }] };
    expect(delegationAllows(policy, query, "any.contract", command)).toBe(false);
    expect(delegationAllows(policy, command, "any.contract", query)).toBe(true);
    expect(
        delegationAllows(
            { ...policy, allow: [{ ...policy.allow[0]!, sensitive: true }] },
            command,
            "any.contract",
            query,
        ),
    ).toBe(false);
    expect(delegationAllows(undefined, command, "any.contract", query)).toBe(false);
});
