import { writeFile, unlink } from "node:fs/promises";
import { join, relative } from "node:path";
import type { DevBloc } from "./scan";
import { p9rExternalsPlugin } from "src/socle/blocs/p9rExternalsPlugin";

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
import { registerEditor } from "@bernouy/cms/editor";
const __Cls = Object.values(__mod).find((v) => typeof v === "function");
if (__Cls) registerEditor({ cl: __Cls as any });
`;

/** Synthetic editor bundle for blocs deployed without an Editor module. The
 *  bloc gets a default (empty) editor for parent-level actions but is marked
 *  opaque so its subtree is sealed. */
const opaqueEditorWrapperSrc = () => `
import { registerEditor_opaque } from "@bernouy/cms/editor";
registerEditor_opaque();
`;

export async function buildDevBloc(bloc: DevBloc): Promise<BuiltBloc> {
    let viewJS = await buildWithWrapper(
        bloc.folder, bloc.entry, viewWrapperSrc, `view_${bloc.tag}`,
        `view for ${bloc.tag}`,
    );
    viewJS = viewJS.replaceAll("BE5_TAG_TO_BE_REPLACED", bloc.tag);

    let editorJS: string | null;
    if (bloc.editorEntry) {
        editorJS = await buildWithWrapper(
            bloc.folder, bloc.editorEntry, editorWrapperSrc, `editor_${bloc.tag}`,
            `editor for ${bloc.tag}`,
        );
    } else {
        editorJS = await buildWithWrapper(
            bloc.folder, bloc.entry, (_spec) => opaqueEditorWrapperSrc(),
            `opaque_${bloc.tag}`, `opaque editor for ${bloc.tag}`,
        );
    }
    editorJS = editorJS
        .replaceAll("BE5_TAG_TO_BE_REPLACED",   bloc.tag)
        .replaceAll("BE5_LABEL_TO_BE_REPLACED", bloc.label)
        .replaceAll("BE5_GROUP_TO_BE_REPLACED", bloc.group);

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
