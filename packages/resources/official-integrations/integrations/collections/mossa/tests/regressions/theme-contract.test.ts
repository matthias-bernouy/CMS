import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import type { DeclarativeArtifactTemplate } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Mossa presentation contract", () => {
    test("keeps commerce presentation private and linked to Ulvia", async () => {
        const { mossa } = await collections();
        const preview = mossa.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-offer-preview",
        );
        const css = blocSource(preview, "style.css");

        expect(css).toContain("var(--_mossa-commerce-offer-border");
        expect(css).toContain("var(--_mossa-commerce-offer-radius");
        expect(css).not.toMatch(/--mossa-[a-z0-9-]+/);
        expect(css).toContain("var(--ulvia-font-heading");
    });

    test("shares one semantic colour editor backed by public Ulvia tokens", async () => {
        const { mossa, ulvia } = await collections();
        const artifacts = mossa.artifacts ?? [];
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
            ulvia.theme?.categories.flatMap((category) => category.tokens.map((token) => token.id)) ?? [],
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

async function collections() {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const [mossa, ulvia] = await Promise.all([repository.get("mossa"), repository.get("ulvia")]);
    if (!mossa || mossa.type !== "collection" || !ulvia || ulvia.type !== "collection") {
        throw new Error("Mossa and Ulvia collection definitions are required");
    }
    return { mossa, ulvia };
}
