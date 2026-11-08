import { expect, test } from "bun:test";
import { admitContractRelease, resolveContract } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import {
    createProviderHandler,
    compileProviderRoutes,
    DefaultProviderCapabilityDispatcher,
} from "@bernouy/cms-gateway/provider/server";
import { gatewayRoute } from "../../fixtures";

test("a standalone specialization serves its declaring parent's pinned route", async () => {
    const base = (await gatewayRoute()).release.admission;
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.publish(base);
    const child = await admitContractRelease({
        ...base.release,
        contractId: "ulvia/catalog.sql",
        version: "2.0.0",
        extends: { contractId: base.release.contractId, version: base.release.version, digest: base.digest },
        capabilities: [
            {
                ...base.release.capabilities[0],
                id: "sql.configure",
                bindings: [{ ...base.release.capabilities[0]!.bindings[0], path: "/configure" }],
            },
        ],
    });
    await catalogue.publish(child);
    const contract = await resolveContract(catalogue, child);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    dispatcher.register("ulvia/catalog.sql", "item.list", async (_input, context) => {
        expect(context.contractVersion).toBe("1.0.0");
        return { items: ["inherited"] };
    });
    dispatcher.register("ulvia/catalog.sql", "sql.configure", async () => ({ items: ["own"] }));
    const requestId = crypto.randomUUID();
    const handler = createProviderHandler({
        contracts: [contract],
        dispatcher,
        authenticate: async () => ({
            siteId: "site-a",
            providerId: "ulvia/sql",
            claims: {
                version: 1,
                requestId,
                instanceId: "instance",
                contractId: "ulvia/catalog",
                contractVersion: "1.0.0",
                capabilityId: "item.list",
                issuedAt: 0,
                expiresAt: 1,
            },
        }),
    });
    const response = await handler(
        new Request("https://provider.test/v1/items", { headers: { "x-ulvia-request-id": requestId } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: ["inherited"] });
    const otherAdmission = await admitContractRelease({ ...child.release, contractId: "ulvia/catalog.other" });
    await catalogue.publish(otherAdmission);
    const other = await resolveContract(catalogue, otherAdmission);
    expect(() => compileProviderRoutes([contract, other])).toThrow("Ambiguous inherited");
    const declaring = await resolveContract(catalogue, base);
    expect(() => compileProviderRoutes([contract, other, declaring])).not.toThrow();
});
