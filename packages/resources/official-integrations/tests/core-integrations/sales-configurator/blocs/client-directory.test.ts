import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "@bernouy/components/binding";
import { artifactPath, compileBloc, defineBloc, readBlocFile, settle, waitFor } from "./harness";

const tag = "test-sales-client-directory";
const realFetch = globalThis.fetch;

beforeAll(async () => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
    await defineBloc("sales-client-directory", tag);
});

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    location.href = "http://localhost/";
});

describe("sales client directory", () => {
    test("compiles its view and constrained editor from the official resource bundle", async () => {
        const manifest = JSON.parse(await readBlocFile("sales-client-directory", "manifest.json"));
        const artifact = JSON.parse(await Bun.file(artifactPath("sales-client-directory")).text());
        const view = await readBlocFile("sales-client-directory", "Bloc.ts");
        const editor = await readBlocFile("sales-client-directory", "BlocEditor.ts");
        const compiled = await compileBloc("sales-client-directory", "contract-sales-client-directory");

        expect(manifest).toMatchObject({
            "default-tag": "sales-client-directory",
            bloc: "./Bloc.ts",
            editor: "./BlocEditor.ts",
            defaultContent: "./default.html",
        });
        expect(artifact).toMatchObject({
            type: "bloc",
            bloc: { tag: "sales-client-directory", path: "blocs/sales-client-directory" },
        });
        expect(editor).toContain('attribute: "source-id"');
        expect(editor).toContain('attribute: "client-limit"');
        expect(editor).not.toContain("endpoint-picker");
        expect(view).not.toMatch(/\bfetch\s*\(/);
        expect(view).not.toContain("location.");
        expect(compiled.viewJS).toContain('customElements.define("contract-sales-client-directory"');
        expect(compiled.editorJS).toBeTruthy();
    });

    test("delegates one safe client selection to the nested detail source", async () => {
        const directory = document.createElement(tag);
        directory.setAttribute("source-id", "partner-sales");
        directory.setAttribute("client-limit", "250");
        directory.innerHTML = `
            <button data-sales-client-create-open>Nouveau client</button>
            <dialog data-sales-client-create-dialog aria-label="Nouveau client">
                <input name="companyName">
                <button data-sales-client-dialog-close>Annuler</button>
                <form data-sales-client-create-form></form>
            </dialog>
            <button data-sales-client-open data-client-id="not-an-id">Invalid</button>
            <button data-sales-client-open data-client-id="42">Valid</button>
            <div data-sales-client-detail-mount></div>
            <template data-sales-client-detail-template>
                <dialog data-sales-client-detail-source data-sales-client-edit-dialog aria-label="Modifier le client">
                    <form data-sales-client-edit-form></form>
                    <button data-sales-client-dialog-close>Annuler</button>
                </dialog>
            </template>
        `;
        document.body.append(directory);
        await settle();

        expect(directory.getAttribute("cms-source")).toBe(
            "/.cms/sources/partner-sales/listMyClients?limit=100 as clientsData",
        );
        const createOpen = directory.querySelector<HTMLButtonElement>("[data-sales-client-create-open]")!;
        const createDialog = directory.querySelector<HTMLDialogElement>("[data-sales-client-create-dialog]")!;
        expect(createDialog.open || createDialog.hasAttribute("open")).toBe(false);
        createOpen.click();
        await settle();
        expect(createDialog.open || createDialog.hasAttribute("open")).toBe(true);
        expect(document.activeElement).toBe(createDialog.querySelector('[name="companyName"]'));
        createDialog
            .querySelector("[data-sales-client-create-form]")!
            .dispatchEvent(new CustomEvent("cms-source:failed", { bubbles: true, composed: true }));
        expect(createDialog.open || createDialog.hasAttribute("open")).toBe(true);
        createDialog.querySelector<HTMLButtonElement>("[data-sales-client-dialog-close]")!.click();
        expect(createDialog.open || createDialog.hasAttribute("open")).toBe(false);
        expect(document.activeElement).toBe(createOpen);

        directory.querySelector<HTMLButtonElement>('[data-client-id="not-an-id"]')!.click();
        expect(directory.querySelector("[data-sales-client-detail-mount]")?.children).toHaveLength(0);

        directory.querySelector<HTMLButtonElement>('[data-client-id="42"]')!.click();
        const detail = directory.querySelector<HTMLDialogElement>("[data-sales-client-detail-source]")!;
        const edit = directory.querySelector<HTMLFormElement>("[data-sales-client-edit-form]")!;
        expect(detail.getAttribute("cms-source")).toBe("/.cms/sources/partner-sales/getMyClient?id=42 as clientData");
        expect(detail.getAttribute("cms-reload-on")).toBe("sales-clients:changed");
        expect(detail.localName).toBe("dialog");
        expect(detail.open || detail.hasAttribute("open")).toBe(true);
        expect(edit.getAttribute("cms-source")).toBe("/.cms/sources/partner-sales/saveMyClient as clientResult");
        expect(edit.getAttribute("cms-source-publish")).toBe("sales-clients:changed");
        expect(directory.querySelector('[data-client-id="42"]')?.getAttribute("aria-pressed")).toBe("true");

        directory.querySelector<HTMLButtonElement>('[data-client-id="42"]')!.click();
        expect(directory.querySelector("[data-sales-client-detail-source]")).toBe(detail);
        detail.dispatchEvent(new Event("cancel", { cancelable: true }));
        await settle();
        expect(directory.querySelector("[data-sales-client-detail-mount]")?.children).toHaveLength(0);
        expect(directory.querySelector('[data-client-id="42"]')?.getAttribute("aria-pressed")).toBe("false");
        expect(document.activeElement).toBe(directory.querySelector('[data-client-id="42"]'));
    });

    test("creates an enriched client through the binding-owned form", async () => {
        let createdRequest: Request | null = null;
        let changedEvents = 0;
        document.addEventListener(
            "sales-clients:changed",
            () => {
                changedEvents += 1;
            },
            { once: true },
        );
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = input instanceof Request ? input : new Request(new URL(String(input), location.href), init);
            if (request.method === "POST") {
                createdRequest = request;
                return Response.json({ client: { id: 7 } });
            }
            return Response.json({ items: [], total: 0, limit: 100, offset: 0 });
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.innerHTML = (await readBlocFile("sales-client-directory", "default.html")).replaceAll(
            "sales-client-directory",
            tag,
        );
        document.body.append(core);
        await waitFor(() => core.querySelector("[data-sales-client-create-open]") !== null);
        const createOpen = core.querySelector<HTMLElement>("[data-sales-client-create-open]")!;
        const createDialog = core.querySelector<HTMLDialogElement>("[data-sales-client-create-dialog]")!;
        expect(createDialog.open || createDialog.hasAttribute("open")).toBe(false);
        createOpen.click();
        await waitFor(() => createDialog.open || createDialog.hasAttribute("open"));

        const form = core.querySelector<HTMLFormElement>("[data-sales-client-create-form]")!;
        let closedAtSuccess = false;
        document.addEventListener(
            "cms-source:success",
            (event) => {
                if (event.target === form) {
                    closedAtSuccess =
                        !(createDialog.open || createDialog.hasAttribute("open")) &&
                        document.activeElement === createOpen;
                }
            },
            { once: true },
        );
        form.innerHTML = `
            <input name="companyName" value="Bistro 42">
            <input name="companyRegistrationNumber" value="SIRET-42">
            <input name="addressLine1" value="42 Market Street">
            <input name="addressLine2" value="Building B">
            <input name="postalCode" value="75002">
            <input name="city" value="Paris">
            <input name="country" value="France">
            <input name="contactName" value="Camille Martin">
            <input name="contactJobTitle" value="Director">
            <input name="contactEmail" value="camille@example.test">
            <input name="contactPhone" value="+33102030405">
            <textarea name="notes">Qualified lead</textarea>
            <button type="submit">Create</button>
        `;
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => createdRequest !== null);
        await waitFor(() => changedEvents === 1);

        const request = createdRequest as unknown as Request;
        expect(request.method).toBe("POST");
        expect(await request.json()).toEqual({
            companyName: "Bistro 42",
            companyRegistrationNumber: "SIRET-42",
            addressLine1: "42 Market Street",
            addressLine2: "Building B",
            postalCode: "75002",
            city: "Paris",
            country: "France",
            contactName: "Camille Martin",
            contactJobTitle: "Director",
            contactEmail: "camille@example.test",
            contactPhone: "+33102030405",
            notes: "Qualified lead",
        });
        expect(changedEvents).toBe(1);
        expect(closedAtSuccess).toBe(true);
    });

    test("loads the selected client then submits a true update with its id", async () => {
        let updatedRequest: Request | null = null;
        const requestedReads: string[] = [];
        let changedEvents = 0;
        document.addEventListener(
            "sales-clients:changed",
            () => {
                changedEvents += 1;
            },
            { once: true },
        );
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = input instanceof Request ? input : new Request(new URL(String(input), location.href), init);
            const url = new URL(request.url, location.href);
            if (request.method === "POST") {
                updatedRequest = request;
                return Response.json({ client: { id: 7, companyName: "Bistro Updated" } });
            }
            requestedReads.push(url.pathname + url.search);
            if (url.pathname.endsWith("/getMyClient")) {
                return Response.json(clientFixture());
            }
            return Response.json({ items: [clientFixture()], total: 1, limit: 100, offset: 0 });
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.innerHTML = (await readBlocFile("sales-client-directory", "default.html")).replaceAll(
            "sales-client-directory",
            tag,
        );
        document.body.append(core);
        await waitFor(() => core.querySelector('[data-sales-client-open][data-client-id="7"]') !== null);
        const table = core.querySelector<HTMLTableElement>(".sales-client-table")!;
        const scrollRegion = core.querySelector<HTMLElement>(".sales-client-table-scroll")!;
        expect(table.localName).toBe("table");
        expect(Array.from(table.querySelectorAll("th")).map((heading) => heading.textContent?.trim())).toEqual([
            "Entreprise / SIRET",
            "Contact / fonction",
            "Coordonnées",
            "Ville / Pays",
            "Action",
        ]);
        expect(table.querySelectorAll("tbody .sales-client-row")).toHaveLength(1);
        expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(5);
        expect(scrollRegion.getAttribute("role")).toBe("region");
        expect(scrollRegion.getAttribute("tabindex")).toBe("0");
        expect(scrollRegion.getAttribute("style")).toContain("overflow-x: auto");
        expect(core.querySelector('[data-sales-client-open][data-client-id="7"]')?.textContent?.trim()).toBe(
            "Modifier",
        );
        const template = core.querySelector<HTMLTemplateElement>("[data-sales-client-detail-template]")!;
        expect(template.content.querySelector<HTMLInputElement>('input[name="id"]')?.getAttribute("value")).toBe(
            "{{ clientData.id }}",
        );
        expect(core.querySelector("[data-sales-client-detail-source]")).toBeNull();

        const editOpen = core.querySelector<HTMLElement>('[data-sales-client-open][data-client-id="7"]')!;
        editOpen.click();
        await waitFor(() => core.querySelector("dialog[data-sales-client-edit-dialog]") !== null);
        const editDialog = core.querySelector<HTMLDialogElement>("[data-sales-client-edit-dialog]")!;
        expect(editDialog.open || editDialog.hasAttribute("open")).toBe(true);
        expect(editDialog.getAttribute("aria-label")).toBe("Modifier le client");
        await waitFor(() => requestedReads.some((url) => url.endsWith("/getMyClient?id=7")));
        await waitFor(() => core.querySelector("[data-sales-client-edit-form]") !== null);
        expect(core.querySelectorAll("[data-sales-client-edit-form]")).toHaveLength(1);

        const form = core.querySelector<HTMLFormElement>("[data-sales-client-edit-form]")!;
        await waitFor(() => form.getAttribute("cms-source")?.endsWith("/saveMyClient as clientResult") === true);
        const id = form.querySelector<HTMLInputElement>('input[name="id"]')?.value;
        const companyName = form.querySelector<HTMLElement>('basic-input[name="companyName"]')?.getAttribute("value");
        const contactName = form.querySelector<HTMLElement>('basic-input[name="contactName"]')?.getAttribute("value");
        const contactEmail = form.querySelector<HTMLElement>('basic-input[name="contactEmail"]')?.getAttribute("value");
        expect(id).toBe("7");
        expect(companyName).toBe("Bistro");
        expect(contactName).toBe("Camille");
        expect(contactEmail).toBe("camille@example.test");
        expect(form.innerHTML).not.toContain("{{ clientData.");
        await waitFor(
            () => document.activeElement === form.querySelector<HTMLElement>('basic-input[name="companyName"]'),
        );

        let closedAtSuccess = false;
        document.addEventListener(
            "cms-source:success",
            (event) => {
                if (event.target === form) {
                    closedAtSuccess =
                        !(editDialog.open || editDialog.hasAttribute("open")) && document.activeElement === editOpen;
                }
            },
            { once: true },
        );
        form.innerHTML = `
            <input name="id" value="${id}">
            <input name="companyName" value="Bistro Updated">
            <input name="companyRegistrationNumber" value="SIRET-UPDATED">
            <input name="addressLine1" value="7 New Street">
            <input name="addressLine2" value="Floor 2">
            <input name="postalCode" value="69001">
            <input name="city" value="Lyon">
            <input name="country" value="France">
            <input name="contactName" value="Camille Updated">
            <input name="contactJobTitle" value="Owner">
            <input name="contactEmail" value="owner@example.test">
            <input name="contactPhone" value="+33401020304">
            <textarea name="notes">Updated through directory</textarea>
            <button type="submit">Save</button>
        `;
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => updatedRequest !== null);
        await waitFor(() => changedEvents === 1);

        const request = updatedRequest as unknown as Request;
        expect(await request.json()).toEqual({
            id: "7",
            companyName: "Bistro Updated",
            companyRegistrationNumber: "SIRET-UPDATED",
            addressLine1: "7 New Street",
            addressLine2: "Floor 2",
            postalCode: "69001",
            city: "Lyon",
            country: "France",
            contactName: "Camille Updated",
            contactJobTitle: "Owner",
            contactEmail: "owner@example.test",
            contactPhone: "+33401020304",
            notes: "Updated through directory",
        });
        expect(changedEvents).toBe(1);
        expect(closedAtSuccess).toBe(true);
        expect(core.querySelector("[data-sales-client-edit-dialog]")).toBeNull();
    });

    test("keeps editor-disabled previews network-inert", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return Response.json({});
        }) as typeof fetch;

        const core = document.createElement(BINDING_CORE_TAG);
        core.setAttribute("cms-binding-disabled", "");
        core.setAttribute("cms-source-state-force", "loaded");
        core.innerHTML = (await readBlocFile("sales-client-directory", "default.html")).replaceAll(
            "sales-client-directory",
            tag,
        );
        document.body.append(core);
        await settle();

        expect(calls).toBe(0);
    });
});

function clientFixture() {
    return {
        id: 7,
        companyName: "Bistro",
        companyRegistrationNumber: "SIRET-7",
        contactName: "Camille",
        contactJobTitle: "Director",
        contactEmail: "camille@example.test",
        contactPhone: "+33102030405",
        addressLine1: "7 Market Street",
        addressLine2: null,
        postalCode: "75002",
        city: "Paris",
        country: "France",
        notes: "Qualified lead",
        createdAt: "2026-07-25T10:00:00Z",
        updatedAt: "2026-07-25T10:00:00Z",
    };
}
