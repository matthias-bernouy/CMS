import { describe, expect, test } from "bun:test";
import { InMemoryFunctionRepository, withFunctionsSource } from "@bernouy/cms-functions";
import {
    CompositeSourceRepository,
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    readPersistedSource,
    SourceOverlaySourceRepository,
    ValidatingSourceRepository,
    type Source,
} from "@bernouy/cms-sources";

const source: Source = {
    urn: "urn:commerce",
    identityAuthority: "commerce",
    endpoints: [
        {
            urn: "urn:commerce:product",
            method: "GET",
            targetUrl: "https://commerce.example.test/product",
            output: [{ status: "200", body: { type: "object", properties: { id: { type: "string" } } } }],
        },
    ],
};

describe("FunctionAwareSourceRepository persisted reads", () => {
    test("bypasses projections through the production repository decorator stack", async () => {
        const stored = new InMemorySourceRepository();
        await stored.createSource(source);
        const overlays = new InMemorySourceOverlayRepository();
        await overlays.upsertOverlay({
            id: "commerce-brand",
            sourceId: "commerce",
            output: [{ endpointId: "product" }],
            fields: [{ id: "brand", label: "Brand", type: "string", path: "brand" }],
        });
        const validated = new ValidatingSourceRepository(stored);
        const composite = new CompositeSourceRepository(validated);
        const effective = new SourceOverlaySourceRepository(composite, overlays);
        const repository = withFunctionsSource(effective, new InMemoryFunctionRepository());

        expect((await repository.getSource(source.urn))?.endpoints[0]?.output?.[0]?.body?.properties?.brand).toEqual({
            type: "string",
            title: "Brand",
        });
        expect(
            (await readPersistedSource(repository, source.urn))?.endpoints[0]?.output?.[0]?.body?.properties?.brand,
        ).toBeUndefined();
        expect(await readPersistedSource(repository, source.urn)).toEqual(source);
    });
});
