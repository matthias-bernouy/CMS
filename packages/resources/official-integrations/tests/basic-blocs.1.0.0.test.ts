import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("basic-blocs 1.0.0", () => {
    test("loads from the official integration catalog with hydrated bloc sources", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");

        expect(definition?.kind).toBe("basic-blocs");
        expect(definition?.version).toBe("1.0.0");

        const artifacts = definition?.artifacts ?? [];
        const button = artifacts.find(artifact => artifact.type === "bloc" && artifact.bloc.tag === "basic-button");
        const panel = artifacts.find(artifact => artifact.type === "bloc" && artifact.bloc.tag === "basic-panel");

        expect(button?.type).toBe("bloc");
        expect(panel?.type).toBe("bloc");
        if (button?.type !== "bloc" || panel?.type !== "bloc") throw new Error("expected bloc artifacts");

        expect(button.bloc.viewJS).toContain("BE5_TAG_TO_BE_REPLACED");
        expect(button.bloc.source?.["manifest.json"]).toBeTruthy();
        expect(button.bloc.source?.["default.html"]).toBeTruthy();
        expect(panel.bloc.editorJS).toContain("BasicPanelEditor");
        expect(panel.bloc.source?.["BlocEditor.ts"]).toBeTruthy();
    });

    test("builds imported bloc artifacts", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifacts = definition?.artifacts?.filter(artifact => artifact.type === "bloc") ?? [];

        expect(artifacts.map(artifact => artifact.bloc.tag).sort()).toEqual(["basic-button", "basic-panel"]);

        for (const artifact of artifacts) {
            const bloc = artifact.bloc;
            expect(bloc.viewJS).toBeTruthy();
            const built = await prepare_bloc(
                new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
                bloc.editorJS ? new File([bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" }) : null,
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
    });
});

function decodeDefaultContent(source: Record<string, string> | undefined): string | undefined {
    if (!source) return undefined;
    const manifestRaw = source["manifest.json"];
    if (!manifestRaw) return undefined;
    const manifest = JSON.parse(Buffer.from(manifestRaw, "base64").toString("utf-8")) as { defaultContent?: string };
    if (!manifest.defaultContent) return undefined;
    const path = manifest.defaultContent.replace(/^\.\//, "");
    const encoded = source[path];
    return encoded ? Buffer.from(encoded, "base64").toString("utf-8") : undefined;
}
