import { writeFile, unlink, readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative } from "node:path";
import type { DevBloc } from "./scan";
import { p9rExternalsPlugin } from "@bernouy/cms-bloc-compile";
import { validateBloc } from "@bernouy/cms-bloc-compile";

export type BuiltBloc = {
    tag: string;
    label: string;
    group: string;
    description: string;
    folder: string;
    viewJS: string;
    editorJS: string | null;
};

const buildOptions = (entry: string) => ({
    entrypoints: [entry],
    target: "browser" as const,
    format: "iife" as const,
    plugins: [p9rExternalsPlugin]
});

/**
 * Dev builds wrap the user's entry in a tiny synthetic file that performs the
 * registration the CMS would normally inject via `BE5_TAG_TO_BE_REPLACED`
 * placeholder substitution in `prepare_bloc.ts`. The user's source only needs
 * to export the class — tag / label / group come from manifest.json.
 */
const viewWrapperSrc = (importSpec: string) => `
import * as __mod from ${JSON.stringify(importSpec)};
const __Cls = Object.values(__mod).find((v) => typeof v === "function");
if (__Cls && !customElements.get("BE5_TAG_TO_BE_REPLACED")) {
    customElements.define("BE5_TAG_TO_BE_REPLACED", __Cls as any);
}
`;

const editorWrapperSrc = (importSpec: string) => `
import * as __mod from ${JSON.stringify(importSpec)};
import { registerEditor } from "@bernouy/cms-control/editor";
const __Cls = Object.values(__mod).find((v) => typeof v === "function");
if (__Cls) registerEditor({ cl: __Cls as any });
`;

/** Synthetic editor bundle for blocs deployed without an Editor module. The
 *  bloc gets a default (empty) editor for parent-level actions but is marked
 *  opaque so its subtree is sealed. */
const opaqueEditorWrapperSrc = () => `
import { registerEditor_opaque } from "@bernouy/cms-control/editor";
registerEditor_opaque();
`;

export async function buildDevBloc(bloc: DevBloc): Promise<BuiltBloc> {
    const native = bloc.manifest.runtime === "native";
    const [viewSource, editorSource] = await Promise.all([
        bloc.entry ? readFile(bloc.entry, "utf-8").catch(() => undefined) : Promise.resolve(undefined),
        bloc.editorEntry ? readFile(bloc.editorEntry, "utf-8").catch(() => undefined) : Promise.resolve(undefined),
    ]);

    const validation = validateBloc({
        tag: bloc.tag,
        native,
        ...(viewSource   !== undefined ? { viewSource }   : {}),
        ...(editorSource !== undefined ? { editorSource } : {}),
    });
    if (validation.errors.length > 0) {
        throw new Error(`Validation failed for ${bloc.tag}:\n${validation.errors.map(e => "    • " + e).join("\n")}`);
    }

    let viewJS = "";
    if (!native) {
        if (!bloc.entry) throw new Error(`Missing view entry for ${bloc.tag}`);
        viewJS = await buildWithWrapper(
            bloc.folder, bloc.entry, viewWrapperSrc, `view_${bloc.tag}`,
            `view for ${bloc.tag}`,
        );
        viewJS = viewJS.replaceAll("BE5_TAG_TO_BE_REPLACED", bloc.tag);
    }

    let editorJS: string | null;
    if (bloc.editorEntry) {
        editorJS = await buildWithWrapper(
            bloc.folder, bloc.editorEntry, editorWrapperSrc, `editor_${bloc.tag}`,
            `editor for ${bloc.tag}`,
        );
    } else if (!native) {
        if (!bloc.entry) throw new Error(`Missing view entry for ${bloc.tag}`);
        editorJS = await buildWithWrapper(
            bloc.folder, bloc.entry, (_spec) => opaqueEditorWrapperSrc(),
            `opaque_${bloc.tag}`, `opaque editor for ${bloc.tag}`,
        );
    } else {
        throw new Error(`Native bloc "${bloc.tag}" requires an editor entry`);
    }

    const defaultContent = await readDefaultContent(bloc);
    const defaultContentLiteral = JSON.stringify(defaultContent ?? "").replaceAll("$", "$$$$");

    editorJS = editorJS
        .replaceAll("BE5_TAG_TO_BE_REPLACED",   bloc.tag)
        .replaceAll("BE5_LABEL_TO_BE_REPLACED", jsStringLiteralContent(bloc.label))
        .replaceAll("BE5_GROUP_TO_BE_REPLACED", jsStringLiteralContent(bloc.group))
        .replaceAll("BE5_DESCRIPTION_TO_BE_REPLACED", jsStringLiteralContent(bloc.description))
        .replaceAll("BE5_DEFAULT_CONTENT_TO_BE_REPLACED", defaultContentLiteral);

    return {
        tag:         bloc.tag,
        label:       bloc.label,
        group:       bloc.group,
        description: bloc.description,
        folder:      bloc.folder,
        viewJS,
        editorJS,
    };
}

