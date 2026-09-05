import type { ControlCms } from "cms-control/ControlCms";
import { prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import {
    type BlocOwnership,
    ContentConflictError,
    DuplicateBlocTagError,
    type CmsRepository,
    type TBloc,
} from "@bernouy/cms-content";
import { invalidateBlocAssets, invalidatePagesReferencingBloc } from "cms-control/core/admin/server/cache/invalidation";
import { parseSourceManifest, resolveDefaultContent } from "./sourceBundle";

export { parseSourceMap } from "./sourceBundle";

export class BlocImportError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "BlocImportError";
    }
}

export type BlocImportInput = {
    tag: string;
    name: string;
    group?: string;
    description?: string;
    catalogue?: "active" | "inactive";
    internal?: boolean;
    viewPath?: string;
    viewJS?: string | File | null;
    compositionHTML?: string;
    editorJS?: string | File | null;
    source?: Record<string, string>;
    force?: boolean;
};

export type BlocImportResult = {
    id: string;
    action: "created" | "updated";
};

export type BlocImportRuntime = {
    repository?: CmsRepository;
    ownership?: BlocOwnership;
    persist?: (bloc: TBloc, context: { exists: boolean; force: boolean }) => Promise<void>;
    invalidate?: boolean;
};

export async function importBlocArtifact(
    cms: ControlCms,
    input: BlocImportInput,
    runtime: BlocImportRuntime = {},
): Promise<BlocImportResult> {
    if (!input.name || !input.tag || (!input.viewJS && input.compositionHTML === undefined)) {
        throw new BlocImportError("Missing argument (name, tag and viewJS or compositionHTML required)", 400);
    }
    if (input.viewJS && input.compositionHTML !== undefined) {
        throw new BlocImportError("A bloc cannot define both viewJS and compositionHTML", 400);
    }
    const repository = runtime.repository ?? cms.repository;

    const viewFile = input.viewJS ? asFile(input.viewJS, "Bloc.js") : null;
    const editorFile = input.editorJS ? asFile(input.editorJS, "BlocEditor.ts") : null;
    const viewSource = viewFile ? await viewFile.text() : undefined;
    const editorSource = editorFile ? await editorFile.text() : undefined;
    const sourceManifest = parseSourceManifest(input.source);
    if (sourceManifest.error) {
        throw new BlocImportError(sourceManifest.error, 400);
    }
    const validation = validateBloc({
        tag: input.tag,
        ...(viewSource !== undefined ? { viewSource } : {}),
        ...(editorSource !== undefined ? { editorSource } : {}),
    });
    if (validation.errors.length > 0) {
        throw new BlocImportError(validation.errors.join("\n"), 400);
    }

    const existing = await repository.getBlocRecord(input.tag);
    const force = input.force === true;
    if (existing !== null && !force) {
        throw new BlocImportError(`Bloc with tag "${input.tag}" already exists`, 409);
    }

    const defaultContentResult = resolveDefaultContent(input.source);
    if (defaultContentResult.error) {
        throw new BlocImportError(defaultContentResult.error, 400);
    }

    const prepared = await prepare_bloc(
        viewFile,
        editorFile,
        input.name,
        input.group ?? "",
        input.description ?? "",
        input.tag,
        input.source,
        defaultContentResult.content,
        {
            ...(input.compositionHTML !== undefined ? { compositionHTML: input.compositionHTML } : {}),
            ...(input.viewPath ? { viewPath: input.viewPath } : {}),
        },
    );
    const bloc: TBloc = {
        ...prepared,
        ...(input.catalogue ? { catalogue: input.catalogue } : {}),
        ...(input.internal ? { editorJS: "" } : {}),
        ...(input.internal ? { internal: true } : {}),
        ownership: runtime.ownership ?? { kind: "code-managed" },
    };

    try {
        if (runtime.persist) {
            await runtime.persist(bloc, { exists: existing !== null, force });
        } else if (force) {
            await repository.replaceBloc(bloc);
        } else {
            await repository.createBloc(bloc);
        }
    } catch (e) {
        if (!force && e instanceof DuplicateBlocTagError) {
            throw new BlocImportError(`Bloc with tag "${bloc.id}" already exists`, 409);
        }
        if (e instanceof ContentConflictError) {
            throw new BlocImportError(e.message, e.status);
        }
        throw e;
    }

    if (runtime.invalidate !== false) {
        invalidateBlocAssets(cms, bloc.id);
        await invalidatePagesReferencingBloc(cms, bloc.id);
    }

    return { id: bloc.id, action: existing === null ? "created" : "updated" };
}

function asFile(value: string | File, name: string): File {
    return value instanceof File ? value : new File([value], name, { type: "application/javascript" });
}
