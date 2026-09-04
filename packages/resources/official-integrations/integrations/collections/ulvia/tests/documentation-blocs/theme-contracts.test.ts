import { describe, expect, test } from "bun:test";
import { decodeSource, loadDefinition } from "./source";

const ULVIA_THEME_PREFIX = "--ulvia-";
const LEGACY_THEME_PREFIXES = [
    "--ulvia-basic-blocs-",
    "--ulvia-documentation-blocs-",
    "--ulvia-commerce-",
    "--ulvia-forms-",
    "--ulvia-photo-albums-",
    "--ulvia-restaurant-",
];

describe("documentation blocs theme contracts", () => {
    test("publishes one semantic Ulvia design system", async () => {
        const definition = await loadDefinition();

        expect(definition.dependencies).toBeUndefined();
        expect(definition.theme?.categories.map(({ id }) => id)).toEqual([
            "actions",
            "brand",
            "feedback",
            "form-controls",
            "layout",
            "shape-and-motion",
            "surfaces",
            "typography",
            "code-and-terminal",
            "navigation",
        ]);
        expect(definition.theme?.categories.map(({ label }) => label)).toEqual([
            "Actions",
            "Brand",
            "Feedback",
            "Form controls",
            "Spacing and layout",
            "Shape, elevation and motion",
            "Surfaces and content",
            "Typography",
            "Code and terminal",
            "Navigation",
        ]);
    });

    test("keeps only genuinely specialized documentation tokens", async () => {
        const categories = (await loadDefinition()).theme?.categories ?? [];
        const ids = categories.flatMap(({ tokens }) => tokens.map(({ id }) => id));

        expect(ids).toEqual(expect.arrayContaining(["code-background", "terminal-prompt", "navigation-sidebar-width"]));
        expect(ids).not.toEqual(
            expect.arrayContaining([
                "documentation-blocs-accent",
                "documentation-blocs-background",
                "documentation-blocs-info-background",
            ]),
        );
    });

    test("makes documentation blocs consume canonical Ulvia variables", async () => {
        const definition = await loadDefinition();
        for (const artifact of definition.artifacts) {
            if (artifact.type !== "bloc" || !artifact.bloc.path?.startsWith("blocs/foundation/documentation-blocs/")) {
                continue;
            }
            const css = decodeSource(artifact.bloc.source?.["style.css"]);
            expect(css, artifact.bloc.tag).toContain(ULVIA_THEME_PREFIX);
            for (const prefix of LEGACY_THEME_PREFIXES) {
                expect(css, artifact.bloc.tag).not.toContain(prefix);
            }
            expect(css, artifact.bloc.tag).not.toContain("var(--primary");
        }
    });

    test("does not expose generic context or site-owned variables", async () => {
        const definition = await loadDefinition();
        const sources = definition.artifacts
            .filter((artifact) => artifact.type === "bloc")
            .flatMap((artifact) => Object.values(artifact.bloc.source ?? {}))
            .map(decodeSource)
            .join("\n");

        expect(sources).not.toContain("--integration-");
        expect(sources).not.toContain("--ctx-");
        expect(sources).not.toContain("--site-");
    });
});
