import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
        const definition = await repository().get("photo-albums");
        const tokens = definition?.theme?.categories.flatMap((category) => category.tokens) ?? [];
        const list = await resource("domains/photo-albums/versions/1.0.0/blocs/photo-album-list/default.html");

        expect(tokens.map((token) => token.id)).toEqual([
            "card-background",
            "card-border",
            "card-text",
            "card-muted-text",
        ]);
        expect(tokens.every((token) => token.defaults.light.startsWith("var(--"))).toBeTrue();
        expect(list).toContain('background-color="var(--integration-photo-albums-card-background');
        expect(list).toContain('muted-text-color="var(--integration-photo-albums-card-muted-text');
    });

    test("keeps Basic Card compatible while consuming core Theme tokens", async () => {
        const card = await resource("foundation/basic-blocs/versions/1.0.0/blocs/basic/basic-card/Bloc.ts");

        expect(card).toContain("var(--border-default");
        expect(card).toContain("var(--radius-card");
        expect(card).toContain("var(--font-heading");
        expect(card).toContain("var(--shadow-soft");
    });
});

function repository(): FsIntegrationDefinitionRepository {
    return new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
}

function resource(path: string): Promise<string> {
    return readFile(resolve(OFFICIAL_INTEGRATIONS_ROOT, path), "utf8");
}
