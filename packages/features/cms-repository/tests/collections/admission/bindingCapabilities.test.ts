import { collectionFixture } from "./examples/buildFixture";
import { expect, test } from "bun:test";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { collectionDocument } from "../fixtures";
import { contractDocument, releaseCatalogue } from "../../providers/support/fixtures";

test("collection query outputs are safe across every release accepted by their range", async () => {
    const first = queryContract("1.0.0");
    const second = queryContract("1.1.0");
    const output = (second.capabilities as Record<string, unknown>[])[0]!.output as Record<string, unknown>;
    (output.properties as Record<string, unknown>).extra = { type: "string", maxLength: 128 };
    (output.required as string[]).push("extra");
    const contracts = await releaseCatalogue(first, second);

    await expect(
        admitCollectionRelease(collectionFixture(collection("id", "^1.0.0")), [], { contracts }),
    ).resolves.toBeDefined();
    await expect(
        admitCollectionRelease(collectionFixture(collection("extra", "^1.0.0")), [], { contracts }),
    ).rejects.toThrow("is not declared by the output schema");
    await expect(
        admitCollectionRelease(collectionFixture(collection("extra", ">=1.1.0 <2.0.0")), [], { contracts }),
    ).resolves.toBeDefined();
});

function queryContract(version: string): Record<string, unknown> {
    const contract = contractDocument("catalog.items", "item.list", version);
    const capability = (contract.capabilities as Record<string, unknown>[])[0]!;
    capability.behavior = { effect: "query", execution: "sync" };
    (capability.bindings[0] as Record<string, unknown>).method = "QUERY";
    return contract;
}

function collection(field: string, versionRange: string): Record<string, unknown> {
    const source = collectionDocument();
    (source.blocs as Record<string, unknown>[]).push({
        description: "bloc.page.label",
        categories: ["bloc.page.label"],

        kind: "composition",
        root: { accepts: ["div"] },
        id: "atlas-catalog",
        label: "bloc.page.label",
        markup: `<section cms-query="catalog.items:item.list as items">
            <div cms-match="items.outcome.kind">
                <div cms-case='"none"'></div>
                <p cms-case='"success"'>{{ items.data.${field} }}</p>
                <p cms-case='"failure"'>{{ items.outcome.code }}</p>
            </div>
        </section>`,
        slots: {},
        uses: [],
        requires: [{ contractId: "catalog.items", capabilityId: "item.list", versionRange }],
    });
    return source;
}
