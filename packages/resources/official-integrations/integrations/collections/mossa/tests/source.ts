import { Buffer, File } from "node:buffer";
import { isNativeBlocTag, prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import type { DeclarativeBlocArtifactTemplate } from "@bernouy/cms-integrations";

export function decodeSource(value: string | undefined): string {
    return value ? Buffer.from(value, "base64").toString("utf8") : "";
}

export function decodeDefaultContent(source: Record<string, string> | undefined): string | undefined {
    const manifest = source?.["manifest.json"];
    if (!manifest) {
        return undefined;
    }
    const parsed = JSON.parse(decodeSource(manifest)) as { defaultContent?: string };
    const path = parsed.defaultContent?.replace(/^\.\//, "");
    return path ? decodeSource(source?.[path]) : undefined;
}

export async function buildBloc(artifact: DeclarativeBlocArtifactTemplate): Promise<void> {
    const bloc = artifact.bloc;
    const native = isNativeBlocTag(bloc.tag);
    expectValid(bloc.tag, native, bloc.viewJS, bloc.editorJS);

    const built = await prepare_bloc(
        bloc.viewJS ? new File([bloc.viewJS], bloc.view ?? "Bloc.ts", { type: "application/typescript" }) : null,
        bloc.editorJS ? new File([bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" }) : null,
        bloc.name,
        bloc.group ?? "",
        bloc.description ?? "",
        bloc.tag,
        bloc.source,
        decodeDefaultContent(bloc.source),
        {
            native,
            ...(bloc.compositionHTML !== undefined ? { compositionHTML: bloc.compositionHTML } : {}),
            ...(bloc.view ? { viewPath: bloc.view } : {}),
        },
    );
    if (built.id !== bloc.tag || !built.editorJS.includes("registerEditor")) {
        throw new Error(`Bloc ${bloc.tag} did not produce the expected build artifacts`);
    }
    if (!native && bloc.compositionHTML === undefined && !built.viewJS.includes("customElements.define")) {
        throw new Error(`Bloc ${bloc.tag} did not produce a registered browser component`);
    }
}

function expectValid(
    tag: string,
    native: boolean,
    viewSource: string | undefined,
    editorSource: string | null | undefined,
): void {
    const validation = validateBloc({
        tag,
        native,
        ...(viewSource !== undefined ? { viewSource } : {}),
        ...(editorSource ? { editorSource } : {}),
    });
    if (validation.errors.length) {
        throw new Error(`${tag}: ${validation.errors.join("\n")}`);
    }
}
