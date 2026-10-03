import type { ControlCms } from "cms-control/ControlCms";
import { buildCollectionBloc, validateBloc } from "@bernouy/cms-collection-build";
import {
    type BlocOwnership,
    ContentConflictError,
    DuplicateBlocTagError,
    type CmsRepository,
    type TBloc,
    type PresentationImage,
    isPlatformManagedNativeElementTag,
    managedNativeElementIssue,
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
    nativeElement?: TBloc["nativeElement"];
    thumbnail?: PresentationImage;
    viewPath?: string;
    viewJS?: string | File | null;
    compositionHTML?: string;
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
    const nativeElementCandidate = input.nativeElement
        ? {
              accepts: input.nativeElement.accepts.map((tag) => tag.trim().toLowerCase()),
              ...(input.nativeElement.attributes
                  ? { attributes: structuredClone(input.nativeElement.attributes) }
                  : {}),
          }
        : undefined;
    if (!input.name || !input.tag || (!input.viewJS && input.compositionHTML === undefined)) {
        throw new BlocImportError("Missing argument (name, tag and viewJS or compositionHTML required)", 400);
    }
    if (input.viewJS && input.compositionHTML !== undefined) {
        throw new BlocImportError("A bloc cannot define both viewJS and compositionHTML", 400);
    }
    if (
        nativeElementCandidate &&
        (nativeElementCandidate.accepts.length === 0 ||
            new Set(nativeElementCandidate.accepts).size !== nativeElementCandidate.accepts.length)
    ) {
        throw new BlocImportError("Managed native elements require a non-empty unique accepts list", 400);
    }
    const unsupportedNativeElement = nativeElementCandidate?.accepts.find(
        (tag) => !isPlatformManagedNativeElementTag(tag),
    );
    if (unsupportedNativeElement) {
        throw new BlocImportError(`Unsupported managed native element "${unsupportedNativeElement}"`, 400);
    }
    const nativeElement = nativeElementCandidate as TBloc["nativeElement"];
    if (nativeElement && (input.internal || input.compositionHTML !== undefined)) {
        throw new BlocImportError("Managed native elements require an editable component view", 400);
    }
    const repository = runtime.repository ?? cms.repository;

    const viewFile = input.viewJS ? asFile(input.viewJS, "Bloc.js") : null;
    const viewSource = viewFile ? await viewFile.text() : undefined;
    const sourceManifest = parseSourceManifest(input.source);
    if (sourceManifest.error) {
        throw new BlocImportError(sourceManifest.error, 400);
    }
    const validation = validateBloc({
        tag: input.tag,
        ...(viewSource !== undefined ? { viewSource } : {}),
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
    if (nativeElement && defaultContentResult.content === undefined) {
        throw new BlocImportError("Managed native elements require default content", 400);
    }
    const managedNativeIssue =
        nativeElement && defaultContentResult.content !== undefined
            ? managedNativeElementIssue(defaultContentResult.content, [{ tag: input.tag, nativeElement }], {
                  requireExactlyOneHost: true,
              })
            : null;
    if (managedNativeIssue) {
        throw new BlocImportError(managedNativeIssue, 400);
    }

    const prepared = await buildCollectionBloc(
        viewFile,
        input.name,
        input.group ?? "",
        input.description ?? "",
        input.tag,
        input.source,
        defaultContentResult.content,
        {
            ...(input.compositionHTML !== undefined ? { compositionHTML: input.compositionHTML } : {}),
            ...(input.viewPath ? { viewPath: input.viewPath } : {}),
            ...(nativeElement ? { nativeElement } : {}),
            ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
        },
    );
    const bloc: TBloc = {
        ...prepared,
        ...(input.catalogue ? { catalogue: input.catalogue } : {}),
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
