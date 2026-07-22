import { p9rExternalsPlugin } from "@bernouy/cms-bloc-compile";
import { unlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

type WrapperSource = (importSpec: string) => string;

const viewWrapperSource: WrapperSource = (importSpec) => `
import * as __mod from ${JSON.stringify(importSpec)};
const __Cls = Object.values(__mod).find((v) => typeof v === "function");
if (__Cls && !customElements.get("BE5_TAG_TO_BE_REPLACED")) {
    customElements.define("BE5_TAG_TO_BE_REPLACED", __Cls as any);
}
`;

const editorWrapperSource: WrapperSource = (importSpec) => `
import * as __mod from ${JSON.stringify(importSpec)};
import { registerEditor } from "@bernouy/cms-control/editor";
const __Cls = Object.values(__mod).find((v) => typeof v === "function");
if (__Cls) registerEditor({ cl: __Cls as any });
`;

const opaqueEditorWrapperSource: WrapperSource = () => `
import { registerEditor_opaque } from "@bernouy/cms-control/editor";
registerEditor_opaque();
`;

export async function buildViewBundle(folder: string, entry: string, tag: string): Promise<string> {
    const source = await buildWithWrapper(folder, entry, viewWrapperSource, `view_${tag}`, `view for ${tag}`);
    return source.replaceAll("BE5_TAG_TO_BE_REPLACED", tag);
}

export function buildEditorBundle(folder: string, entry: string, tag: string): Promise<string> {
    return buildWithWrapper(folder, entry, editorWrapperSource, `editor_${tag}`, `editor for ${tag}`);
}

export function buildOpaqueEditorBundle(folder: string, entry: string, tag: string): Promise<string> {
    return buildWithWrapper(folder, entry, opaqueEditorWrapperSource, `opaque_${tag}`, `opaque editor for ${tag}`);
}

async function buildWithWrapper(
    wrapperFolder: string,
    userEntry: string,
    wrapperSource: WrapperSource,
    slug: string,
    label: string,
): Promise<string> {
    const wrapperPath = join(wrapperFolder, `.__p9r_dev_${slug}_${crypto.randomUUID()}.ts`);
    let importSpec = relative(wrapperFolder, userEntry).replace(/\\/g, "/");
    if (!importSpec.startsWith(".")) {
        importSpec = "./" + importSpec;
    }

    try {
        await writeFile(wrapperPath, wrapperSource(importSpec));
        return await runBuild(wrapperPath, label);
    } finally {
        await unlink(wrapperPath).catch(() => {});
    }
}

async function runBuild(entry: string, label: string): Promise<string> {
    let result;
    try {
        result = await Bun.build({
            entrypoints: [entry],
            target: "browser",
            format: "iife",
            plugins: [p9rExternalsPlugin],
        });
    } catch (error) {
        throw new Error(`Build failed (${label}):\n${formatError(error)}`);
    }
    if (!result.success || !result.outputs[0]) {
        throw new Error(`Build failed (${label}):\n${formatLogs(result.logs)}`);
    }
    return await result.outputs[0].text();
}

function formatError(error: unknown): string {
    if (error instanceof AggregateError) {
        return error.errors.map(formatError).join("\n");
    }
    const value = error as { message?: string; position?: { file?: string; line?: number; column?: number } };
    const message = value.message ?? String(error);
    const position = value.position;
    const location = position?.file ? `\n      at ${position.file}:${position.line ?? 0}:${position.column ?? 0}` : "";
    return `  • ${message}${location}`;
}

function formatLogs(logs: readonly unknown[]): string {
    return logs.length === 0 ? "  (no details from Bun.build)" : logs.map(formatError).join("\n");
}
