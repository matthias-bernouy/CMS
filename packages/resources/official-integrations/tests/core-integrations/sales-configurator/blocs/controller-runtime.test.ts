import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "@bernouy/components/binding";
import { defineBloc, readBlocFile, settle } from "./harness";

const listTag = "test-sales-proposal-list-controller";
const directoryTag = "test-sales-client-directory-controller";
const catalogTag = "test-sales-catalog-browser-controller";
const builderTag = "test-sales-proposal-builder-controller";
const viewTag = "test-sales-proposal-view-controller";
const realFetch = globalThis.fetch;

beforeAll(async () => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
    await defineBloc("sales-client-directory", directoryTag);
    await defineBloc("sales-catalog-browser", catalogTag);
    await defineBloc("sales-proposal-list", listTag);
    await defineBloc("sales-proposal-builder", builderTag);
    await defineBloc("sales-proposal-view", viewTag);
});

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    location.href = "http://localhost/";
});

describe("sales-configurator bloc controllers", () => {
    test("configures source bindings without reading the frame URL", () => {
        const list = document.createElement(listTag);
        list.setAttribute("source-id", "partner-sales");
        list.setAttribute("page-size", "15");
        list.setAttribute("new-path", "/workspace/proposals/start?kind=sales#form");
        list.setAttribute("edit-path", "/workspace/proposals/edit?mode=compact#proposal");
        list.setAttribute("proposal-param", "proposal");
        const query = document.createElement("input");
        query.setAttribute("cms-param-sync", "salesProposalQuery");
        const cursor = document.createElement("input");
        cursor.setAttribute("data-sales-cursor-state", "");
        const next = document.createElement("button");
        next.setAttribute("data-sales-proposal-next", "");
        next.setAttribute("data-cursor", "cursor-2");
        const start = document.createElement("a");
        start.setAttribute("data-sales-proposal-start", "");
        const edit = document.createElement("a");
        edit.setAttribute("data-sales-proposal-link", "");
        edit.setAttribute("data-proposal-id", "proposal 41");
        const emptyTitle = document.createElement("strong");
        emptyTitle.setAttribute("data-sales-empty-unfiltered", "");
        const filteredTitle = document.createElement("strong");
        filteredTitle.setAttribute("data-sales-empty-filtered", "");
        list.append(query, cursor, next, start, edit, emptyTitle, filteredTitle);
        document.body.append(list);

        expect(list.getAttribute("cms-source")).toBe(
            "/.cms/sources/partner-sales/listMyProposals?q=#{salesProposalQuery}&status=#{salesProposalStatus}&cursor=@{salesProposalCursor}&limit=15 as proposals",
        );
        expect(list.getAttribute("cms-reload-on")).toBe("sales-proposals:changed");
        expect(cursor.getAttribute("cms-page-state")).toBe("salesProposalCursor");
        expect(start.getAttribute("href")).toBe("/workspace/proposals/start?kind=sales#form");
        expect(edit.getAttribute("href")).toBe("/workspace/proposals/edit?mode=compact&proposal=proposal+41#proposal");
        expect(emptyTitle.hasAttribute("hidden")).toBe(false);
        expect(filteredTitle.hasAttribute("hidden")).toBe(true);

        let changed = 0;
        cursor.addEventListener("change", () => {
            changed += 1;
        });
        next.click();
        expect(cursor.value).toBe("cursor-2");
        expect(changed).toBe(1);

        query.value = "restaurant";
        query.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        expect(cursor.value).toBe("");
        expect(changed).toBe(2);
        expect(emptyTitle.hasAttribute("hidden")).toBe(true);
        expect(filteredTitle.hasAttribute("hidden")).toBe(false);

        const view = document.createElement(viewTag);
        view.setAttribute("token-param", "share");
        view.innerHTML = '<article data-sales-proposal-item data-sales-depth="2"></article>';
        document.body.append(view);
        expect(view.getAttribute("cms-source")).toBe(
            "/.cms/sources/sales-configurator/getSharedProposal?token=#{share} as shared",
        );
        const nestedItem = view.querySelector<HTMLElement>("[data-sales-proposal-item]")!;
        expect(nestedItem.style.marginInlineStart).toBe("2.5rem");
        expect(nestedItem.getAttribute("aria-level")).toBe("4");
    });

    test("wires builder sources and keeps one variant per module", async () => {
        const builder = document.createElement(builderTag);
        builder.innerHTML = `
            <section data-sales-catalog-source></section>
            <form data-sales-draft-form>
                <input type="checkbox" data-sales-variant data-module-id="module-1" data-catalog-id="variant-1">
                <input type="checkbox" data-sales-variant data-module-id="module-1" data-catalog-id="variant-2">
                <input type="checkbox" data-sales-feature data-module-id="module-1" data-variant-id="variant-1" data-catalog-id="feature-1">
            </form>
            <form data-sales-publish-form></form>
        `;
        document.body.append(builder);
        await settle();

        expect(builder.getAttribute("cms-source")).toContain("/getMyProposal?id=#{proposalId} as proposalData");
        expect(builder.querySelector("[data-sales-catalog-source]")?.getAttribute("cms-source")).toContain(
            "/getPartnerCatalog as catalogData",
        );
        for (const form of builder.querySelectorAll("form")) {
            expect(form.getAttribute("cms-source-trigger")).toBe("submit");
            expect(form.getAttribute("cms-source-method")).toBe("POST");
            expect(form.getAttribute("cms-source-success-reset")).toBe("false");
            expect(form.getAttribute("cms-source-publish")).toBe("sales-proposals:changed");
        }

        const variants = builder.querySelectorAll<HTMLInputElement>("[data-sales-variant]");
        const feature = builder.querySelector<HTMLInputElement>("[data-sales-feature]")!;
        expect(feature.disabled).toBe(true);
        variants[0]!.checked = true;
        variants[0]!.dispatchEvent(new Event("change", { bubbles: true }));
        expect(feature.disabled).toBe(false);
        feature.checked = true;
        variants[1]!.checked = true;
        variants[1]!.dispatchEvent(new Event("change", { bubbles: true }));
        expect(variants[0]!.checked).toBe(false);
        expect(variants[1]!.checked).toBe(true);
        expect(feature.checked).toBe(false);
    });

    test("editor-disabled and forced states never start network work", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return Response.json({});
        }) as typeof fetch;

        for (const [bloc, tag, state] of [
            ["sales-client-directory", directoryTag, "loading"],
            ["sales-catalog-browser", catalogTag, "loaded"],
            ["sales-proposal-list", listTag, "loading"],
            ["sales-proposal-builder", builderTag, "empty"],
            ["sales-proposal-view", viewTag, "error"],
            ["sales-proposal-list", listTag, "loaded"],
        ] as const) {
            const core = document.createElement(BINDING_CORE_TAG);
            core.setAttribute("cms-binding-disabled", "");
            core.setAttribute("cms-source-state-force", state);
            core.innerHTML = (await readBlocFile(bloc, "default.html")).replaceAll(bloc, tag);
            document.body.append(core);
            await settle();
            core.remove();
        }

        expect(calls).toBe(0);
    });

    test("submits explicit empty selection and request collections", () => {
        const builder = document.createElement(builderTag);
        const form = document.createElement("form");
        form.setAttribute("data-sales-draft-form", "");
        builder.append(form);
        document.body.append(builder);

        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

        expect(form.querySelector<HTMLInputElement>('input[name="selections"]')?.value).toBe("[]");
        expect(form.querySelector<HTMLInputElement>('input[name="customRequests"]')?.value).toBe("[]");
    });

    test("restores published selections, configures one-time links, and locks terminal proposals", async () => {
        const builder = document.createElement(builderTag);
        builder.setAttribute("share-path", "/client/proposal");
        builder.setAttribute("share-token-param", "access");
        builder.innerHTML = `
            <span data-sales-proposal-status="accepted"></span>
            <span data-sales-selected-id="11" data-sales-version-state="published"></span>
            <span data-sales-selected-id="12" data-sales-version-state="published"></span>
            <form data-sales-editable data-sales-draft-form>
                <input type="checkbox" data-sales-variant data-module-id="1" data-catalog-id="11">
                <input type="checkbox" data-sales-feature data-module-id="1" data-variant-id="11" data-catalog-id="12">
            </form>
            <section data-sales-terminal hidden></section>
            <a data-sales-share-link data-sales-share-token="token_value"></a>
        `;
        document.body.append(builder);
        await settle();

        expect(builder.querySelector<HTMLInputElement>("[data-sales-variant]")?.checked).toBe(true);
        expect(builder.querySelector<HTMLInputElement>("[data-sales-feature]")?.checked).toBe(true);
        expect(builder.querySelector<HTMLElement>("[data-sales-editable]")?.hidden).toBe(true);
        expect(builder.querySelector<HTMLElement>("[data-sales-terminal]")?.hidden).toBe(false);
        expect(builder.querySelector<HTMLAnchorElement>("[data-sales-share-link]")?.getAttribute("href")).toBe(
            "/client/proposal?access=token_value",
        );
    });

    test("serializes rich specific requests without degrading saved details", () => {
        const builder = document.createElement(builderTag);
        const form = document.createElement("form");
        form.setAttribute("data-sales-draft-form", "");
        form.innerHTML = `
            <div data-sales-custom-request>
                <input data-sales-request-label value="Custom connector">
                <textarea data-sales-request-description>Two-way synchronization</textarea>
                <input data-sales-request-quantity value="3">
            </div>
        `;
        builder.append(form);
        document.body.append(builder);

        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

        expect(form.querySelector<HTMLInputElement>('input[name="customRequests"]')?.value).toBe(
            JSON.stringify({
                label: "Custom connector",
                description: "Two-way synchronization",
                quantity: 3,
            }),
        );
    });
});
