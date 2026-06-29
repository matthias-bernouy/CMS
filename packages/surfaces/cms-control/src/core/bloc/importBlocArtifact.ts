import type { ControlCms } from "cms-control/ControlCms";
import { Buffer } from "node:buffer";
import { posix } from "node:path";
import { prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { DuplicateBlocTagError } from "@bernouy/cms-content";
import { invalidateBlocAssets, invalidatePagesReferencingBloc } from "cms-control/core/server/cache/invalidation";

export class BlocImportError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "BlocImportError";
    }
}

export type BlocImportInput = {
    tag: string;
    name: string;
    group?: string;
    description?: string;
    viewJS: string | File;
    editorJS?: string | File | null;
    source?: Record<string, string>;
    force?: boolean;
};

export type BlocImportResult = {
    id: string;
    action: "created" | "updated";
};

export async function importBlocArtifact(cms: ControlCms, input: BlocImportInput): Promise<BlocImportResult> {
    if (!input.name || !input.viewJS || !input.tag) {
        throw new BlocImportError("Missing argument (name, tag, viewJS required)", 400);
    }

    const viewFile = asFile(input.viewJS, "Bloc.js");
    const editorFile = input.editorJS ? asFile(input.editorJS, "BlocEditor.ts") : null;
    const viewSource = await viewFile.text();
    const editorSource = editorFile ? await editorFile.text() : undefined;

    const validation = validateBloc({
        tag: input.tag,
        viewSource,
        ...(editorSource !== undefined ? { editorSource } : {}),
    });
    if (validation.errors.length > 0) {
        throw new BlocImportError(validation.errors.join("\n"), 400);
    }

    const existing = await cms.repository.getBlocViewJS(input.tag);
    const force = input.force === true;
    if (existing !== null && !force) {
        throw new BlocImportError(`Bloc with tag "${input.tag}" already exists`, 409);
    }

    const defaultContentResult = resolveDefaultContent(input.source);
    if (defaultContentResult.error) {
        throw new BlocImportError(defaultContentResult.error, 400);
    }

    const bloc = await prepare_bloc(
        viewFile,
        editorFile,
        input.name,
        input.group ?? "",
        input.description ?? "",
        input.tag,
        input.source,
        defaultContentResult.content,
    );

    try {
        if (force) await cms.repository.replaceBloc(bloc);
        else       await cms.repository.createBloc(bloc);
    } catch (e) {
        if (!force && e instanceof DuplicateBlocTagError) {
            throw new BlocImportError(`Bloc with tag "${bloc.id}" already exists`, 409);
        }
        throw e;
    }

    invalidateBlocAssets(cms, bloc.id);
    await invalidatePagesReferencingBloc(cms, bloc.id);

    return { id: bloc.id, action: existing === null ? "created" : "updated" };
}

export function parseSourceMap(raw: FormDataEntryValue | null): Record<string, string> | undefined {
    if (raw === null || raw === "") return undefined;
    if (typeof raw !== "string") return undefined;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") out[k] = v;
        }
        return Object.keys(out).length > 0 ? out : undefined;
    } catch {
        return undefined;
    }
}

function asFile(value: string | File, name: string): File {
    return value instanceof File ? value : new File([value], name, { type: "application/javascript" });
}

function resolveDefaultContent(source: Record<string, string> | undefined): { content?: string; error?: string } {
    if (!source) return {};

    const manifestRaw = source["manifest.json"] ?? source["./manifest.json"];
    if (!manifestRaw) return {};

    let manifest: unknown;
    try {
        manifest = JSON.parse(decodeSourceFile(manifestRaw));
    } catch {
        return { error: "Invalid manifest.json" };
    }

    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return {};
    const value = (manifest as { defaultContent?: unknown }).defaultContent;
    if (value === undefined || value === null || value === "") return {};
    if (typeof value !== "string") return { error: "manifest.defaultContent must be a file path" };

    const normalizedPath = normalizeSourcePath(value);
    if (!normalizedPath) return { error: "manifest.defaultContent must be a relative file path" };

    const encoded = source[normalizedPath] ?? source[`./${normalizedPath}`];
    if (!encoded) return { error: `manifest.defaultContent file "${normalizedPath}" not found in source bundle` };

    return { content: decodeSourceFile(encoded) };
}

function normalizeSourcePath(path: string): string | null {
    if (path.startsWith("/") || path.includes("\0")) return null;

    const normalized = posix.normalize(path).replace(/^\.\//, "");
    if (!normalized || normalized === "." || normalized.startsWith("../")) return null;

    return normalized;
}

function decodeSourceFile(encoded: string): string {
    return Buffer.from(encoded, "base64").toString("utf8");
}
