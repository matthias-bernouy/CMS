import { blocThumbnailFromSource, parsePresentationImage, type PresentationImage } from "@bernouy/cms-content";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { p9rExternalsPlugin } from "./p9rExternalsPlugin";
import { writeViewRegistrationEntry } from "./viewRegistrationEntry";
import { isNativeBlocTag, nativeBlocOwnershipError } from "./nativeBlocTags";

/**
 * Builds a bloc's browser view bundle and stamps the manifest tag into the
 * `BE5_TAG_TO_BE_REPLACED` placeholder.
 * The caller must provide the tag — blocs are always keyed by their manifest
 * tag, never by a generated UUID.
 *
 * Uses a fresh per-call temp directory under `os.tmpdir()` so concurrent
 * imports don't race on the same `./tmp/<blocId>.js` files, and so we
 * never depend on the process cwd being writable.
 */
export async function prepare_bloc(
    fileView: File | null,
    label: string,
    group: string,
    description: string,
    blocId: string,
    source: Record<string, string> | undefined = undefined,
    defaultContent: string | undefined = undefined,
    options: {
        thumbnail?: PresentationImage;
        native?: boolean;
        nativeElement?: string;
        compositionHTML?: string;
        viewPath?: string;
    } = {},
) {
    if (options.native || isNativeBlocTag(blocId)) {
        throw new Error(nativeBlocOwnershipError(blocId));
    }
    const thumbnail = parsePresentationImage(options.thumbnail) ?? blocThumbnailFromSource(source);
    const tempDir = await mkdtemp(join(tmpdir(), "p9r-bloc-"));
    const nativeElement = options.nativeElement?.toLowerCase();

    try {
        await materializeSourceBundle(tempDir, source);

        const buildOptions = (entry: string) => ({
            entrypoints: [entry],
            target: "browser" as const,
            format: "iife" as const,
            minify: true,
            plugins: [p9rExternalsPlugin],
        });

        const viewPath = options.viewPath
            ? resolveSourceEntryPath(tempDir, options.viewPath)
            : join(tempDir, blocId + ".js");
        if (fileView) {
            await mkdir(dirname(viewPath), { recursive: true });
            await Bun.write(viewPath, fileView);
        }

        const viewEntryPath = fileView ? await writeViewRegistrationEntry(tempDir, viewPath) : viewPath;
        const viewJSRaw =
            options.compositionHTML !== undefined
                ? ""
                : await runBuild(buildOptions(viewEntryPath), `view bundle for ${blocId}`);
        const viewJS = viewJSRaw.replaceAll("BE5_TAG_TO_BE_REPLACED", blocId);

        assertValidJavaScriptArtifact(viewJS, `view bundle for ${blocId}`);

        return {
            id: blocId,
            ...(thumbnail ? { thumbnail } : {}),
            viewJS: viewJS,
            ...(options.compositionHTML !== undefined ? { compositionHTML: options.compositionHTML } : {}),
            ...(defaultContent !== undefined ? { defaultContent } : {}),
            name: label,
            group: group,
            description: description,
            ...(nativeElement ? { nativeElement } : {}),
            ...(source ? { source } : {}),
        };
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => null);
    }
}

function resolveSourceEntryPath(tempDir: string, rawPath: string): string {
    const path = rawPath.replace(/^\.\/+/, "");
    const segments = path.split("/");
    if (
        !path ||
        rawPath.includes("\\") ||
        rawPath.includes("\0") ||
        isAbsolute(rawPath) ||
        segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ) {
        throw new Error(`Invalid bloc view path: ${rawPath}`);
    }
    return join(tempDir, ...segments);
}

/**
 * Validates the final JavaScript after all manifest placeholders have been
 * replaced. Bun validates source files while building, but replacements happen
 * afterwards and therefore need their own syntax check before an artifact can
 * be returned to an importer for persistence.
 */
export function assertValidJavaScriptArtifact(source: string, label: string): void {
    try {
        // The generated bundles use the IIFE format and must be valid as classic
        // browser scripts. Constructing a function parses without executing it.
        new Function(source);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Invalid generated JavaScript (${label}): ${detail}. ` +
                "Check the bloc source and manifest metadata; the artifact was not persisted.",
        );
    }
}

async function materializeSourceBundle(tempDir: string, source: Record<string, string> | undefined): Promise<void> {
    if (!source) {
        return;
    }

    await Promise.all(
        Object.entries(source).map(async ([rawPath, content]) => {
            const path = rawPath.replace(/^\.\/+/, "");
            const segments = path.split("/");
            if (
                !path ||
                rawPath.includes("\\") ||
                rawPath.includes("\0") ||
                isAbsolute(rawPath) ||
                segments.some((segment) => segment === "" || segment === "." || segment === "..")
            ) {
                throw new Error(`Invalid bloc source path: ${rawPath}`);
            }

            const destination = join(tempDir, ...segments);
            await mkdir(dirname(destination), { recursive: true });
            await Bun.write(destination, Buffer.from(content, "base64"));
        }),
    );
}

export async function runBuild(
    options: Bun.BuildConfig,
    label: string,
    build: typeof Bun.build = Bun.build,
): Promise<string> {
    let result: Bun.BuildOutput;
    try {
        result = await build(options);
    } catch (e) {
        throw new Error(`Build failed (${label}):\n${formatError(e)}`);
    }
    if (!result.success || !result.outputs[0]) {
        throw new Error(`Build failed (${label}):\n${formatLogs(result.logs)}`);
    }
    return await result.outputs[0].text();
}

function formatLogs(logs: unknown[]): string {
    if (!logs || logs.length === 0) {
        return "  (no details from Bun.build)";
    }
    return logs.map(formatError).join("\n");
}

function formatError(e: unknown): string {
    if (e instanceof AggregateError) {
        return e.errors.map(formatError).join("\n");
    }
    const msg = (e as { message?: unknown })?.message ?? String(e);
    const pos = (e as { position?: { file?: string; line?: number; column?: number } })?.position;
    const where = pos?.file ? `\n      at ${pos.file}:${pos.line ?? 0}:${pos.column ?? 0}` : "";
    return `  - ${String(msg)}${where}`;
}
