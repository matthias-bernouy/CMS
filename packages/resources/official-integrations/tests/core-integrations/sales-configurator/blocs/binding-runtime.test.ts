import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "@bernouy/components/binding";
import { defineBloc, readBlocFile, settle, waitFor } from "./harness";

const listTag = "test-sales-proposal-list-binding";
const builderTag = "test-sales-proposal-builder-binding";
const realFetch = globalThis.fetch;

beforeAll(async () => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
    await defineBloc("sales-proposal-list", listTag);
    await defineBloc("sales-proposal-builder", builderTag);
});

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    location.href = "http://localhost/";
});

describe("sales-configurator binding runtime", () => {
    test("renders empty and repeated list states through the binding core", async () => {
        let payload: Record<string, unknown> = { items: [], nextCursor: null };
        const requested: string[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            requested.push(String(input));
            return Response.json(payload);
        }) as typeof fetch;

        const defaultContent = (await readBlocFile("sales-proposal-list", "default.html")).replaceAll(
            "sales-proposal-list",
            listTag,
        );
        const core = document.createElement(BINDING_CORE_TAG);
        core.innerHTML = defaultContent;
        document.body.append(core);

        await waitFor(() => core.querySelector(".sales-proposal-empty") !== null);
        expect(core.querySelector(".sales-proposal-empty")).not.toBeNull();
        expect(requested).toHaveLength(1);

        payload = {
            items: [
                {
                    id: "proposal-1",
                    reference: "P-001",
                    status: "draft",
                    title: "Restaurant booking",
                    client: { companyName: "Bistro", contactName: "Ada" },
                    fixedTotalCents: 65000,
                    quoteItemCount: 1,
                    currency: "EUR",
                    updatedAt: "2026-07-25",
                },
            ],
            nextCursor: "next",
        };
        document.dispatchEvent(new CustomEvent("sales-proposals:changed"));
        await waitFor(() => core.textContent?.includes("Restaurant booking") === true);

        expect(core.textContent).toContain("Bistro");
        expect(core.querySelector(".sales-proposal-empty")).toBeNull();
        expect(requested).toHaveLength(2);
    });

    test("submits the draft through cms-source and publishes one refresh event", async () => {
        let request: Request | null = null;
        let refreshes = 0;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            request = input instanceof Request ? input : new Request(input, init);
            return Response.json({ proposal: { id: "proposal-1" } });
        }) as typeof fetch;
        document.addEventListener(
            "sales-proposals:changed",
            () => {
                refreshes += 1;
            },
            { once: true },
        );

        const builder = document.createElement(builderTag);
        const form = document.createElement("form");
        form.setAttribute("data-sales-draft-form", "");
        form.innerHTML = `
            <input name="id" value="41">
            <input name="clientId" value="7">
            <input name="title" value="Restaurant booking">
            <input type="checkbox" data-sales-variant data-module-id="module-1" data-catalog-id="11">
            <input type="checkbox" data-sales-feature data-module-id="module-1" data-variant-id="11" data-catalog-id="12">
            <textarea data-sales-custom-request>Custom integration</textarea>
            <button type="submit">Save</button>
        `;
        const core = document.createElement(BINDING_CORE_TAG);
        core.append(form);
        builder.append(core);
        document.body.append(builder);
        await settle();

        form.querySelector<HTMLInputElement>("[data-sales-variant]")!.checked = true;
        form.querySelector<HTMLInputElement>("[data-sales-feature]")!.checked = true;
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => request !== null);
        await waitFor(() => refreshes === 1);

        const captured = request as unknown as Request;
        expect(captured.method).toBe("POST");
        expect(await captured.json()).toEqual({
            id: "41",
            clientId: "7",
            title: "Restaurant booking",
            selections: JSON.stringify({ variantItemId: 11, optionalFeatureItemIds: [12] }),
            customRequests: JSON.stringify({
                label: "Custom integration",
                description: null,
                quantity: 1,
            }),
        });
        expect(refreshes).toBe(1);
    });

    test("submits proposal and version identifiers when publishing", async () => {
        let request: Request | null = null;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            request = input instanceof Request ? input : new Request(input, init);
            return Response.json({ proposal: { id: 41 } });
        }) as typeof fetch;

        const source = await readBlocFile("sales-proposal-builder", "default.html");
        const template = document.createElement("template");
        template.innerHTML = source;
        const authored = template.content.querySelector<HTMLFormElement>("[data-sales-publish-form]")!;
        const form = authored.cloneNode(false) as HTMLFormElement;
        form.innerHTML = `
            <input name="proposalId" value="41">
            <input name="expectedVersionId" value="9">
            <input name="expectedRevision" value="3">
            <button type="submit">Publish</button>
        `;
        const core = document.createElement(BINDING_CORE_TAG);
        core.append(form);
        document.body.append(core);
        await settle();

        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => request !== null);

        const captured = request as unknown as Request;
        expect(captured.method).toBe("POST");
        expect(await captured.json()).toEqual({
            proposalId: "41",
            expectedVersionId: "9",
            expectedRevision: "3",
        });
    });

    test("keeps the one-time share response visible instead of publishing an immediate reload", async () => {
        let request: Request | null = null;
        let refreshes = 0;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            request = input instanceof Request ? input : new Request(input, init);
            return Response.json({
                proposal: { id: 41 },
                share: { id: 3 },
                token: "one-time-token",
            });
        }) as typeof fetch;
        const onRefresh = () => {
            refreshes += 1;
        };
        document.addEventListener("sales-proposals:changed", onRefresh);

        const source = await readBlocFile("sales-proposal-builder", "default.html");
        const template = document.createElement("template");
        template.innerHTML = source;
        const authored = template.content.querySelector<HTMLFormElement>("[data-sales-share-form]")!;
        const form = authored.cloneNode(false) as HTMLFormElement;
        form.innerHTML = `
            <input name="proposalId" value="41">
            <button type="submit">Create share</button>
        `;
        const core = document.createElement(BINDING_CORE_TAG);
        core.append(form);
        document.body.append(core);
        await settle();

        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => request !== null);
        await settle();
        document.removeEventListener("sales-proposals:changed", onRefresh);

        const captured = request as unknown as Request;
        expect(captured.method).toBe("POST");
        expect(await captured.json()).toEqual({ proposalId: "41" });
        expect(refreshes).toBe(0);
        expect(form.getAttribute("cms-source-publish")).toBeNull();
    });
});
