import { expect, test } from "bun:test";
import { admitCollectionRelease } from "cms-repository/collections/core/admission/admitCollectionRelease";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "cms-repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { bootstrapCollection } from "./fixture";

test("all Pages in one recipe need a joint non-yanked contract witness", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    for (const version of ["1.0.0", "2.0.0"]) {
        await catalogue.publish(
            await admitContractRelease({
                kind: "contract",
                protocol: "ulvia-provider/v1",
                schemaDialect: "ulvia-schema/v1",
                contractId: "ulvia/catalog",
                publisherId: "ulvia",
                name: "Catalog",
                version,
                capabilities: [
                    {
                        id: "items.list",
                        access: "admin",
                        behavior: { effect: "query", execution: "sync", sensitive: false },
                        input: { type: "object", properties: {}, required: [] },
                        output: { type: "null" },
                        errors: [],
                        bindings: [{ id: "mcp", transport: "mcp" }],
                    },
                ],
            }),
        );
    }
    const source = bootstrapCollection();
    const requires = (versionRange: string) => [
        { contractId: "ulvia/catalog", capabilityId: "items.list", versionRange },
    ];
    source.bootstraps[0].requires = requires("^1.0.0");
    const example = source.examples.find((item: { id: string }) => item.id === "assembled");
    example.requires = requires("^2.0.0");
    const before = JSON.stringify(source);
    await expect(admitCollectionRelease(source, [], { contracts: catalogue })).rejects.toMatchObject({
        code: "resolution_failed",
        path: "$.bootstraps.admin.requires",
    });
    expect(JSON.stringify(source)).toBe(before);
    example.requires = requires("^1.0.0");
    await expect(admitCollectionRelease(source, [], { contracts: catalogue })).resolves.toBeDefined();
    await catalogue.setYank("ulvia/catalog", "1.0.0", { reason: "Unavailable for new resolution" });
    await expect(admitCollectionRelease(source, [], { contracts: catalogue })).rejects.toMatchObject({
        code: "resolution_failed",
    });
});
