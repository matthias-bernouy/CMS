import { mountInstallations } from "./mount";
import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { parseUlviaSchema, validateSchemaValue } from "@bernouy/ulvia-contracts/schema";

const context = {
    siteId: "site:one",
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.1.0",
    providerId: "ulvia/primary-provider",
};
const digest = `sha256:${"a".repeat(64)}`;
const selection = { installationId: "provider:one", contractId: "ulvia/catalog", version: "1.0.0", digest };

test("contract plan projections match their wire schema and retain explicit source and target pins", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let captured: unknown;
    await mountInstallations(
        dispatcher,
        {
            gateway: {
                contractUpgrades: {
                    plan: async (siteId: string, selections: unknown) => {
                        captured = selections;
                        return {
                            status: "applicable",
                            planDigest: digest,
                            expectedRevision: 1,
                            source: [{ ...selection, siteId }],
                            selections,
                            grants: { default: "allow-selected", denied: [] },
                            issues: [],
                            authority: { providers: [], capabilities: [], machine: [], delegated: [] },
                            authorityAdded: [],
                            usageRevision: digest,
                        };
                    },
                },
            } as never,
        },
        { context },
    );
    const result = (await dispatcher.invoke(
        "ulvia/cms.installations",
        "plan-contract-upgrade",
        { selections: [selection] },
        context,
    )) as Record<string, unknown>;
    expect(captured).toEqual([{ ...selection, siteId: context.siteId }]);
    expect(result.source).toEqual([selection]);
    expect(result.selections).toEqual([selection]);
    const definition = await Bun.file(
        new URL(
            "../../../../../official-repository/contracts/cms.installations/capabilities/queries/plan-contract-upgrade.json",
            import.meta.url,
        ),
    ).json();
    validateSchemaValue(parseUlviaSchema(definition.output), result);
});

test("usage pagination binds cursors to the analysed revision and exposes no Page bodies", async () => {
    let revision = digest;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountInstallations(
        dispatcher,
        {
            collectionUpgrades: {
                inventory: async () => ({
                    digest: revision,
                    complete: true,
                    unknown: [],
                    references: ["page:one", "page:two"].map((location) => ({
                        type: "capability",
                        contractId: "ulvia/catalog",
                        capabilityId: "read",
                        location,
                        scope: "runtime",
                    })),
                }),
            },
        } as never,
        { context },
    );
    const first = (await dispatcher.invoke(
        "ulvia/cms.installations",
        "list-site-usage",
        { limit: 1 },
        context,
    )) as Record<string, unknown>;
    expect(first.total).toBe(2);
    expect(first.references).toHaveLength(1);
    const second = (await dispatcher.invoke(
        "ulvia/cms.installations",
        "list-site-usage",
        { cursor: first.cursor, limit: 1 },
        context,
    )) as Record<string, unknown>;
    expect(second.references).toEqual([expect.objectContaining({ location: "page:two" })]);
    expect(second).not.toHaveProperty("cursor");
    const definition = await Bun.file(
        new URL(
            "../../../../../official-repository/contracts/cms.installations/capabilities/queries/list-site-usage.json",
            import.meta.url,
        ),
    ).json();
    validateSchemaValue(parseUlviaSchema(definition.output), first);
    revision = `sha256:${"b".repeat(64)}`;
    await expect(
        dispatcher.invoke("ulvia/cms.installations", "list-site-usage", { cursor: first.cursor }, context),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
});
