import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { p9rExternalsPlugin } from "./p9rExternalsPlugin";

/** Synthetic editor source for blocs deployed without their own Editor module. */
const OPAQUE_EDITOR_SRC = `
import { Editor, registerEditor } from "@bernouy/cms-content/editor";

class DefaultBlocEditor extends Editor {}

registerEditor({ editor: DefaultBlocEditor });
`;

/**
 * Builds a bloc's view + editor bundles from the uploaded files and stamps
 * the manifest tag into both via the `BE5_TAG_TO_BE_REPLACED` placeholder.
 * The caller must provide the tag — blocs are always keyed by their manifest
 * tag, never by a generated UUID.
 *
 * Uses a fresh per-call temp directory under `os.tmpdir()` so concurrent
 * imports don't race on the same `./tmp/<blocId>.js` files, and so we
 * never depend on the process cwd being writable.
 */
export async function prepare_bloc(
    fileView: File, fileEditor: File | null,
    label: string, group: string, description: string, blocId: string,
    source: Record<string, string> | undefined = undefined,
    defaultContent: string | undefined = undefined,
    options: { native?: boolean } = {},
) {
    const tempDir = await mkdtemp(join(tmpdir(), "p9r-bloc-"));

    try {
        await materializeSourceBundle(tempDir, source);

        const buildOptions = (entry: string) => ({
            entrypoints: [entry],
            target: "browser" as const,
            format: "iife" as const,
            plugins: [p9rExternalsPlugin],
        });

        const viewPath   = join(tempDir, blocId + ".js");
        const editorPath = join(tempDir, blocId + "Editor.ts");

        await Bun.write(viewPath, fileView);
        if (fileEditor) await Bun.write(editorPath, fileEditor);
        else            await Bun.write(editorPath, OPAQUE_EDITOR_SRC);

        const [viewJSRaw, editorJSRaw] = await Promise.all([
            options.native
                ? fileView.text()
                : runBuild(buildOptions(viewPath), `view bundle for ${blocId}`),
            runBuild(buildOptions(editorPath), `editor bundle for ${blocId}`),
        ]);

        let viewJS   = viewJSRaw;
        let editorJS = editorJSRaw;

        if (!options.native) viewJS = viewJS.replaceAll("BE5_TAG_TO_BE_REPLACED", blocId);

        const defaultContentLiteral = JSON.stringify(defaultContent ?? "").replaceAll("$", "$$$$");

        editorJS = editorJS
            .replaceAll("BE5_TAG_TO_BE_REPLACED", blocId)
            .replaceAll("BE5_LABEL_TO_BE_REPLACED", jsStringLiteralContent(label))
            .replaceAll("BE5_GROUP_TO_BE_REPLACED", jsStringLiteralContent(group))
            .replaceAll("BE5_DESCRIPTION_TO_BE_REPLACED", jsStringLiteralContent(description))
            .replaceAll("BE5_DEFAULT_CONTENT_TO_BE_REPLACED", defaultContentLiteral);

        return {
            id: blocId,
            editorJS: editorJS,
            viewJS: viewJS,
            name: label,
            group: group,
            description: description,
            ...(source ? { source } : {}),
        };
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => null);
    }
}

async function materializeSourceBundle(
    tempDir: string,
    source: Record<string, string> | undefined,
): Promise<void> {
    if (!source) return;

    await Promise.all(Object.entries(source).map(async ([rawPath, content]) => {
        const path = rawPath.replace(/^\.\/+/, "");
        const segments = path.split("/");
        if (
            !path
            || rawPath.includes("\\")
            || rawPath.includes("\0")
            || isAbsolute(rawPath)
            || segments.some(segment => segment === "" || segment === "." || segment === "..")
        ) {
            throw new Error(`Invalid bloc source path: ${rawPath}`);
        }

        const destination = join(tempDir, ...segments);
        await mkdir(dirname(destination), { recursive: true });
        await Bun.write(destination, Buffer.from(content, "base64"));
    }));
}

function jsStringLiteralContent(value: string): string {
    return JSON.stringify(value).slice(1, -1).replaceAll("$", "$$$$");
}

async function runBuild(
    options: Bun.BuildConfig,
    label: string,
): Promise<string> {
    let result: Bun.BuildOutput;
    try {
        result = await Bun.build(options);
    } catch (e) {
        throw new Error(`Build failed (${label}):\n${formatError(e)}`);
    }
    if (!result.success || !result.outputs[0]) {
        throw new Error(`Build failed (${label}):\n${formatLogs(result.logs)}`);
    }
    return await result.outputs[0].text();
}

function formatLogs(logs: unknown[]): string {
    if (!logs || logs.length === 0) return "  (no details from Bun.build)";
    return logs.map(formatError).join("\n");
}

function formatError(e: unknown): string {
    if (e instanceof AggregateError) return e.errors.map(formatError).join("\n");
    const msg = (e as { message?: unknown })?.message ?? String(e);
    const pos = (e as { position?: { file?: string; line?: number; column?: number } })?.position;
    const where = pos?.file ? `\n      at ${pos.file}:${pos.line ?? 0}:${pos.column ?? 0}` : "";
    return `  - ${String(msg)}${where}`;
}
