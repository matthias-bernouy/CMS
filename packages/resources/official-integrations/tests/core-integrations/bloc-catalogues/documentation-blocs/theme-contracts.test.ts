import { describe, expect, test } from "bun:test";
import { decodeSource, loadDefinition } from "./source";

const DOCUMENTATION_THEME_PREFIX = "--integration-documentation-blocs-";
const BASIC_THEME_PREFIX = "var(--integration-basic-blocs-";

describe("documentation-blocs theme contracts", () => {
    test("requires Basic Blocs and contributes a namespaced theme", async () => {
        const definition = await loadDefinition();

        expect(definition.dependencies).toEqual([{ name: "basicBlocs", kind: "basic-blocs", versionRange: "^1.0.0" }]);
        expect(definition.theme?.categories.map((category) => category.id)).toEqual([
            "foundations",
            "navigation",
            "code",
            "api",
            "callouts",
        ]);
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
            expect(byId.get(id)?.defaults.light.startsWith(BASIC_THEME_PREFIX), id).toBeTrue();
        }
    });

    test("makes every Bloc consume the documentation theme", async () => {
        const definition = await loadDefinition();
        for (const artifact of definition.artifacts) {
            if (artifact.type !== "bloc") {
                continue;
            }
            const css = decodeSource(artifact.bloc.source?.["style.css"]);
            expect(css, artifact.bloc.tag).toContain(DOCUMENTATION_THEME_PREFIX);
            expect(css, artifact.bloc.tag).not.toContain("var(--primary");
        }
    });
});
