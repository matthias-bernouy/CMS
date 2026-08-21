import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DeclarativeArtifactTemplate } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("official integration Theme contracts", () => {
    test("declares calculated Commerce tokens and consumes their derived variables", async () => {
        const definition = await repository().get("commerce");
        const tokens = definition?.theme?.categories.flatMap((category) => category.tokens) ?? [];
        const headingFont = tokens.find((token) => token.id === "offer-heading-font");
        const border = tokens.find((token) => token.id === "offer-border");
        const radius = tokens.find((token) => token.id === "offer-radius");
        const css = await resource("domains/commerce/versions/1.0.0/blocs/commerce-offer-preview/style.css");

        expect(headingFont).toMatchObject({
            type: "font-family",
            defaults: { light: "var(--font-display, var(--font-heading))" },
        });
        expect(border?.defaults.light).toBe("var(--border-subtle, var(--border-default))");
        expect(radius).toMatchObject({
            type: "length",
            defaults: { light: "var(--radius-lg, var(--radius-card))" },
        });
        expect(css).toContain("var(--integration-commerce-offer-heading-font");
        expect(css).toContain("var(--integration-commerce-offer-border");
    });

    test("binds Photo Albums card settings to namespaced Theme variables", async () => {
        const legacy = await repository().get("photo-albums", "1.0.0");
        const target = await repository().get("photo-albums", "1.1.0");
        const legacyTokens = legacy?.theme?.categories.flatMap((category) => category.tokens) ?? [];
        const targetTokens = target?.theme?.categories.flatMap((category) => category.tokens) ?? [];
        const legacyList = await resource("domains/photo-albums/versions/1.0.0/blocs/photo-album-list/default.html");
        const legacyGallery = await resource(
            "domains/photo-albums/versions/1.0.0/blocs/photo-album-gallery/default.html",
        );
        const list = await resource("domains/photo-albums/versions/1.1.0/blocs/photo-album-list/default.html");
        const gallery = await resource("domains/photo-albums/versions/1.1.0/blocs/photo-album-gallery/default.html");

        expect(targetTokens).toEqual(legacyTokens);
        expect(list).toBe(legacyList);
        expect(gallery).toBe(legacyGallery);
        expect(targetTokens.map((token) => token.id)).toEqual([
            "card-background",
            "card-border",
            "card-text",
            "card-muted-text",
        ]);
        expect(targetTokens.every((token) => token.defaults.light.startsWith("var(--"))).toBeTrue();
        expect(list).toContain('background-color="var(--integration-photo-albums-card-background');
        expect(list).toContain('muted-text-color="var(--integration-photo-albums-card-muted-text');
        expect(gallery).toContain('background-color="var(--integration-photo-albums-card-background');
    });

    test("exposes an autonomous Basic Blocs design system", async () => {
        const definition = await repository().get("basic-blocs");
        const categories = definition?.theme?.categories ?? [];
        const tokens = categories.flatMap((category) => category.tokens);
        const byId = new Map(tokens.map((token) => [token.id, token]));

        expect(categories.map((category) => category.id)).toEqual([
            "brand",
            "surfaces",
            "feedback",
            "typography",
            "layout",
            "shape",
            "actions",
            "form-controls",
        ]);
        expect(tokens).toHaveLength(68);
        expect(tokens.every((token) => !token.id.startsWith("integration-"))).toBeTrue();
        expect(tokens.every((token) => Boolean(token.description?.trim()) && Boolean(token.defaults.light))).toBeTrue();
        expect(byId.get("primary-base")?.defaults).toEqual({ light: "#16634d", dark: "#66d3ad" });
        expect(byId.get("action-background")?.defaults.light).toBe("var(--integration-basic-blocs-primary-base)");
        expect(byId.get("field-background")?.defaults.light).toBe("var(--integration-basic-blocs-surface-background)");
        expect(byId.get("surface-radius")?.defaults.light).toBe("var(--integration-basic-blocs-radius-card)");
        expect(byId.get("action-radius")?.type).toBe("length");
        expect(byId.get("elevated-shadow")?.type).toBe("shadow");

        const externalReferences = tokens.flatMap((token) =>
            Object.values(token.defaults).filter(
                (value) => value.startsWith("var(--") && !value.startsWith("var(--integration-basic-blocs-"),
            ),
        );
        expect(externalReferences).toEqual([]);
    });

    test("keeps existing Basic Blocs connected to their semantic Theme tokens", async () => {
        const definition = await repository().get("basic-blocs");
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
            "basic-file-input",
            "basic-grid",
            "basic-input",
            "basic-pagination",
            "basic-select",
            "basic-skeleton",
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
        expect(blocView(input)).toContain("--integration-basic-blocs-field-background");
        expect(blocSource(alert, "style.css")).toContain("--integration-basic-blocs-surface-radius");
        expect(blocSource(toast, "style.css")).toContain("--integration-basic-blocs-elevated-shadow");
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
