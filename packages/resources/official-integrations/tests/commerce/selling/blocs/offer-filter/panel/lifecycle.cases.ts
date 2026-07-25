import { afterEach, describe, expect, test } from "bun:test";
import { tennisSchema } from "./fixtures";
import { defineFilter, filterTag, settleLifecycle } from "./harness";

const originalUrl = `${location.pathname}${location.search}${location.hash}`;

afterEach(() => {
    history.replaceState(history.state, "", originalUrl);
    document.querySelectorAll(filterTag).forEach((element) => element.remove());
});

describe("Commerce offer filter editor lifecycle", () => {
    test("restores authored content across schema-driven mode changes", async () => {
        await defineFilter();
        const realFetch = globalThis.fetch;
        const requests: URL[] = [];
        globalThis.fetch = (input) => {
            requests.push(new URL(String(input), location.origin));
            return Promise.resolve(
                new Response(JSON.stringify(tennisSchema), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        };
        history.replaceState(history.state, "", `${location.pathname}?category=sports%2Feditor-lifecycle`);

        const panel = document.createElement(filterTag);
        panel.setAttribute("source-prefix", "/editor-lifecycle-sources");
        const authored = document.createElement("p");
        authored.setAttribute("data-authored-filter-content", "");
        authored.textContent = "Filtres configurés dans l’éditeur";
        panel.append(authored);

        try {
            document.body.append(panel);
            expect(panel.firstChild).toBe(authored);

            panel.setAttribute("schema-driven", "");
            await settleLifecycle();
            expect(requests).toHaveLength(1);
            expect(panel.contains(authored)).toBe(false);
            expect(panel.querySelector('[field="string_pattern"]')).not.toBeNull();

            panel.setAttribute("schema-driven", "false");
            expect(panel.firstChild).toBe(authored);
            expect(panel.querySelector("[data-schema-filters]")).toBeNull();
            authored.textContent = "Contenu statique modifié";

            panel.setAttribute("schema-driven", "");
            await settleLifecycle();
            expect(requests).toHaveLength(1);
            expect(panel.contains(authored)).toBe(false);
            expect(panel.querySelector('[field="string_pattern"]')).not.toBeNull();

            panel.setAttribute("schema-driven", "false");
            expect(panel.firstChild).toBe(authored);
            expect(panel.textContent).toBe("Contenu statique modifié");
        } finally {
            panel.remove();
            globalThis.fetch = realFetch;
        }
    });
});
