import { describe, expect, test } from "bun:test";
import type { CollectionIntegrationDefinition, DeclarativeBlocArtifactTemplate } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeSource } from "./source";

interface SourceEntry {
    tag: string;
    path: string;
    source: string;
}

describe("Mossa theme hygiene", () => {
    test("uses the required Ulvia contract without fallback branches", async () => {
        const { mossa, ulvia } = await collections();
        const entries = sourceEntries(mossa);
        const published = new Set((ulvia.theme?.categories ?? []).flatMap(({ tokens }) => tokens.map(({ id }) => id)));
        const references = entries.flatMap(({ source }) =>
            [...source.matchAll(/--ulvia-([a-z0-9-]+)/g)].map(([, token]) => token!),
        );
        const fallbacks = entries.flatMap(({ tag, path, source }) =>
            [...source.matchAll(/var\(\s*(--ulvia-[a-z0-9-]+)\s*,/g)].map(
                ([expression]) => `${tag}/${path}:${expression}`,
            ),
        );
        const constructedFallbacks = entries.flatMap(({ tag, path, source }) =>
            [...source.matchAll(/var\(\s*\$\{[^}]+\}\s*,/g)].map(([expression]) => `${tag}/${path}:${expression}`),
        );
        const literalPresentationFallbacks = entries.flatMap(({ tag, path, source }) =>
            [
                ...source.matchAll(
                    /var\(\s*(--_mossa-[a-z0-9-]*(?:gap|padding|spacing|offset|radius|shadow))\s*,\s*(\d*\.?\d+(?:px|rem|em))\s*\)/g,
                ),
            ].map(([, property, value]) => `${tag}/${path}:${property}=${value}`),
        );

        expect(mossa.theme?.dependencies).toEqual([{ kind: "ulvia", versionRange: "^1.0.0" }]);
        expect([...new Set(references)].filter((token) => !published.has(token))).toEqual([]);
        expect(fallbacks).toEqual([]);
        expect(constructedFallbacks).toEqual(["mossa-commerce-stripe-payment/Bloc.ts:var(${variable},"]);
        // Ulvia has no pill-radius token; this fixed geometry is not a theme fallback.
        expect(literalPresentationFallbacks).toEqual(["mossa-chip/Bloc.ts:--_mossa-chip-radius=999px"]);
    });

    test("keeps per-instance editors under the shared theme authority", async () => {
        const { mossa } = await collections();
        const entries = sourceEntries(mossa);
        const colorSettings = entries
            .filter(({ path }) => path.endsWith("BlocEditor.ts"))
            .filter(({ source }) => /type:\s*["']color["']/.test(source))
            .map(({ tag }) => tag);
        const publicMossaProperties = entries.flatMap(({ tag, path, source }) =>
            [...source.matchAll(/--mossa-[a-z0-9-]+/g)].map(([property]) => `${tag}/${path}:${property}`),
        );
        const legacyColorAttributes = entries.flatMap(({ tag, path, source }) => {
            const attributeNames = [
                ...source.matchAll(
                    /(?:attribute:\s*|(?:get|set|remove|has)Attribute\(\s*)["']((?:[a-z][a-z0-9-]*-)?color)["']/g,
                ),
                ...source.matchAll(/:host\(\[((?:[a-z][a-z0-9-]*-)?color)(?:=|\])/g),
                ...(path.endsWith(".html") ? source.matchAll(/\b((?:[a-z][a-z0-9-]*-)?color)\s*=/g) : []),
            ];
            return attributeNames.map(([, attribute]) => `${tag}/${path}:${attribute}`);
        });

        expect(colorSettings).toEqual([]);
        expect(publicMossaProperties).toEqual([]);
        expect(legacyColorAttributes).toEqual([]);
    });

    test("names the badge semantic role through tone only", async () => {
        const { mossa } = await collections();
        const badgeEntries = sourceEntries(mossa).filter(({ tag }) => tag === "mossa-badge");
        const editor = badgeEntries.find(({ path }) => path === "BlocEditor.ts")?.source ?? "";
        const style = badgeEntries.find(({ path }) => path === "style.css")?.source ?? "";

        expect(editor).toContain('attribute: "tone"');
        expect(editor).toContain('getAttribute("tone")');
        expect(editor).toContain('setAttribute("data-auto-tone"');
        expect(style).toContain(':host([tone="primary"])');
        expect(style).toContain(':host([data-auto-tone="0"])');
    });

    test("ships no external placeholder identity", async () => {
        const { mossa } = await collections();
        const placeholders = sourceEntries(mossa).flatMap(({ tag, path, source }) =>
            [...source.matchAll(/https?:\/\/(?:placehold\.co|placeholder\.com)\b/g)].map(
                ([url]) => `${tag}/${path}:${url}`,
            ),
        );

        expect(placeholders).toEqual([]);
    });

    test("honours the public navbar breakpoint setting", async () => {
        const { mossa } = await collections();
        const navbar = sourceEntries(mossa).filter(({ tag }) => tag === "mossa-navbar");
        const implementation = navbar.find(({ path }) => path === "Bloc.ts")?.source ?? "";
        const style = navbar.find(({ path }) => path === "style.css")?.source ?? "";

        expect(implementation).toContain('"_mossa-navbar-breakpoint": this.getAttribute("navbar-breakpoint")');
        expect(style).toContain("@container (max-width: var(--_mossa-navbar-breakpoint))");
        expect(style).not.toContain("@container (max-width: 768px)");
    });

    test("uses the shared size vocabulary for vertical spacing", async () => {
        const { mossa } = await collections();
        const spacing = sourceEntries(mossa).filter(({ tag }) => tag === "mossa-spacing");
        const editor = spacing.find(({ path }) => path === "BlocEditor.ts")?.source ?? "";
        const style = spacing.find(({ path }) => path === "style.css")?.source ?? "";

        for (const size of ["xs", "sm", "md", "lg", "xl"]) {
            expect(editor).toContain(`"value": "${size}"`);
            expect(style).toContain(`:host([size="${size}"])`);
        }
        expect(editor).not.toMatch(/"value": "(?:s|m|l)"/);
    });

    test("keeps raw colors only at the Stripe Elements serialization boundary", async () => {
        const { mossa } = await collections();
        const rawColors = sourceEntries(mossa).flatMap(({ tag, path, source }) =>
            [...source.matchAll(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi)].map(
                ([literal]) => `${tag}/${path}:${literal.toLowerCase()}`,
            ),
        );

        // Stripe Elements receives a plain JS appearance object, not CSS var()
        // expressions. These values are last-resort serialization fallbacks if
        // the browser cannot resolve the required Ulvia properties.
        expect(rawColors).toEqual([
            "mossa-commerce-stripe-payment/Bloc.ts:#16634d",
            "mossa-commerce-stripe-payment/Bloc.ts:#ffffff",
            "mossa-commerce-stripe-payment/Bloc.ts:#26261f",
            "mossa-commerce-stripe-payment/Bloc.ts:#c4473d",
            "mossa-commerce-stripe-payment/Bloc.ts:#21865f",
            "mossa-commerce-stripe-payment/Bloc.ts:#dfddd4",
        ]);
    });

    test("does not use important declarations for presentation", async () => {
        const { mossa } = await collections();
        const presentationImportant = sourceEntries(mossa).flatMap(({ tag, path, source }) =>
            [...source.matchAll(/([a-z-]+)\s*:[^;{}]+!important/gi)]
                .filter(([, property]) => property !== "display")
                .map(([declaration]) => `${tag}/${path}:${declaration}`),
        );

        expect(presentationImportant).toEqual([]);
    });

    test("keeps section padding inside its public width", async () => {
        const { mossa } = await collections();
        const sectionStyle = sourceEntries(mossa).find(
            ({ tag, path }) => tag === "mossa-section" && path === "style.css",
        )?.source;

        expect(sectionStyle).toContain('[part="content"]');
        expect(sectionStyle).toContain("box-sizing: border-box");
    });

    test("lets buttons explicitly inherit their surrounding colour", async () => {
        const { mossa } = await collections();
        const buttonEntries = sourceEntries(mossa).filter(({ tag }) => tag === "mossa-button");
        const editor = buttonEntries.find(({ path }) => path === "BlocEditor.ts")?.source ?? "";
        const style = buttonEntries.find(({ path }) => path === "style.css")?.source ?? "";

        expect(editor).toContain('{ label: "Inherit", value: "inherit" }');
        expect(style).toContain(':host([tone="inherit"])');
        expect(style).toContain("--_mossa-tone-contrasted: currentColor");
        expect(style).toContain("--_mossa-tone-border: color-mix(in srgb, currentColor 20%, transparent)");
    });
});

async function collections(): Promise<{
    mossa: CollectionIntegrationDefinition;
    ulvia: CollectionIntegrationDefinition;
}> {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const [mossa, ulvia] = await Promise.all([repository.get("mossa"), repository.get("ulvia")]);
    if (!mossa || mossa.type !== "collection" || !ulvia || ulvia.type !== "collection") {
        throw new Error("Mossa and Ulvia collection definitions are required");
    }
    return { mossa, ulvia };
}

function sourceEntries(definition: CollectionIntegrationDefinition): SourceEntry[] {
    return blocArtifacts(definition).flatMap(({ bloc }) =>
        Object.entries(bloc.source ?? {}).map(([path, encoded]) => ({
            tag: bloc.tag,
            path,
            source: decodeSource(encoded),
        })),
    );
}

function blocArtifacts(definition: CollectionIntegrationDefinition): DeclarativeBlocArtifactTemplate[] {
    return (definition.artifacts ?? []).filter(
        (artifact): artifact is DeclarativeBlocArtifactTemplate => artifact.type === "bloc",
    );
}