function jsStringLiteralContent(value: string): string {
    return JSON.stringify(value).slice(1, -1).replaceAll("$", "$$$$");
}

async function readDefaultContent(bloc: DevBloc): Promise<string | undefined> {
    const rel = bloc.manifest.defaultContent;
    if (!rel) return undefined;
    if (isAbsolute(rel) || rel.includes("\0")) {
        throw new Error(`Invalid defaultContent path for ${bloc.tag}: must be relative`);
    }

    const normalized = normalize(rel);
    if (!normalized || normalized === "." || normalized.startsWith("..")) {
        throw new Error(`Invalid defaultContent path for ${bloc.tag}: must stay inside the bloc folder`);
    }

    try {
        return await readFile(join(bloc.folder, normalized), "utf-8");
    } catch {
        throw new Error(`defaultContent file not found for ${bloc.tag}: ${rel}`);
    }
}

async function buildWithWrapper(
    wrapperFolder: string,
    userEntry: string,
    wrapperSrc: (importSpec: string) => string,
    slug: string,
    label: string,
): Promise<string> {
    const wrapperPath = join(wrapperFolder, `.__p9r_dev_${slug}_${crypto.randomUUID()}.ts`);
    let rel = relative(wrapperFolder, userEntry).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;

    try {
        await writeFile(wrapperPath, wrapperSrc(rel));
        return await runBuild(wrapperPath, label);
    } finally {
        await unlink(wrapperPath).catch(() => {});
    }
}

export async function buildAllDevBlocs(blocs: DevBloc[]): Promise<Map<string, BuiltBloc>> {
    const results = new Map<string, BuiltBloc>();

    const builds = await Promise.allSettled(blocs.map(b => buildDevBloc(b)));

    builds.forEach((outcome, i) => {
        const source = blocs[i]!;
        if (outcome.status === "rejected") {
            console.error(`[build] ${source.tag}: ${outcome.reason instanceof Error ? outcome.reason.message : outcome.reason}`);
            return;
        }
        const built = outcome.value;
        if (results.has(built.tag)) {
            console.warn(`[build] Tag collision on "${built.tag}" (keeping the first, dropping ${source.folder})`);
            return;
        }
        results.set(built.tag, built);
    });

    return results;
}

async function runBuild(entry: string, label: string): Promise<string> {
    let result;
    try {
        result = await Bun.build(buildOptions(entry));
    } catch (e) {
        throw new Error(`Build failed (${label}):\n${formatError(e)}`);
    }
    if (!result.success || !result.outputs[0]) {
        throw new Error(`Build failed (${label}):\n${formatLogs(result.logs)}`);
    }
    return await result.outputs[0].text();
}

function formatError(e: unknown): string {
    if (e instanceof AggregateError) return e.errors.map(formatError).join("\n");
    const msg = (e as any)?.message ?? String(e);
    const pos = (e as any)?.position;
    const where = pos?.file ? `\n      at ${pos.file}:${pos.line ?? 0}:${pos.column ?? 0}` : "";
    return `  • ${msg}${where}`;
}

function formatLogs(logs: unknown[]): string {
    if (!logs || logs.length === 0) return "  (no details from Bun.build)";
    return logs.map(formatError).join("\n");
}
