import { Buffer, File } from "node:buffer";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { BindingCore, BINDING_CORE_TAG } from "@bernouy/components/binding";

const tag = "test-sales-proposal-starter";
const versionRoot = resolve(import.meta.dir, "../../../../integrations/domains/sales-configurator/versions/1.0.0");
const blocRoot = resolve(versionRoot, "blocs/sales-proposal-starter");
const artifactPath = resolve(versionRoot, "definitions/artifacts/blocs/sales-proposal-starter.json");
const realFetch = globalThis.fetch;

beforeAll(async () => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
    if (!customElements.get(tag)) {
        const compiled = await compileStarter();
        new Function(compiled.viewJS)();
    }
});

beforeEach(() => {
    location.href = "http://localhost/";
});

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("sales proposal starter", () => {
    test("is a compilable light-DOM binding bloc", async () => {
        const manifest = JSON.parse(await read("manifest.json"));
        const artifact = JSON.parse(await Bun.file(artifactPath).text());
        const view = await read("Bloc.ts");
        const content = await read("default.html");
        const compiled = await compileStarter("contract-sales-proposal-starter");

        expect(manifest).toMatchObject({
            "default-tag": "sales-proposal-starter",
            bloc: "./Bloc.ts",
            editor: "./BlocEditor.ts",
            defaultContent: "./default.html",
        });
        expect(artifact).toMatchObject({
            type: "bloc",
            bloc: { tag: "sales-proposal-starter", path: "blocs/sales-proposal-starter" },
        });
        expect(view).toContain("extends HTMLElement");
        expect(view).not.toMatch(/\bfetch\s*\(/);
        expect(view).not.toContain("location.");
        expect(content).not.toContain("<cms-binding-core");
        expect(view).toContain("/listMyClients?limit=");
        expect(content).toContain("/saveMyClient as clientResult");
        expect(content).toContain('name="companyRegistrationNumber"');
        expect(content).toContain('name="contactJobTitle"');
        expect(content).toContain('name="addressLine1"');
        expect(content).toContain('name="postalCode"');
        expect(content).toContain('name="city"');
        expect(content).toContain('name="country"');
        expect(content).toContain("Add another client");
        expect(content).toContain("<dialog data-sales-client-create-dialog");
        expect(content).toContain("data-sales-client-create-open");
        expect(content).toContain("data-sales-client-dialog-close");
        expect(content).toContain("/getPartnerCatalog as catalogData");
        expect(content).toContain('cms-repeat="catalogData.selectionRows as row"');
        expect(content).toContain("<table data-sales-catalog-table");
        expect(content).toContain("data-sales-catalog-search");
        expect(content).toContain("data-sales-module-toggle");
        expect(content).toContain("/saveMyProposalDraft as saveResult");
        expect(content).not.toMatch(/name="id"/);
        expect(compiled.viewJS).toContain('customElements.define("contract-sales-proposal-starter"');
    });

    test("wires sources, enforces variant context, and builds a create payload", async () => {
        const starter = document.createElement(tag);
        starter.setAttribute("source-id", "partner-sales");
        starter.setAttribute("client-limit", "250");
        starter.setAttribute("edit-path", "/sales/proposal?tab=offer#details");
        starter.setAttribute("proposal-param", "id");
        starter.innerHTML = `
            <section data-sales-catalog-source></section>
            <form data-sales-client-form></form>
            <form data-sales-create-form>
                <input name="clientId" value="7">
                <input name="title" value="Restaurant booking">
                <input type="checkbox" data-sales-variant data-module-id="1" data-catalog-id="11">
                <input type="checkbox" data-sales-variant data-module-id="1" data-catalog-id="13">
                <input type="checkbox" data-sales-feature data-module-id="1" data-variant-id="11" data-catalog-id="12">
                <textarea data-sales-custom-request>Custom integration</textarea>
                <div data-sales-custom-requests></div>
                <button data-sales-add-request type="button">Add request</button>
                <template data-sales-request-template>
                    <div data-sales-custom-request-row>
                        <textarea data-sales-custom-request></textarea>
                        <button data-sales-remove-request type="button">Remove</button>
                    </div>
                </template>
            </form>
            <a data-sales-created-link data-proposal-id="42"></a>
        `;
        document.body.append(starter);
        await settle();

        expect(starter.getAttribute("cms-source")).toBe(
            "/.cms/sources/partner-sales/listMyClients?limit=100 as clientsData",
        );
        expect(starter.querySelector("[data-sales-catalog-source]")?.getAttribute("cms-source")).toBe(
            "/.cms/sources/partner-sales/getPartnerCatalog as catalogData",
        );
        const form = starter.querySelector<HTMLFormElement>("[data-sales-create-form]")!;
        const clientForm = starter.querySelector<HTMLFormElement>("[data-sales-client-form]")!;
        expect(clientForm.getAttribute("cms-source")).toBe("/.cms/sources/partner-sales/saveMyClient as clientResult");
        expect(clientForm.getAttribute("cms-source-publish")).toBe("sales-clients:changed");
        expect(clientForm.getAttribute("cms-source-success-reset")).toBe("true");
        expect(form.getAttribute("cms-source")).toBe("/.cms/sources/partner-sales/saveMyProposalDraft as saveResult");
        expect(form.getAttribute("cms-source-trigger")).toBe("submit");
        expect(form.getAttribute("cms-source-method")).toBe("POST");
        expect(form.getAttribute("cms-source-publish")).toBe("sales-proposals:changed");
        expect(starter.querySelector<HTMLAnchorElement>("[data-sales-created-link]")?.getAttribute("href")).toBe(
            "/sales/proposal?tab=offer&id=42#details",
        );

        const variants = starter.querySelectorAll<HTMLInputElement>("[data-sales-variant]");
        const feature = starter.querySelector<HTMLInputElement>("[data-sales-feature]")!;
        expect(feature.disabled).toBe(true);
        variants[0]!.checked = true;
        variants[0]!.dispatchEvent(new Event("change", { bubbles: true }));
        expect(feature.disabled).toBe(false);
        feature.checked = true;
        variants[1]!.checked = true;
        variants[1]!.dispatchEvent(new Event("change", { bubbles: true }));
        expect(variants[0]!.checked).toBe(false);
        expect(feature.checked).toBe(false);
        expect(feature.disabled).toBe(true);

        starter.querySelector<HTMLElement>("[data-sales-add-request]")!.click();
        expect(starter.querySelectorAll("[data-sales-custom-request-row]")).toHaveLength(1);
        starter.querySelector<HTMLElement>("[data-sales-remove-request]")!.click();
        expect(starter.querySelectorAll("[data-sales-custom-request-row]")).toHaveLength(0);

        variants[0]!.checked = true;
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        expect(form.querySelector('input[name="id"]')).toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="selections"]')?.value).toBe(
            JSON.stringify({ variantItemId: 11, optionalFeatureItemIds: [] }),
        );
        expect(form.querySelector<HTMLInputElement>('input[name="customRequests"]')?.value).toBe(
            JSON.stringify({ label: "Custom integration", description: null, quantity: 1 }),
        );
    });

    test("editor-disabled preview does not start network work", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return Response.json({});
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.setAttribute("cms-binding-disabled", "");
        core.setAttribute("cms-source-state-force", "loading");
        core.innerHTML = (await read("default.html")).replaceAll("sales-proposal-starter", tag);
        document.body.append(core);
        await settle();

        expect(calls).toBe(0);
    });

    test("keeps client creation available after the first client exists", async () => {
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const path = new URL(String(input), location.href).pathname;
            if (path.endsWith("/listMyClients")) {
                return Response.json({
                    items: [
                        {
                            id: 7,
                            companyName: "Bistro",
                            contactName: "Camille",
                            contactEmail: "camille@example.test",
                        },
                    ],
                    total: 1,
                });
            }
            if (path.endsWith("/getPartnerCatalog")) {
                return Response.json({ modules: [] });
            }
            throw new Error(`unexpected request ${String(input)}`);
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.innerHTML = (await read("default.html")).replaceAll("sales-proposal-starter", tag);
        document.body.append(core);

        await waitFor(() => core.querySelector("[data-sales-another-client-title]") !== null);

        expect(core.querySelector("[data-sales-first-client-title]")).toBeNull();
        expect(core.querySelector("[data-sales-client-create-card]")).not.toBeNull();
        expect(core.querySelector("[data-sales-client-form]")).not.toBeNull();
        expect(core.textContent).toContain("Bistro");

        const opener = core.querySelector<HTMLElement>("[data-sales-client-create-open]")!;
        const dialog = core.querySelector<HTMLDialogElement>("[data-sales-client-create-dialog]")!;
        opener.click();
        await settle();
        expect(dialog.open || dialog.hasAttribute("open")).toBe(true);
        core.querySelector<HTMLElement>("[data-sales-client-dialog-close]")!.click();
        expect(dialog.open || dialog.hasAttribute("open")).toBe(false);
    });

    test("renders the flat catalogue as one accessible hierarchical table", async () => {
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const path = new URL(String(input), location.href).pathname;
            if (path.endsWith("/listMyClients")) {
                return Response.json({
                    items: [
                        {
                            id: 7,
                            companyName: "Bistro",
                            contactName: "Camille",
                            contactEmail: "camille@example.test",
                        },
                    ],
                    total: 1,
                });
            }
            if (path.endsWith("/getPartnerCatalog")) {
                return Response.json({
                    modules: [{ id: 10 }],
                    selectionRows: [
                        {
                            kind: "module",
                            typeLabel: "Module",
                            depth: 0,
                            id: 10,
                            code: "booking",
                            name: "Booking",
                            description: "Reservation services",
                            moduleId: 10,
                            variantId: null,
                            providerName: null,
                            availability: "base",
                            availabilityLabel: "Base",
                            pricingMode: null,
                            unitAmountCents: null,
                            currency: null,
                            requirements: [],
                        },
                        {
                            kind: "variant",
                            typeLabel: "Variant",
                            depth: 1,
                            id: 11,
                            code: "restaurant",
                            name: "Restaurant",
                            description: null,
                            moduleId: 10,
                            variantId: 11,
                            providerName: "Internal",
                            availability: "selectable",
                            availabilityLabel: "Selectable",
                            pricingMode: "fixed",
                            unitAmountCents: 50000,
                            currency: "EUR",
                            requirements: [],
                        },
                        {
                            kind: "feature",
                            typeLabel: "Feature",
                            depth: 2,
                            id: 12,
                            code: "tables",
                            name: "Table tracking",
                            description: null,
                            moduleId: 10,
                            variantId: 11,
                            providerName: "Internal",
                            availability: "included",
                            availabilityLabel: "Included",
                            pricingMode: "included",
                            unitAmountCents: null,
                            currency: "EUR",
                            requirements: [],
                        },
                        {
                            kind: "feature",
                            typeLabel: "Feature",
                            depth: 2,
                            id: 13,
                            code: "payment",
                            name: "Online payment",
                            description: null,
                            moduleId: 10,
                            variantId: 11,
                            providerName: "Internal",
                            availability: "optional",
                            availabilityLabel: "Optional",
                            pricingMode: "fixed",
                            unitAmountCents: 15000,
                            currency: "EUR",
                            requirements: [{ requiredName: "Payment module" }],
                        },
                    ],
                });
            }
            throw new Error(`unexpected request ${String(input)}`);
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.innerHTML = (await read("default.html")).replaceAll("sales-proposal-starter", tag);
        document.body.append(core);

        await waitFor(() => core.querySelectorAll("[data-sales-catalog-row]").length === 4);
        await settle();

        const table = core.querySelector<HTMLTableElement>("[data-sales-catalog-table]")!;
        const region = core.querySelector<HTMLElement>("[data-sales-catalog-table-scroll]")!;
        const rows = Array.from(core.querySelectorAll<HTMLElement>("[data-sales-catalog-row]"));
        const feature = core.querySelector<HTMLElement>("[data-sales-feature]")!;

        expect(table.caption?.textContent).toContain("Choose one variant per module");
        expect(region.getAttribute("role")).toBe("region");
        expect(region.getAttribute("tabindex")).toBe("0");
        expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(7);
        expect(table.querySelectorAll('th[scope="row"]')).toHaveLength(4);
        expect(rows.map((row) => row.getAttribute("data-sales-row-kind"))).toEqual([
            "module",
            "variant",
            "feature",
            "feature",
        ]);
        expect(rows.map((row) => row.getAttribute("data-sales-depth"))).toEqual(["0", "1", "2", "2"]);
        expect(table.querySelectorAll("[data-sales-variant]")).toHaveLength(1);
        expect(table.querySelectorAll("[data-sales-feature]")).toHaveLength(1);
        expect(rows[0]?.hidden).toBe(false);
        expect(rows.slice(1).every((row) => row.hidden)).toBe(true);
        core.querySelector<HTMLElement>("[data-sales-module-toggle]")!.click();
        expect(rows.slice(1).every((row) => !row.hidden)).toBe(true);
        expect(core.querySelector("[data-sales-module-toggle]")?.getAttribute("aria-expanded")).toBe("true");
        expect(feature.getAttribute("data-module-id")).toBe("10");
        expect(feature.getAttribute("data-variant-id")).toBe("11");
        expect(feature.getAttribute("data-catalog-id")).toBe("13");
        expect(rows[2]?.textContent).toContain("Automatic");
        expect(rows[3]?.textContent).toContain("Payment module");
        expect(table.textContent).not.toContain("{{");
    });

    test("filters module rows from keyboard input without accents or case and keeps selections reachable", async () => {
        const starter = document.createElement(tag);
        starter.innerHTML = `
            <input data-sales-catalog-search>
            <p data-sales-catalog-no-match hidden>No match</p>
            <table>
                <tbody>
                    <tr data-sales-catalog-row data-sales-row-kind="module" data-sales-module-id="1" data-sales-search-text="Réservation Café booking">
                        <td><button data-sales-module-toggle data-module-id="1" type="button" aria-expanded="false">Configure</button><span data-sales-module-selected-label hidden>Selected</span></td>
                    </tr>
                    <tr data-sales-catalog-row data-sales-row-kind="variant" data-sales-module-id="1">
                        <td><input type="checkbox" data-sales-variant data-module-id="1" data-catalog-id="11"></td>
                    </tr>
                    <tr data-sales-catalog-row data-sales-row-kind="module" data-sales-module-id="2" data-sales-search-text="Paiement en ligne payment">
                        <td><button data-sales-module-toggle data-module-id="2" type="button" aria-expanded="false">Configure</button><span data-sales-module-selected-label hidden>Selected</span></td>
                    </tr>
                    <tr data-sales-catalog-row data-sales-row-kind="variant" data-sales-module-id="2">
                        <td><input type="checkbox" checked data-sales-variant data-module-id="2" data-catalog-id="21"></td>
                    </tr>
                </tbody>
            </table>
        `;
        document.body.append(starter);
        await settle();

        const search = starter.querySelector<HTMLInputElement>("[data-sales-catalog-search]")!;
        const moduleOne = starter.querySelector<HTMLElement>(
            '[data-sales-row-kind="module"][data-sales-module-id="1"]',
        )!;
        const moduleOneDetails = starter.querySelector<HTMLElement>(
            '[data-sales-row-kind="variant"][data-sales-module-id="1"]',
        )!;
        const moduleTwo = starter.querySelector<HTMLElement>(
            '[data-sales-row-kind="module"][data-sales-module-id="2"]',
        )!;
        const moduleTwoDetails = starter.querySelector<HTMLElement>(
            '[data-sales-row-kind="variant"][data-sales-module-id="2"]',
        )!;
        const noMatch = starter.querySelector<HTMLElement>("[data-sales-catalog-no-match]")!;

        expect(moduleOne.hidden).toBe(false);
        expect(moduleTwo.hidden).toBe(false);
        expect(moduleOneDetails.hidden).toBe(true);
        expect(moduleTwoDetails.hidden).toBe(true);
        expect(moduleTwo.hasAttribute("data-sales-module-selected")).toBe(true);
        expect(moduleTwo.querySelector<HTMLElement>("[data-sales-module-selected-label]")?.hidden).toBe(false);

        search.value = "CAFE";
        search.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "E" }));
        expect(moduleOne.hidden).toBe(false);
        expect(moduleTwo.hidden).toBe(false);
        expect(noMatch.hidden).toBe(true);

        moduleOne.querySelector<HTMLButtonElement>("[data-sales-module-toggle]")!.click();
        expect(moduleOneDetails.hidden).toBe(false);
        expect(moduleOne.querySelector("[data-sales-module-toggle]")?.getAttribute("aria-expanded")).toBe("true");

        search.value = "introuvable";
        search.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "e" }));
        expect(moduleOne.hidden).toBe(true);
        expect(moduleOneDetails.hidden).toBe(true);
        expect(moduleTwo.hidden).toBe(false);
        expect(noMatch.hidden).toBe(true);

        const selectedVariant = moduleTwoDetails.querySelector<HTMLInputElement>("[data-sales-variant]")!;
        selectedVariant.checked = false;
        selectedVariant.dispatchEvent(new Event("change", { bubbles: true }));
        expect(moduleTwo.hidden).toBe(true);
        expect(noMatch.hidden).toBe(false);

        search.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        expect(search.value).toBe("");
        expect(moduleOne.hidden).toBe(false);
        expect(moduleTwo.hidden).toBe(false);
        expect(moduleOneDetails.hidden).toBe(false);
        expect(noMatch.hidden).toBe(true);
    });

    test("creates a client through the dialog binding form", async () => {
        let created: Request | null = null;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = input instanceof Request ? input : new Request(new URL(String(input), location.href), init);
            if (request.method === "POST") {
                created = request;
                return Response.json({ client: { id: 8, companyName: "Bistro" } });
            }
            return Response.json({ items: [], total: 0 });
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.innerHTML = (await read("default.html")).replaceAll("sales-proposal-starter", tag);
        document.body.append(core);
        await waitFor(() => core.querySelector("[data-sales-client-form]") !== null);

        const opener = core.querySelector<HTMLElement>("[data-sales-client-create-open]")!;
        const dialog = core.querySelector<HTMLDialogElement>("[data-sales-client-create-dialog]")!;
        opener.click();
        const form = core.querySelector<HTMLFormElement>("[data-sales-client-form]")!;
        form.innerHTML = `
            <input name="companyName" value="Bistro">
            <input name="contactName" value="Camille">
            <input name="contactEmail" value="camille@example.test">
            <button type="submit">Create</button>
        `;
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => created !== null);
        await waitFor(() => !(dialog.open || dialog.hasAttribute("open")));

        const request = created as unknown as Request;
        expect(request.method).toBe("POST");
        expect(await request.json()).toEqual({
            companyName: "Bistro",
            contactName: "Camille",
            contactEmail: "camille@example.test",
        });
    });

    test("creates the first draft through the binding-owned form", async () => {
        let created: Request | null = null;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = input instanceof Request ? input : new Request(input, init);
            if (request.method === "POST") {
                created = request;
                return Response.json({ proposal: { id: 42, reference: "SC-42" } });
            }
            return Response.json({ items: [{ id: 7 }], nextCursor: null });
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.innerHTML = `
            <${tag} source-prefix="http://localhost/.cms/sources">
                <form data-sales-create-form
                      cms-source="/.cms/sources/sales-configurator/saveMyProposalDraft as saveResult"
                      cms-source-trigger="submit"
                      cms-source-method="POST"
                      cms-source-success-reset="false"
                      cms-source-publish="sales-proposals:changed">
                    <input name="clientId" value="7">
                    <input name="title" value="Restaurant booking">
                    <input type="checkbox" checked data-sales-variant data-module-id="1" data-catalog-id="11">
                    <button type="submit">Create</button>
                </form>
            </${tag}>
        `;
        document.body.append(core);
        await settle();

        const form = core.querySelector<HTMLFormElement>("[data-sales-create-form]")!;
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => created !== null);

        const request = created as unknown as Request;
        expect(request.method).toBe("POST");
        expect(await request.json()).toEqual({
            clientId: "7",
            title: "Restaurant booking",
            selections: JSON.stringify({ variantItemId: 11, optionalFeatureItemIds: [] }),
            customRequests: "[]",
        });
    });
});

async function compileStarter(outputTag = tag) {
    const source = Object.fromEntries(
        await Promise.all(
            ["formPayload.ts", "presentation.ts"].map(async (file) => [
                file,
                Buffer.from(await read(file)).toString("base64"),
            ]),
        ),
    );
    return prepare_bloc(
        new File([await read("Bloc.ts")], "Bloc.ts", { type: "text/typescript" }),
        new File([await read("BlocEditor.ts")], "BlocEditor.ts", { type: "text/typescript" }),
        "New proposal",
        "Sales configurator",
        "Binding-aware first-draft creator for the current sales partner.",
        outputTag,
        source,
        await read("default.html"),
    );
}

function read(file: string): Promise<string> {
    return Bun.file(resolve(blocRoot, file)).text();
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
}

async function waitFor(predicate: () => boolean, attempts = 80): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not reached");
}
