import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { isNativeBlocTag, prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerBuildTest(): void {
    test("builds imported bloc artifacts", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifacts = definition?.artifacts?.filter((artifact) => artifact.type === "bloc") ?? [];

        expect(artifacts.map((artifact) => artifact.bloc.tag).sort()).toEqual([
            "a",
            "article",
            "aside",
            "basic-alert",
            "basic-badge",
            "basic-button",
            "basic-card",
            "basic-checkbox",
            "basic-chip",
            "basic-chip-group",
            "basic-container",
            "basic-cta",
            "basic-faq",
            "basic-faq-item",
            "basic-feature-section",
            "basic-file-input",
            "basic-grid",
            "basic-hero",
            "basic-input",
            "basic-media-section",
            "basic-navbar",
            "basic-option",
            "basic-pagination",
            "basic-redirect",
            "basic-select",
            "basic-site-footer",
            "basic-skeleton",
            "basic-stack",
            "basic-table",
            "basic-table-cell",
            "basic-table-header-cell",
            "basic-table-row",
            "basic-textarea",
            "basic-toast",
            "blockquote",
            "footer",
            "form",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "header",
            "img",
            "li",
            "nav",
            "ol",
            "p",
            "section",
            "span",
            "ul",
        ]);

        for (const artifact of artifacts) {
            const bloc = artifact.bloc;
            expect(bloc.viewJS).toBeTruthy();
            expect(
                validateBloc({
                    tag: bloc.tag,
                    native: isNativeBlocTag(bloc.tag),
                    viewSource: bloc.viewJS,
                    ...(bloc.editorJS ? { editorSource: bloc.editorJS } : {}),
                }).errors,
            ).toEqual([]);
            const built = await prepare_bloc(
                new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
                bloc.editorJS ? new File([bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" }) : null,
                bloc.name,
                bloc.group ?? "",
                bloc.description ?? "",
                bloc.tag,
                bloc.source,
                decodeDefaultContent(bloc.source),
                { native: isNativeBlocTag(bloc.tag) },
            );

            expect(built.id).toBe(bloc.tag);
            expect(built.editorJS).toContain("registerEditor");
            if (isNativeBlocTag(bloc.tag)) {
                expect(built.viewJS).toBe("");
            } else {
                expect(built.viewJS).toContain(bloc.tag);
            }
        }
    });
}
