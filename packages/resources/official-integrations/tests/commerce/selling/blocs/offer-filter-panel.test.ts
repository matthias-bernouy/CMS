import { afterEach, describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    filterControls,
    filterableFields,
} from "../../../../integrations/domains/commerce/versions/1.0.0/blocs/commerce-offer-filter/schema-helpers";

const tag = "test-commerce-schema-offer-filter";
const originalUrl = `${location.pathname}${location.search}${location.hash}`;

afterEach(() => {
    history.replaceState(history.state, "", originalUrl);
    document.querySelectorAll(tag).forEach((element) => element.remove());
});

describe("Commerce schema-driven offer filters", () => {
    test("keeps only filterable fields and declared operators", () => {
        const fields = filterableFields(tennisSchema);

        expect(fields.map((field) => field.key)).toEqual(["string_pattern", "model_year"]);
        expect(filterControls(fields[0])).toEqual([
            { operator: "eq", param: "filter_string_pattern", valueType: "string" },
        ]);
        expect(filterControls(fields[1])).toEqual([
            { operator: "gte", param: "filter_model_year_min", valueType: "number" },
            { operator: "lte", param: "filter_model_year_max", valueType: "number" },
        ]);
    });

    test("renders schema options, resets incompatible category filters, and deduplicates schema reads", async () => {
        await defineFilter();
        const realFetch = globalThis.fetch;
        const requests: URL[] = [];
        globalThis.fetch = (input) => {
            const url = new URL(String(input), location.origin);
            requests.push(url);
            const schema = url.searchParams.get("category")?.includes("padel") ? padelSchema : tennisSchema;
            return Promise.resolve(
                new Response(JSON.stringify(schema), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        };
        history.replaceState(
            history.state,
            "",
            `${location.pathname}?category=sports%2Ftennis&filter_string_pattern=16x18&brand=wilson`,
        );

        const panel = document.createElement(tag) as HTMLElement & { managedParams(): string[] };
        panel.setAttribute("schema-driven", "");
        try {
            document.body.append(panel);
            await settleLifecycle();

            expect(requests).toHaveLength(1);
            expect(requests[0]!.searchParams.get("category")).toBe("sports/tennis");
            expect(panel.querySelector('[field="grip_size"]')).toBeNull();
            expect(panel.querySelector('[field="string_pattern"]')).not.toBeNull();
            expect(panel.querySelector('[field="model_year"][operator="gte"]')).not.toBeNull();
            expect(panel.querySelector('[field="model_year"][operator="lte"]')).not.toBeNull();
            expect(
                [...panel.querySelectorAll('[name="filter_string_pattern"] option')].map((item) =>
                    item.getAttribute("value"),
                ),
            ).toEqual(["", "16x19", "16x18"]);
            expect([...panel.querySelectorAll('[name="brand"] option')].map((item) => item.textContent)).toEqual([
                "Toutes les marques",
                "Wilson",
                "Head",
            ]);

            document.dispatchEvent(new Event("cms-params:change"));
            await settleLifecycle();
            expect(requests).toHaveLength(1);

            history.replaceState(
                history.state,
                "",
                `${location.pathname}?category=sports%2Fpadel&filter_string_pattern=16x18&brand=wilson`,
            );
            document.dispatchEvent(new Event("cms-params:change"));
            await settleLifecycle();

            expect(requests).toHaveLength(2);
            expect(new URLSearchParams(location.search).has("filter_string_pattern")).toBe(false);
            expect(new URLSearchParams(location.search).has("brand")).toBe(false);
            expect(panel.querySelector('[field="shape"]')).not.toBeNull();
            expect(panel.querySelector('[field="string_pattern"]')).toBeNull();
            expect(panel.managedParams()).toContain("filter_shape");
        } finally {
            panel.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("shares an initial schema read when the renderer reconnects the panel", async () => {
        await defineFilter();
        const realFetch = globalThis.fetch;
        const requests: URL[] = [];
        let completeRequest: ((response: Response) => void) | undefined;
        globalThis.fetch = (input) => {
            requests.push(new URL(String(input), location.origin));
            return new Promise<Response>((resolve) => {
                completeRequest = resolve;
            });
        };
        history.replaceState(history.state, "", `${location.pathname}?category=sports%2Freconnect`);

        const first = document.createElement(tag);
        first.setAttribute("schema-driven", "");
        first.setAttribute("source-prefix", "/reconnect-sources");
        const second = document.createElement(tag);
        second.setAttribute("schema-driven", "");
        second.setAttribute("source-prefix", "/reconnect-sources");
        try {
            document.body.append(first);
            await settleLifecycle();
            expect(requests).toHaveLength(1);

            first.remove();
            document.body.append(second);
            await settleLifecycle();
            expect(requests).toHaveLength(1);

            completeRequest?.(
                new Response(JSON.stringify(tennisSchema), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
            await settleLifecycle();

            expect(second.querySelector('[field="string_pattern"]')).not.toBeNull();
            expect(requests).toHaveLength(1);
        } finally {
            first.remove();
            second.remove();
            globalThis.fetch = realFetch;
        }
    });
});

const tennisSchema = {
    category: { id: 1, parentId: null, slug: "tennis", fullSlug: "sports/tennis", label: "Tennis" },
    fields: [
        {
            key: "model_year",
            label: "Année",
            type: "number",
            required: false,
            filterable: true,
            position: 20,
            unit: null,
            operators: ["eq", "gte", "lte"],
            options: [],
        },
        {
            key: "grip_size",
            label: "Taille de manche",
            type: "string",
            required: false,
            filterable: false,
            position: 5,
            unit: null,
            operators: ["eq", "in"],
            options: ["L1", "L2", "L3"],
        },
        {
            key: "string_pattern",
            label: "Plan de cordage",
            type: "string",
            required: false,
            filterable: true,
            position: 10,
            unit: null,
            operators: ["eq", "in"],
            options: ["16x19", "16x18"],
        },
    ],
    brands: [
        { id: 1, slug: "wilson", name: "Wilson" },
        { id: 2, slug: "head", name: "Head" },
    ],
};

const padelSchema = {
    category: { id: 2, parentId: null, slug: "padel", fullSlug: "sports/padel", label: "Padel" },
    fields: [
        {
            key: "shape",
            label: "Forme",
            type: "string",
            required: false,
            filterable: true,
            position: 1,
            unit: null,
            operators: ["eq", "in"],
            options: ["Ronde", "Diamant", "Goutte d’eau"],
        },
    ],
    brands: [{ id: 3, slug: "bullpadel", name: "Bullpadel" }],
};

async function defineFilter(): Promise<void> {
    if (customElements.get(tag)) {
        return;
    }
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("commerce");
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "commerce-offer-filter",
    );
    if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
        throw new Error("commerce-offer-filter source not found");
    }
    const compiled = await prepare_bloc(
        new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
        null,
        artifact.bloc.name,
        artifact.bloc.group ?? "Commerce",
        artifact.bloc.description ?? "",
        tag,
        artifact.bloc.source,
    );
    new Function(compiled.viewJS)();
}

async function settleLifecycle(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
}
