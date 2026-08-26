import { ContentValidationError, type BlocOwnership, type TBloc } from "@bernouy/cms-content";
import type { BuiltBloc } from "../bloc-build/index";
import { bundleBlocSource } from "cms-cli/push/blocs/bundle";
import { SITE_BLOC_BUILDER_FILE } from "cms-cli/push/blocs/siteBuilder";
import { basename } from "node:path";

export function assertBlocSourceOwnership(source: Record<string, string>, siteDefinition: boolean): void {
    if (!siteDefinition && Object.keys(source).some((path) => basename(path) === SITE_BLOC_BUILDER_FILE)) {
        throw new ContentValidationError("source", `${SITE_BLOC_BUILDER_FILE} is reserved for site-builder blocs`);
    }
}

export async function builtBlocArtifact(bloc: BuiltBloc, ownership: BlocOwnership = bloc.ownership): Promise<TBloc> {
    const source = bloc.source ?? (await bundleBlocSource(bloc.folder));
    return {
        id: bloc.tag,
        name: bloc.label,
        group: bloc.group,
        description: bloc.description,
        ...(bloc.internal ? { internal: true } : {}),
        viewJS: bloc.viewJS,
        ...(bloc.compositionHTML !== undefined ? { compositionHTML: bloc.compositionHTML } : {}),
        editorJS: bloc.editorJS ?? "",
        ownership: structuredClone(ownership),
        source,
    };
}
