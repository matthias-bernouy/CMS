import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { executeEditorBundle } from "../../catalog/support";
import { decodeDefaultContent, decodeSource } from "../../source";

export async function loadSection(tag: string) {
    const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const definition = await repo.get("basic-blocs");
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === tag,
    );
    if (!artifact || artifact.type !== "bloc") {
        throw new Error(`expected ${tag} artifact`);
    }
    const bloc = artifact.bloc;
    const defaultContent = decodeDefaultContent(bloc.source);
    const manifest = JSON.parse(decodeSource(bloc.source?.["manifest.json"]));
    const built = await prepare_bloc(
        new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
        new File([bloc.editorJS ?? ""], "BlocEditor.ts", { type: "application/typescript" }),
        bloc.name,
        bloc.group ?? "",
        bloc.description ?? "",
        bloc.tag,
        bloc.source,
        defaultContent,
    );
    const registration = executeEditorBundle(built.editorJS);
    const runtime = window as typeof window & { p9r?: { Component?: typeof Component } };
    runtime.p9r ??= {};
    runtime.p9r.Component = Component;
    new Function(built.viewJS)();
    return { defaultContent, editor: registration.editor, manifest, tag };
}
