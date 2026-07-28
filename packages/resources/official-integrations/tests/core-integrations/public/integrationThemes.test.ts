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

    test("hydrates the focused Basic Blocs Theme contract into installed bloc sources", async () => {
        const definition = await repository().get("basic-blocs");
        const categories = definition?.theme?.categories ?? [];
        const tokens = categories.flatMap((category) => category.tokens);
        const artifacts = definition?.artifacts ?? [];
        const button = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-button");
        const card = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-card");
        const input = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-input");
        const alert = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-alert");
        const toast = artifacts.find((item) => item.type === "bloc" && item.bloc.tag === "basic-toast");

        expect(categories.map((category) => category.id)).toEqual(["actions", "form-controls", "surfaces"]);
        expect(tokens.map((token) => token.id)).toEqual([
            "action-background",
            "action-text",
            "action-radius",
            "focus-color",
            "field-background",
            "field-text",
            "field-border",
            "field-radius",
            "muted-text",
            "error-text",
            "surface-background",
            "surface-text",
            "surface-muted-text",
            "surface-border",
            "surface-radius",
            "elevated-shadow",
        ]);
        expect(tokens.every((token) => !token.id.startsWith("integration-"))).toBeTrue();
        expect(tokens.find((token) => token.id === "action-radius")?.type).toBe("length");
        expect(tokens.find((token) => token.id === "elevated-shadow")?.type).toBe("shadow");
        expect(blocView(button)).toContain("--integration-basic-blocs-action-background");
        expect(blocView(card)).toContain("--integration-basic-blocs-surface-background");
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
