import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DeclarativeArtifactTemplate } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("official integration Theme contracts", () => {
    test("keeps Commerce card hooks in Mossa and its palette in Ulvia", async () => {
        const definition = await repository().get("commerce");
        const css = await resource(
            "collections/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-preview/style.css",
        );

        expect(definition?.theme).toBeUndefined();
        expect(css).toContain("var(--_mossa-commerce-offer-border");
        expect(css).toContain("var(--_mossa-commerce-offer-radius");
        expect(css).not.toMatch(/--mossa-[a-z0-9-]+/);
        expect(css).toContain("var(--ulvia-font-heading");
    });

    test("exposes only the reusable Ulvia theme foundation", async () => {
        const definition = await repository().get("ulvia");
        const categories = definition?.theme?.categories ?? [];
        const tokens = categories.flatMap((category) => category.tokens);
        const byId = new Map(tokens.map((token) => [token.id, token]));

        expect(categories.map((category) => category.id)).toEqual([
            "brand",
            "feedback",
            "spacing-and-width",
            "shape-and-motion",
            "surfaces",
            "typography",
        ]);
        expect(tokens).toHaveLength(55);
        expect(tokens.every((token) => !token.id.startsWith("integration-"))).toBeTrue();
        expect(tokens.every((token) => Boolean(token.defaults.light))).toBeTrue();
        expect(byId.get("primary-base")?.defaults).toEqual({ light: "#16634d", dark: "#66d3ad" });
        expect(byId.get("surface-background")?.type).toBe("color");
        expect(byId.get("radius-card")?.type).toBe("length");
        expect(byId.get("shadow-soft")?.type).toBe("shadow");
        for (const removedAlias of ["action-background", "field-background", "surface-radius", "elevated-shadow"]) {
            expect(byId.has(removedAlias)).toBeFalse();
        }

        const externalReferences = tokens.flatMap((token) =>
            Object.values(token.defaults).filter(
                (value) => value.startsWith("var(--") && !value.startsWith("var(--ulvia-"),
            ),
        );
        expect(externalReferences).toEqual([]);
    });

    test("keeps Mossa presentation connected to the Ulvia token contract", async () => {
        const mossa = await repository().get("mossa");
        const ulvia = await repository().get("ulvia");
        const artifacts = mossa?.artifacts ?? [];
        const button = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "mossa-button");
        const semanticBlocTags = [
            "mossa-button",
            "mossa-checkbox",
            "mossa-chip-group",
            "mossa-input",
            "mossa-pagination",
            "mossa-responsive-grid",
            "mossa-select",
            "mossa-skeleton",
            "mossa-stack",
            "mossa-surface-card",
            "mossa-textarea",
            "mossa-toast",
        ];
        const themeTokenIds = new Set(
            ulvia?.theme?.categories.flatMap((category) => category.tokens.map((token) => token.id)) ?? [],
        );

        const buttonSchemes = blocSource(button, "colorSchemes.ts");
        expect(buttonSchemes).toContain('base: "--ulvia-primary-base"');
        expect(buttonSchemes).toContain('scheme("danger"');
        expect(
            [
                "surface-text",
                "surface-background",
                "subtle-background",
                "surface-border",
                ...["secondary", "info", "success", "warning", "danger"].flatMap((tone) => [
                    `${tone}-base`,
                    `${tone}-foreground`,
                    `${tone}-muted`,
                    `${tone}-contrasted`,
                ]),
            ].filter((id) => !themeTokenIds.has(id)),
        ).toEqual([]);
        const buttonCss = blocSource(button, "style.css");
        expect(buttonCss).toContain("--_mossa-button-background: var(--_mossa-tone-base)");
        expect(buttonCss).toMatch(/:host\(\[hidden\]\)\s*\{\s*display:\s*none\s*!important;/u);
        expect(buttonCss).toMatch(/::slotted\(\[hidden\]\)\s*\{\s*display:\s*none\s*!important;/u);
        for (const tag of semanticBlocTags) {
            const artifact = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === tag);
            expect(blocSource(artifact, "colorSchemes.ts")).toBe(buttonSchemes);
            expect(blocSource(artifact, "BlocEditor.ts")).toContain('attribute: "tone"');
            expect(blocSource(artifact, "BlocEditor.ts")).toContain('attribute: "appearance"');
            expect(blocSource(artifact, "BlocEditor.ts")).not.toContain("ColorSetting");
            expect(blocSource(artifact, "BlocEditor.ts")).not.toContain('type: "color"');
        }
        expect(buttonCss).not.toMatch(/--mossa-[a-z0-9-]+/);
        expect(buttonSchemes).not.toContain("--ulvia-action-");
        expect(buttonSchemes).not.toContain("--ulvia-field-");
    });
});

type BlocArtifact = DeclarativeArtifactTemplate | undefined;

function blocSource(artifact: BlocArtifact, path: string): string {
    const encoded = artifact?.type === "bloc" ? artifact.bloc.source?.[path] : undefined;
    return encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
}

function repository(): FsIntegrationDefinitionRepository {
    return new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
}

function resource(path: string): Promise<string> {
    return readFile(resolve(OFFICIAL_INTEGRATIONS_ROOT, path), "utf8");
}
