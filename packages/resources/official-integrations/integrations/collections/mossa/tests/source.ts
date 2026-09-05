import { Buffer, File } from "node:buffer";
import { posix } from "node:path";
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

export function executableSource(artifact: DeclarativeBlocArtifactTemplate): string {
    const { bloc } = artifact;
    const source = bloc.source ?? {};
    const output = [bloc.viewJS ?? "", bloc.compositionHTML ?? "", decodeDefaultContent(source) ?? ""];
    const entry = bloc.view ?? (source["Bloc.ts"] ? "Bloc.ts" : undefined);
    if (entry) {
        collectImports(entry, source, new Set(), output);
    }
    return output.join("\n");
}

export function completeArtifactSource({ bloc }: DeclarativeBlocArtifactTemplate): string {
    return [
        bloc.viewJS ?? "",
        bloc.editorJS ?? "",
        bloc.compositionHTML ?? "",
        ...Object.values(bloc.source ?? {}).map(decodeSource),
    ].join("\n");
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

function collectImports(path: string, source: Record<string, string>, visited: Set<string>, output: string[]): void {
    if (visited.has(path)) {
        return;
    }
    visited.add(path);
    const content = decodeSource(source[path]);
    if (!content) {
        return;
    }
    output.push(content);
    for (const [, imported] of content.matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g)) {
        const base = posix.normalize(posix.join(posix.dirname(path), imported));
        const candidates = [base, `${base}.ts`, `${base}.js`, `${base}/index.ts`];
        if (base.endsWith(".js")) {
            candidates.push(`${base.slice(0, -3)}.ts`);
        }
        const resolved = candidates.find((candidate) => source[candidate]);
        if (resolved) {
            collectImports(resolved, source, visited, output);
        }
    }
}
