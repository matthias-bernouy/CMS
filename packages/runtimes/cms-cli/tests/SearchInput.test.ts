import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "@bernouy/components/binding";
import { Bloc as SearchInput } from "../src/resources/app-templates/full/site/blocs/Form/base-search-input/Bloc";

const SEARCH_INPUT_TAG = "base-search-input";
const realFetch = globalThis.fetch;

beforeAll(() => {
    if (!customElements.get(BINDING_CORE_TAG)) customElements.define(BINDING_CORE_TAG, BindingCore);
    if (!customElements.get(SEARCH_INPUT_TAG)) customElements.define(SEARCH_INPUT_TAG, SearchInput);
});

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    document.getElementById("cms-binding-cloak")?.remove();
    location.href = "http://localhost/";
});

describe("base-search-input", () => {
    test("uses source-repeated option children as suggestions", async () => {
        const urls: string[] = [];
        globalThis.fetch = (async (url: string | URL | Request) => {
            urls.push(String(url));
            return new Response(JSON.stringify([
                { label: "17b ch" },
                { label: "17 boulevard Charlemagne" },
            ]));
        }) as unknown as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <${SEARCH_INPUT_TAG} cms-source="/api/addresses">
                    <option cms-repeat=". as address" value="{{ address.label }}">{{ address.label }}</option>
                    <div cms-slot="loading">Loading addresses</div>
                </${SEARCH_INPUT_TAG}>
            </${BINDING_CORE_TAG}>
        `;

        const searchInput = document.querySelector<SearchInput>(SEARCH_INPUT_TAG)!;
        await waitFor(() => urls.includes("/api/addresses"));
        await waitFor(() => searchInput.querySelectorAll("option").length === 2);

        searchInput.shadowRoot!.querySelector<HTMLInputElement>(".input")!
            .dispatchEvent(new Event("focus"));

        await waitFor(() => suggestionLabels(searchInput).length === 2);
        expect(suggestionLabels(searchInput)).toEqual(["17b ch", "17 boulevard Charlemagne"]);

        searchInput.shadowRoot!.querySelector<HTMLButtonElement>(".suggestion")!.click();
        expect(searchInput.value).toBe("17b ch");
    });

    test("displays option text while exposing the option value", async () => {
        document.body.innerHTML = `
            <${SEARCH_INPUT_TAG}>
                <option value="ban:address:123">17b chemin du fond val</option>
            </${SEARCH_INPUT_TAG}>
        `;

        const searchInput = document.querySelector<SearchInput>(SEARCH_INPUT_TAG)!;
        searchInput.shadowRoot!.querySelector<HTMLInputElement>(".input")!
            .dispatchEvent(new Event("focus"));

        await waitFor(() => suggestionLabels(searchInput).length === 1);
        searchInput.shadowRoot!.querySelector<HTMLButtonElement>(".suggestion")!.click();

        expect(searchInput.value).toBe("ban:address:123");
        expect(displayValue(searchInput)).toBe("17b chemin du fond val");
    });

    test("keeps typed text as both display and value before an option is selected", () => {
        document.body.innerHTML = `<${SEARCH_INPUT_TAG}></${SEARCH_INPUT_TAG}>`;

        const searchInput = document.querySelector<SearchInput>(SEARCH_INPUT_TAG)!;
        const input = searchInput.shadowRoot!.querySelector<HTMLInputElement>(".input")!;
        input.value = "17b chemin";
        input.dispatchEvent(new Event("input"));

        expect(searchInput.value).toBe("17b chemin");
        expect(displayValue(searchInput)).toBe("17b chemin");
    });

    test("maps an existing option value to its text when options arrive later", async () => {
        document.body.innerHTML = `<${SEARCH_INPUT_TAG} value="ban:address:123"></${SEARCH_INPUT_TAG}>`;

        const searchInput = document.querySelector<SearchInput>(SEARCH_INPUT_TAG)!;
        expect(searchInput.value).toBe("ban:address:123");
        expect(displayValue(searchInput)).toBe("ban:address:123");

        const option = document.createElement("option");
        option.value = "ban:address:123";
        option.textContent = "17b chemin du fond val";
        searchInput.append(option);

        await waitFor(() => displayValue(searchInput) === "17b chemin du fond val");
        expect(searchInput.value).toBe("ban:address:123");
    });

    test("does not locally filter source options by the typed value", async () => {
        globalThis.fetch = (async () => new Response(JSON.stringify([
            { label: "Chemin du Fond du Val 76930 Octeville-sur-Mer" },
            { label: "Chemin du Fond du Val 27670 Bosroumois" },
        ]))) as unknown as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <${SEARCH_INPUT_TAG} cms-source="/api/addresses">
                    <option cms-repeat=". as address" value="{{ address.label }}">{{ address.label }}</option>
                </${SEARCH_INPUT_TAG}>
            </${BINDING_CORE_TAG}>
        `;

        const searchInput = document.querySelector<SearchInput>(SEARCH_INPUT_TAG)!;
        await waitFor(() => searchInput.querySelectorAll("option").length === 2);

        searchInput.value = "17b chemin du fond val";
        searchInput.shadowRoot!.querySelector<HTMLInputElement>(".input")!
            .dispatchEvent(new Event("focus"));

        await waitFor(() => suggestionLabels(searchInput).length === 2);
        expect(suggestionLabels(searchInput)).toEqual([
            "Chemin du Fond du Val 76930 Octeville-sur-Mer",
            "Chemin du Fond du Val 27670 Bosroumois",
        ]);
    });

    test("shows source status content without hiding the input field", async () => {
        let resolveFetch!: () => void;
        const responseReady = new Promise<void>(resolve => {
            resolveFetch = resolve;
        });
        globalThis.fetch = (async () => {
            await responseReady;
            return new Response(JSON.stringify([{ label: "Loaded address" }]));
        }) as unknown as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <${SEARCH_INPUT_TAG} cms-source="/api/addresses">
                    <option cms-repeat=". as address" value="{{ address.label }}">{{ address.label }}</option>
                    <base-skeleton cms-slot="loading">Loading addresses</base-skeleton>
                </${SEARCH_INPUT_TAG}>
            </${BINDING_CORE_TAG}>
        `;

        const searchInput = document.querySelector<SearchInput>(SEARCH_INPUT_TAG)!;
        await waitFor(() => searchInput.hasAttribute("has-status"));

        expect(searchInput.shadowRoot!.querySelector(".field")).not.toBeNull();
        expect(searchInput.shadowRoot!.querySelector<HTMLInputElement>(".input")).not.toBeNull();
        expect(searchInput.querySelector("base-skeleton")?.textContent?.trim()).toBe("Loading addresses");

        resolveFetch();
        await waitFor(() => !searchInput.hasAttribute("has-status"));
        await waitFor(() => searchInput.querySelectorAll("option").length === 1);
        expect(searchInput.querySelector("base-skeleton")).toBeNull();
    });
});

function suggestionLabels(searchInput: SearchInput): string[] {
    return Array.from(searchInput.shadowRoot!.querySelectorAll<HTMLButtonElement>(".suggestion"))
        .map(button => button.textContent ?? "");
}

function displayValue(searchInput: SearchInput): string {
    return searchInput.shadowRoot!.querySelector<HTMLInputElement>(".input")!.value;
}

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}
