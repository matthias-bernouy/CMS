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
        expect(content).toContain("/getPartnerCatalog as catalogData");
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
