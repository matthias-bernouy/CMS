import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const versionRoot = resolve(import.meta.dir, "../../../../integrations/domains/sales-configurator/versions/1.0.0");

describe("sales catalogue selection contract", () => {
    test("keeps starter and builder on the same compact searchable table hooks", async () => {
        for (const tag of ["sales-proposal-starter", "sales-proposal-builder"]) {
            const content = await Bun.file(resolve(versionRoot, `blocs/${tag}/default.html`)).text();
            const view = await Bun.file(resolve(versionRoot, `blocs/${tag}/Bloc.ts`)).text();

            expect(content).toContain("<table data-sales-catalog-table");
            expect(content).toContain('cms-repeat="catalogData.selectionRows as row"');
            expect(content).toContain("data-sales-catalog-search");
            expect(content).toContain("data-sales-module-toggle");
            expect(content).toContain("data-sales-module-selected-label");
            expect(content).toContain('data-sales-variant data-module-id="{{ row.moduleId }}"');
            expect(content).toContain('data-sales-feature data-module-id="{{ row.moduleId }}"');
            expect(content).not.toContain('cms-repeat="catalogData.modules as module"');
            expect(view).toContain('event.key !== "Escape"');
            expect(view).toContain("expandedModuleIds");
            expect(view).toContain("normalizeSearch");
            expect(view).not.toMatch(/\bfetch\s*\(/);
        }
    });

    test("declares the additive flat selection row response shape", async () => {
        const endpoints = (await readJson(
            "definitions/artifacts/sources/primary/endpoints/partner/catalog/root.json",
        )) as Array<{ output: Array<{ status: string; body: Record<string, unknown> }> }>;
        const rowShape = await readJson(
            "definitions/artifacts/sources/primary/shapes/catalog/partner/selection-row.json",
        );
        const success = endpoints[0]!.output.find((output) => output.status === "200")!;
        const body = success.body as {
            required: string[];
            properties: { selectionRows: { items: { $include: string } } };
        };
        const shape = rowShape as { required: string[]; properties: Record<string, unknown> };

        expect(body.required).toEqual(["modules", "selectionRows"]);
        expect(body.properties.selectionRows.items.$include).toBe("../../../shapes/catalog/partner/selection-row.json");
        expect(shape.required).toEqual(
            expect.arrayContaining([
                "kind",
                "depth",
                "id",
                "moduleId",
                "availability",
                "availabilityLabel",
                "requirements",
            ]),
        );
        expect(shape.properties).toMatchObject({
            variantId: { type: "number", nullable: true },
            providerName: { type: "string", nullable: true },
            pricingMode: { type: "string", nullable: true },
            unitAmountCents: { type: "number", nullable: true },
            currency: { type: "string", nullable: true },
            requirements: {
                type: "array",
                items: { $include: "../requirement.json" },
            },
        });
    });
});

async function readJson(path: string): Promise<unknown> {
    return Bun.file(resolve(versionRoot, path)).json();
}
