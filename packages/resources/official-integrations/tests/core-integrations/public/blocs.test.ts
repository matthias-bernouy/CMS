import { Buffer, File } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const expectedBlocs = new Map([
    [
        "workspace-blocs",
        [
            "workspace-detail-section",
            "workspace-lateral-menu",
            "workspace-lateral-menu-item",
            "workspace-shell",
            "workspace-shell-detail",
        ],
    ],
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
    ["consent", ["consent-field"]],
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

            expect(
                blocs
                    .filter((artifact) => !artifact.bloc.internal)
                    .map((artifact) => artifact.bloc.tag)
                    .sort(),
            ).toEqual(tags);

            for (const artifact of blocs) {
                const bloc = artifact.bloc;
                expect(bloc.source?.["manifest.json"]).toBeTruthy();
                expect(bloc.source?.["default.html"]).toBeTruthy();
                if (bloc.compositionHTML !== undefined) {
                    expect(bloc.viewJS).toBeUndefined();
                    expect(bloc.compositionHTML).toContain("<");
                    expect(bloc.source?.["template.html"]).toBeTruthy();
                } else {
                    expect(bloc.viewJS).toContain("BE5_TAG_TO_BE_REPLACED");
                    expect(bloc.source?.[bloc.view ?? "Bloc.ts"]).toBeTruthy();
                    expect(
                        validateBloc({
                            tag: bloc.tag,
                            viewSource: bloc.viewJS,
                            editorSource: bloc.editorJS,
                        }).errors,
                    ).toEqual([]);
                }

                const built = await prepare_bloc(
                    bloc.viewJS ? new File([bloc.viewJS], "Bloc.js", { type: "application/javascript" }) : null,
                    bloc.editorJS
                        ? new File([bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" })
                        : null,
                    bloc.name,
                    bloc.group ?? "",
                    bloc.description ?? "",
                    bloc.tag,
                    bloc.source,
                    decodeDefaultContent(bloc.source),
                    {
                        ...(bloc.compositionHTML !== undefined ? { compositionHTML: bloc.compositionHTML } : {}),
                        ...(bloc.view ? { viewPath: bloc.view } : {}),
                    },
                );

                expect(built.id).toBe(bloc.tag);
                if (bloc.compositionHTML !== undefined) {
                    expect(built.viewJS).toBe("");
                    expect(built.compositionHTML).toBe(bloc.compositionHTML);
                } else {
                    expect(built.viewJS).toContain(bloc.tag);
                }
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
