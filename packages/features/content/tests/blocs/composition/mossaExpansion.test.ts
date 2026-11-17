import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { expandCompositions } from "@bernouy/content";
import type { CompositionDefinition } from "@bernouy/content/rendering";
import { parseHTML } from "linkedom";

// Captured from the previous expansion algorithm, including serialized attribute order and origin mapping.
const expected = {
    render: "ca667b3566529aaf9d012ab90bf915edd328d5c8f4da68492ede0c1cfd40a117",
    preview: "01a95d638118257c895a9c3ff39950ac025ef9d4e0b4bde8b68b647a1c497be3",
};

test.each(["render", "preview"] as const)(
    "the pinned Mossa corpus preserves exact %s expansion and origins",
    async (mode) => {
        const bytes = await Bun.file(resolve("tests/performance/fixtures/administration/mossa-1.18.0.json.gz")).bytes();
        const input = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(bytes))) as {
            release: {
                blocs: { id: string; kind: CompositionDefinition["kind"]; markup: string }[];
                examples: { id: string; document: { html: string } }[];
            };
        };
        const definitions = input.release.blocs.map((bloc) => ({ ...bloc, markupHTML: bloc.markup }));
        const digest = createHash("sha256");
        expect(input.release.examples).toHaveLength(117);
        for (const example of input.release.examples) {
            const document = parseHTML("<html><body></body></html>").document;
            document.body.innerHTML = example.document.html;
            const origins = new WeakMap<Element, string>();
            expandCompositions(document.body, definitions, mode, origins);
            const output = JSON.stringify({
                html: document.body.innerHTML,
                origins: Array.from(document.body.querySelectorAll("*"), (element) => origins.get(element) ?? null),
            });
            digest.update(JSON.stringify([example.id, output]));
        }
        expect(digest.digest("hex")).toBe(expected[mode]);
    },
);
