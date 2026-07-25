import { Buffer, File } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const expectedBlocs = new Map([
    [
        "documentation-blocs",
        [
            "doc-anchor-heading",
            "doc-api-endpoint",
            "doc-api-params",
            "doc-api-property",
            "doc-breadcrumb",
            "doc-callout",
            "doc-code-block",
            "doc-code-diff",
            "doc-code-inline",
            "doc-code-kbd",
            "doc-code-tabs",
            "doc-code-terminal",
            "doc-edit-link",
            "doc-embed",
            "doc-feedback",
            "doc-figure",
            "doc-glossary-term",
            "doc-layout",
            "doc-math",
            "doc-mermaid",
            "doc-prev-next",
            "doc-search",
            "doc-sidebar-link",
            "doc-sidebar-section",
            "doc-step",
            "doc-steps",
            "doc-toc",
            "doc-updated",
            "doc-version",
        ],
    ],
    ["mondial-relay", ["mondial-relay-picker"]],
    ["newsletter", ["newsletter-subscription"]],
    ["photo-albums", ["photo-album-gallery", "photo-album-list"]],
    ["stripe-connect", ["stripe-connect-onboarding"]],
    ["commerce-stripe-payments", ["commerce-stripe-payment"]],
    [
        "commerce",
        [
            "commerce-account-offers",
            "commerce-account-sales",
            "commerce-notification-preferences",
            "commerce-offer-filter",
            "commerce-offer-list",
            "commerce-offer-preview",
            "commerce-offer-price-form",
            "commerce-sale-detail",
        ],
    ],
    ["commerce-negotiation", ["commerce-negotiation-form", "commerce-negotiation-list"]],
    [
        "sales-configurator",
        [
            "sales-catalog-browser",
            "sales-client-directory",
            "sales-proposal-builder",
            "sales-proposal-list",
            "sales-proposal-starter",
            "sales-proposal-view",
        ],
    ],
    ["user-account", ["user-account-avatar", "user-account-form"]],
]);

describe("public integration blocs 1.0.0", () => {
    test("hydrates and builds public integration blocs", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);

        for (const [kind, tags] of expectedBlocs) {
            const definition = await repo.get(kind);
            const blocs = definition?.artifacts?.filter((artifact) => artifact.type === "bloc") ?? [];

            expect(blocs.map((artifact) => artifact.bloc.tag).sort()).toEqual(tags);

            for (const artifact of blocs) {
                const bloc = artifact.bloc;
                expect(bloc.viewJS).toContain("BE5_TAG_TO_BE_REPLACED");
                expect(bloc.source?.["manifest.json"]).toBeTruthy();
                expect(bloc.source?.["default.html"]).toBeTruthy();
                expect(bloc.source?.["Bloc.ts"]).toBeTruthy();

                const built = await prepare_bloc(
                    new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
                    bloc.editorJS
                        ? new File([bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" })
                        : null,
                    bloc.name,
                    bloc.group ?? "",
                    bloc.description ?? "",
                    bloc.tag,
                    bloc.source,
                    decodeDefaultContent(bloc.source),
                );

                expect(built.id).toBe(bloc.tag);
                expect(built.viewJS).toContain(bloc.tag);
            }
        }
    });
});

function decodeDefaultContent(source: Record<string, string> | undefined): string | undefined {
    if (!source) {
        return undefined;
    }
    const manifestRaw = source["manifest.json"];
    if (!manifestRaw) {
        return undefined;
    }
    const manifest = JSON.parse(Buffer.from(manifestRaw, "base64").toString("utf-8")) as { defaultContent?: string };
    if (!manifest.defaultContent) {
        return undefined;
    }
    const path = manifest.defaultContent.replace(/^\.\//, "");
    const encoded = source[path];
    return encoded ? Buffer.from(encoded, "base64").toString("utf-8") : undefined;
}
