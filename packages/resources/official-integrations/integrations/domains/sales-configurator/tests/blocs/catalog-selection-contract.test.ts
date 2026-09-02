import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const versionRoot = resolve(import.meta.dir, "../..");

describe("sales catalogue selection contract", () => {
    test("reserves data attributes for behavior and scopes fallback styles", async () => {
        for (const tag of [
            "sales-catalog-browser",
            "sales-client-directory",
            "sales-proposal-builder",
            "sales-proposal-list",
            "sales-proposal-starter",
            "sales-proposal-view",
        ]) {
            const blocRoot = resolve(versionRoot, `blocs/${tag}`);
            const content = await Bun.file(resolve(blocRoot, "default.html")).text();
            const sources: string[] = [];
            for await (const path of new Bun.Glob("*.ts").scan({ cwd: blocRoot, absolute: true })) {
                if (!path.endsWith("BlocEditor.ts")) {
                    sources.push(await Bun.file(path).text());
                }
            }
            const controllerSource = sources.join("\n");
            const fallbackStyles = content.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
            const dataHooks = new Set(
                Array.from(content.matchAll(/\b(data-sales-[a-z0-9-]+)(?=[\s=>])/g), (match) => match[1]),
            );

            for (const hook of dataHooks) {
                expect(controllerSource).toMatch(new RegExp(`${hook}(?:[^a-z0-9-]|$)`));
            }
            for (const rule of fallbackStyles.split("\n").filter((line) => line.includes("{"))) {
                expect(rule.trim().startsWith(`:where(${tag})`)).toBe(true);
            }
            const baseToggleRule = fallbackStyles.indexOf("[data-sales-module-toggle] { display: inline-flex;");
            if (baseToggleRule >= 0) {
                const hiddenToggleRule = fallbackStyles.indexOf(
                    "[data-sales-module-toggle][hidden] { display: none; }",
                );
                expect(hiddenToggleRule).toBeGreaterThan(baseToggleRule);
                expect(controllerSource).toContain("[data-sales-money], [data-sales-module-counts]");
            }
            expect(controllerSource).not.toContain('setAttribute("aria-disabled"');
        }
    });

    test("keeps starter and builder on the same compact searchable table hooks", async () => {
        for (const tag of ["sales-proposal-starter", "sales-proposal-builder"]) {
            const content = await Bun.file(resolve(versionRoot, `blocs/${tag}/default.html`)).text();
            const view = await Bun.file(resolve(versionRoot, `blocs/${tag}/Bloc.ts`)).text();

            expect(content).toContain('<table class="sales-catalog-table"');
            expect(content).toContain('cms-repeat="catalogData.selectionRows as row"');
            expect(content).toContain("data-sales-catalog-search");
            expect(content).toContain("data-sales-module-toggle");
            expect(content).toContain("data-sales-collapsed-label");
            expect(content).toContain("data-sales-expanded-label");
            expect(content).toContain("data-sales-module-selected-label");
            expect(content).toContain("data-sales-module-counts");
            expect(content).toContain('class="sales-kind-badge"');
            expect(content).toContain('class="sales-availability-badge"');
            expect(content).toContain("sales-service-cell");
            expect(content).toContain("sales-choice-cell");
            expect(content).toContain("min-width: 48rem");
            expect(content).toContain("grid-template-columns: minmax(0, 1fr)");
            expect(content).toContain(".sales-service-cell > small:not([hidden])");
            expect(content).toContain('<th scope="col">Service</th>');
            expect(content).toContain('<th scope="col">Selection</th>');
            expect(content).not.toContain('<th scope="col">Type</th>');
            expect(content).not.toContain('<th scope="col">Availability</th>');
            expect(content).not.toContain('appearance="text"');
            expect(content).toContain('data-sales-variant data-module-id="{{ row.moduleId }}"');
            expect(content).toContain('data-sales-feature data-module-id="{{ row.moduleId }}"');
            expect(content).not.toContain('cms-repeat="catalogData.modules as module"');
            expect(view).toContain('event.key !== "Escape"');
            expect(view).toContain("expandedModuleIds");
            expect(view).toContain("normalizeSearch");
            expect(view).toContain("rowsMatchingCatalogQuery");
            expect(view).toContain('row.toggleAttribute("data-sales-selected", selected)');
            expect(view).not.toContain('row.toggleAttribute("data-sales-disabled"');
            expect(view).not.toContain('row.toggleAttribute("data-sales-expanded", expanded)');
            expect(view).not.toContain('row.toggleAttribute("data-sales-module-selected"');
            expect(view).not.toContain('setAttribute("aria-disabled"');
            expect(view).not.toMatch(/\bfetch\s*\(/);
        }

        const starter = await Bun.file(resolve(versionRoot, "blocs/sales-proposal-starter/default.html")).text();
        const builder = await Bun.file(resolve(versionRoot, "blocs/sales-proposal-builder/default.html")).text();
        for (const content of [starter, builder]) {
            expect(content).not.toContain("data-sales-danger-action");
            expect(content).not.toContain("data-sales-form-layout");
            expect(content).not.toContain("data-sales-action-form");
            expect(content).not.toContain("data-sales-depth");
            expect(content).toContain(":has(basic-checkbox[data-sales-feature][disabled])");
            expect(content).toContain(':has([data-sales-module-toggle][aria-expanded="true"])');
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
