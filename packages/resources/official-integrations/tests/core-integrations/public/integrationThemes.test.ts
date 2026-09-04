import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DeclarativeArtifactTemplate } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("official integration Theme contracts", () => {
    test("keeps Commerce card hooks behind the shared Ulvia collection", async () => {
        const definition = await repository().get("commerce");
        const css = await resource("collections/ulvia/blocs/domains/commerce/commerce-offer-preview/style.css");

        expect(definition?.theme).toBeUndefined();
        expect(css).toContain("var(--commerce-offer-border");
        expect(css).toContain("var(--commerce-offer-radius");
        expect(css).toContain("var(--ulvia-font-heading");
    });

    test("keeps Photo Albums defaults while its blocks use the shared Ulvia surface roles", async () => {
        const definition = await repository().get("photo-albums");
        const list = await resource("collections/ulvia/blocs/domains/photo-albums/photo-album-list/default.html");
        const gallery = await resource("collections/ulvia/blocs/domains/photo-albums/photo-album-gallery/default.html");

        expect(definition?.theme).toBeUndefined();
        expect(list).toContain('background-color="var(--ulvia-surface-background');
        expect(list).toContain('muted-text-color="var(--ulvia-surface-muted-text');
        expect(gallery).toContain('background-color="var(--ulvia-surface-background');
    });

    test("exposes the autonomous Ulvia design system", async () => {
        const definition = await repository().get("ulvia");
        const categories = definition?.theme?.categories ?? [];
        const tokens = categories.flatMap((category) => category.tokens);
        const byId = new Map(tokens.map((token) => [token.id, token]));

        expect(categories.map((category) => category.id)).toEqual([
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
        expect(tokens).toHaveLength(92);
        expect(tokens.every((token) => !token.id.startsWith("integration-"))).toBeTrue();
        expect(tokens.every((token) => Boolean(token.defaults.light))).toBeTrue();
        expect(byId.get("primary-base")?.defaults).toEqual({ light: "#16634d", dark: "#66d3ad" });
        expect(byId.get("action-background")?.defaults.light).toBe("var(--ulvia-primary-base)");
        expect(byId.get("field-background")?.defaults.light).toBe("var(--ulvia-surface-background)");
        expect(byId.get("surface-radius")?.defaults.light).toBe("var(--ulvia-radius-card)");
        expect(byId.get("action-radius")?.type).toBe("length");
        expect(byId.get("action-min-height")?.defaults.light).toBe("2.5rem");
        expect(byId.get("elevated-shadow")?.type).toBe("shadow");

        const externalReferences = tokens.flatMap((token) =>
            Object.values(token.defaults).filter(
                (value) => value.startsWith("var(--") && !value.startsWith("var(--ulvia-"),
            ),
        );
        expect(externalReferences).toEqual([]);
    });

    test("keeps Basic Blocs connected to Ulvia semantic Theme tokens", async () => {
        const definition = await repository().get("ulvia");
        const artifacts = definition?.artifacts ?? [];
        const button = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-button");
        const card = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-card");
        const input = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-input");
        const alert = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-alert");
        const toast = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-toast");
        const semanticBlocTags = [
            "basic-alert",
            "basic-badge",
            "basic-button",
            "basic-card",
            "basic-checkbox",
            "basic-chip-group",
            "basic-cta",
            "basic-faq",
            "basic-feature-section",
            "basic-file-input",
            "basic-grid",
            "basic-hero",
            "basic-input",
            "basic-media-section",
            "basic-navbar",
            "basic-pagination",
            "basic-select",
            "basic-skeleton",
            "basic-site-footer",
            "basic-stack",
            "basic-table-cell",
            "basic-textarea",
            "basic-toast",
        ];
        const themeTokenIds = new Set(
            definition?.theme?.categories.flatMap((category) => category.tokens.map((token) => token.id)) ?? [],
        );

        const buttonSchemes = blocSource(button, "colorSchemes.ts");
        expect(buttonSchemes).toContain('role("action-background"');
        expect(buttonSchemes).toContain('scheme("danger"');
        expect(
            [
                "action-background",
                "action-text",
                "action-muted-background",
                "action-muted-text",
                "action-border",
                "focus-color",
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
        expect(blocSource(button, "style.css")).toContain("--_button-background: var(--_tone-base)");
        for (const tag of semanticBlocTags) {
            const artifact = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === tag);
            expect(blocSource(artifact, "colorSchemes.ts")).toBe(buttonSchemes);
            expect(blocSource(artifact, "BlocEditor.ts")).toContain('attribute: "tone"');
            expect(blocSource(artifact, "BlocEditor.ts")).toContain('attribute: "appearance"');
            expect(blocSource(artifact, "BlocEditor.ts")).not.toContain("ColorSetting");
            expect(blocSource(artifact, "BlocEditor.ts")).not.toContain('type: "color"');
        }
        expect(blocSource(card, "colorSchemes.ts")).toContain('role("surface-background"');
        expect(blocView(input)).toContain("--ulvia-field-background");
        expect(blocSource(alert, "style.css")).toContain("--ulvia-surface-radius");
        expect(blocSource(toast, "style.css")).toContain("--ulvia-elevated-shadow");
    });
});

type BlocArtifact = DeclarativeArtifactTemplate | undefined;

function blocView(artifact: BlocArtifact): string {
    return artifact?.type === "bloc" ? (artifact.bloc.viewJS ?? "") : "";
}

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
