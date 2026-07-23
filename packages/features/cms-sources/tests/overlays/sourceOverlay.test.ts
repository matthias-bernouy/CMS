import { describe, expect, test } from "bun:test";
import {
    applySourceOverlays,
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    projectStrictDataShape,
    SourceOverlaySourceRepository,
} from "@bernouy/cms-sources";
import { overlay, source } from "../helpers/sourceOverlayFixtures";

describe("source overlays", () => {
    test("adds extra fields to input and output endpoint shapes", () => {
        const enriched = applySourceOverlays(source, [overlay]);
        const getAccount = enriched.endpoints.find((endpoint) => endpoint.urn.endsWith(":getAccount"))!;
        const listAccounts = enriched.endpoints.find((endpoint) => endpoint.urn.endsWith(":listAccounts"))!;
        const updateAccount = enriched.endpoints.find((endpoint) => endpoint.urn.endsWith(":updateAccount"))!;

        expect(getAccount.output?.[0]?.body).toMatchObject({
            properties: {
                metadata: {
                    properties: {
                        company: { type: "string" },
                        employeeCount: { type: "number" },
                    },
                },
            },
        });
        expect(listAccounts.output?.[0]?.body).toMatchObject({
            properties: {
                accounts: {
                    items: {
                        properties: {
                            metadata: {
                                properties: {
                                    company: { type: "string" },
                                },
                            },
                        },
                    },
                },
            },
        });
        expect(updateAccount.input?.body).toMatchObject({
            properties: {
                metadata: {
                    properties: {
                        employeeCount: { type: "number" },
                    },
                },
            },
        });
    });

    test("represents multiple overlay fields as arrays in direct and list outputs", () => {
        const enriched = applySourceOverlays(source, [
            {
                ...overlay,
                fields: [{ id: "company", label: "Company", type: "string", multiple: true }],
            },
        ]);
        const getAccount = enriched.endpoints.find((endpoint) => endpoint.urn.endsWith(":getAccount"))!;
        const listAccounts = enriched.endpoints.find((endpoint) => endpoint.urn.endsWith(":listAccounts"))!;

        const expected = {
            type: "array",
            items: { type: "string" },
            title: "Company",
        };
        expect(getAccount.output?.[0]?.body?.properties?.metadata?.properties?.company).toEqual(expected);
        expect(
            listAccounts.output?.[0]?.body?.properties?.accounts?.items?.properties?.metadata?.properties?.company,
        ).toEqual(expected);
    });

    test("preserves nullability when an overlay targets an existing output field", () => {
        const nullableSource = structuredClone(source);
        const output = nullableSource.endpoints.find((endpoint) => endpoint.urn.endsWith(":getAccount"))?.output?.[0];
        if (!output?.body) {
            throw new Error("Missing getAccount output");
        }
        output.body.properties = {
            ...output.body.properties,
            metadata: {
                type: "object",
                properties: {
                    company: { type: "string", nullable: true },
                },
            },
        };

        const enriched = applySourceOverlays(nullableSource, [overlay]);
        const shape = enriched.endpoints.find((endpoint) => endpoint.urn.endsWith(":getAccount"))?.output?.[0]?.body;
        if (!shape) {
            throw new Error("Missing enriched getAccount output");
        }

        expect(shape.properties?.metadata?.properties?.company).toEqual({
            type: "string",
            title: "Company",
            nullable: true,
        });
        expect(projectStrictDataShape({ metadata: { company: null } }, shape)).toEqual({
            metadata: { company: null },
        });
    });

    test("admits null for added nullable fields and their created object parents", () => {
        const enriched = applySourceOverlays(source, [
            {
                ...overlay,
                fields: [
                    { id: "brandId", label: "Brand id", type: "number", path: "brandId", nullable: true },
                    { id: "brandName", label: "Brand", type: "string", path: "brand.name", nullable: true },
                ],
            },
        ]);
        const shape = enriched.endpoints.find((endpoint) => endpoint.urn.endsWith(":getAccount"))?.output?.[0]?.body;
        if (!shape) {
            throw new Error("Missing enriched getAccount output");
        }

        expect(shape.properties?.brandId).toEqual({
            type: "number",
            title: "Brand id",
            nullable: true,
        });
        expect(shape.properties?.brand).toEqual({
            type: "object",
            nullable: true,
            properties: {
                name: {
                    type: "string",
                    title: "Brand",
                    nullable: true,
                },
            },
        });
        expect(projectStrictDataShape({ brandId: null, brand: null }, shape)).toEqual({
            brandId: null,
            brand: null,
        });
    });

    test("wraps a source repository without changing writes", async () => {
        const inner = new InMemorySourceRepository();
        const overlays = new InMemorySourceOverlayRepository();
        await inner.createSource(source);
        await overlays.upsertOverlay(overlay);

        const repo = new SourceOverlaySourceRepository(inner, overlays);

        expect((await inner.getSource("urn:user-account"))?.endpoints[0]?.output?.[0]?.body).not.toMatchObject({
            properties: { metadata: {} },
        });
        expect((await repo.getEndpoint("urn:user-account:getAccount"))?.output?.[0]?.body).toMatchObject({
            properties: {
                metadata: {
                    properties: {
                        company: { type: "string" },
                    },
                },
            },
        });
    });
});
