import { Buffer, File } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Mossa public blocs", () => {
    test("hydrates and builds every public collection bloc", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("mossa");
        const blocs = definition?.artifacts?.filter((artifact) => artifact.type === "bloc") ?? [];

        expect(blocs.length).toBeGreaterThan(0);

        for (const artifact of blocs) {
            const bloc = artifact.bloc;
            expect(bloc.source?.["manifest.json"]).toBeTruthy();
            expect(bloc.source?.["default.html"]).toBeTruthy();
            if (bloc.compositionHTML !== undefined) {
                expect(bloc.viewJS).toBeUndefined();
                expect(bloc.compositionHTML).toContain("<");
                expect(bloc.source?.["template.html"]).toBeTruthy();
            } else {
                expect(bloc.source?.[bloc.view ?? "Bloc.ts"]).toBeTruthy();
                if (bloc.viewJS.includes("BE5_TAG_TO_BE_REPLACED")) {
                    expect(
                        validateBloc({
                            tag: bloc.tag,
                            viewSource: bloc.viewJS,
                            editorSource: bloc.editorJS,
                        }).errors,
                    ).toEqual([]);
                }
            }

            const built = await prepare_bloc(
                bloc.viewJS ? new File([bloc.viewJS], "Bloc.js", { type: "application/javascript" }) : null,
                bloc.editorJS ? new File([bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" }) : null,
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
