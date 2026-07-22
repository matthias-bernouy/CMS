import { isNativeBlocTag, validateBloc } from "@bernouy/cms-bloc-compile";
import { readFile } from "node:fs/promises";
import type { DevBloc } from "../scan";
import { buildEditorBundle, buildOpaqueEditorBundle, buildViewBundle } from "./bundle";
import { readDefaultContent } from "./defaultContent";

export type BuiltBloc = {
    tag: string;
    label: string;
    group: string;
    description: string;
    folder: string;
    viewJS: string;
    editorJS: string | null;
};

export async function buildDevBloc(bloc: DevBloc): Promise<BuiltBloc> {
    const native = isNativeBlocTag(bloc.tag);
    await validateSources(bloc, native);

    const viewJS = native ? "" : await buildRequiredView(bloc);
    let editorJS = await buildEditor(bloc, native);
    const defaultContent = await readDefaultContent(bloc);
    const defaultContentLiteral = JSON.stringify(defaultContent ?? "").replaceAll("$", "$$$$");

    editorJS = editorJS
        .replaceAll("BE5_TAG_TO_BE_REPLACED", bloc.tag)
        .replaceAll("BE5_LABEL_TO_BE_REPLACED", jsStringLiteralContent(bloc.label))
        .replaceAll("BE5_GROUP_TO_BE_REPLACED", jsStringLiteralContent(bloc.group))
        .replaceAll("BE5_DESCRIPTION_TO_BE_REPLACED", jsStringLiteralContent(bloc.description))
        .replaceAll("BE5_DEFAULT_CONTENT_TO_BE_REPLACED", defaultContentLiteral);

    return {
        tag: bloc.tag,
        label: bloc.label,
        group: bloc.group,
        description: bloc.description,
        folder: bloc.folder,
        viewJS,
        editorJS,
    };
}

export async function buildAllDevBlocs(blocs: DevBloc[]): Promise<Map<string, BuiltBloc>> {
    const results = new Map<string, BuiltBloc>();
    const builds = await Promise.allSettled(blocs.map((bloc) => buildDevBloc(bloc)));

    builds.forEach((outcome, index) => {
        const source = blocs[index]!;
        if (outcome.status === "rejected") {
            console.error(
                `[build] ${source.tag}: ${outcome.reason instanceof Error ? outcome.reason.message : outcome.reason}`,
            );
            return;
        }
        if (results.has(outcome.value.tag)) {
            console.warn(
                `[build] Tag collision on "${outcome.value.tag}" (keeping the first, dropping ${source.folder})`,
            );
            return;
        }
        results.set(outcome.value.tag, outcome.value);
    });

    return results;
}

async function validateSources(bloc: DevBloc, native: boolean): Promise<void> {
    const [viewSource, editorSource] = await Promise.all([
        bloc.entry ? readFile(bloc.entry, "utf-8").catch(() => undefined) : undefined,
        bloc.editorEntry ? readFile(bloc.editorEntry, "utf-8").catch(() => undefined) : undefined,
    ]);
    const validation = validateBloc({
        tag: bloc.tag,
        native,
        ...(viewSource !== undefined ? { viewSource } : {}),
        ...(editorSource !== undefined ? { editorSource } : {}),
    });
    if (validation.errors.length > 0) {
        throw new Error(
            `Validation failed for ${bloc.tag}:\n${validation.errors.map((error) => "    • " + error).join("\n")}`,
        );
    }
}

async function buildRequiredView(bloc: DevBloc): Promise<string> {
    if (!bloc.entry) {
        throw new Error(`Missing view entry for ${bloc.tag}`);
    }
    return buildViewBundle(bloc.folder, bloc.entry, bloc.tag);
}

async function buildEditor(bloc: DevBloc, native: boolean): Promise<string> {
    if (bloc.editorEntry) {
        return buildEditorBundle(bloc.folder, bloc.editorEntry, bloc.tag);
    }
    if (!native && bloc.entry) {
        return buildOpaqueEditorBundle(bloc.folder, bloc.entry, bloc.tag);
    }
    if (!native) {
        throw new Error(`Missing view entry for ${bloc.tag}`);
    }
    throw new Error(`Native bloc "${bloc.tag}" requires an editor entry`);
}

function jsStringLiteralContent(value: string): string {
    return JSON.stringify(value).slice(1, -1).replaceAll("$", "$$$$");
}
