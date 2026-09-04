import { describe, expect, test } from "bun:test";
import { decodeSource, loadDefinition } from "./source";

const DOCUMENTATION_THEME_PREFIX = "--integration-ulvia-documentation-blocs-";
const BASIC_THEME_PREFIX = "var(--integration-ulvia-basic-blocs-";

describe("documentation-blocs theme contracts", () => {
    test("co-locates Basic and Documentation tokens in the Ulvia theme", async () => {
        const definition = await loadDefinition();

        expect(definition.dependencies).toBeUndefined();
        expect(definition.theme?.categories.map((category) => category.id)).toEqual(
            expect.arrayContaining([
                "documentation-blocs-foundations",
                "documentation-blocs-navigation",
                "documentation-blocs-code",
                "documentation-blocs-api",
                "documentation-blocs-callouts",
            ]),
        );
    });

    test("links shared defaults to Basic Blocs tokens", async () => {
        const categories = (await loadDefinition()).theme?.categories ?? [];
        const tokens = categories.flatMap((category) => category.tokens);
        const byId = new Map(tokens.map((token) => [token.id, token]));

        for (const id of [
            "accent",
            "background",
            "surface",
            "subtle-surface",
            "text",
            "heading-text",
            "muted-text",
            "border",
            "font-body",
            "font-heading",
            "font-mono",
            "radius-control",
            "radius-panel",
            "shadow",
        ]) {
            expect(byId.get(`documentation-blocs-${id}`)?.defaults.light.startsWith(BASIC_THEME_PREFIX), id).toBeTrue();
        }
    });

    test("makes every Bloc consume the documentation theme", async () => {
        const definition = await loadDefinition();
        for (const artifact of definition.artifacts) {
            if (artifact.type !== "bloc" || !artifact.bloc.path?.startsWith("blocs/foundation/documentation-blocs/")) {
                continue;
            }
            const css = decodeSource(artifact.bloc.source?.["style.css"]);
            expect(css, artifact.bloc.tag).toContain(DOCUMENTATION_THEME_PREFIX);
            expect(css, artifact.bloc.tag).not.toContain("var(--primary");
        }
    });
});
