import type { PageSurface } from "cms-content/pages/interfaces/document";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import type { TBloc } from "cms-content/blocs/interfaces/blocs";
import { createBlocUsageResolver } from "cms-content/blocs/core/usage/resolveUsedBlocTags";

type SurfaceBloc = Pick<TBloc, "id" | "surfaces" | "uses" | "compositionHTML" | "componentHTML">;

export type ContentSurfaceReader = {
    getBlocsList(options?: { includeInactive?: boolean }): Promise<SurfaceBloc[]>;
    getBlocViewJS?(tag: string): Promise<string | null>;
};

/** Rejects direct and transitive Bloc references outside a Page's single surface. */
export async function assertContentSupportsSurface(
    repository: ContentSurfaceReader,
    content: string,
    surface: PageSurface,
): Promise<void> {
    if (!content) {
        return;
    }
    const blocs = await repository.getBlocsList({ includeInactive: true });
    const used = await createBlocUsageResolver(blocs, {
        getBlocViewJS: repository.getBlocViewJS?.bind(repository) ?? (async () => null),
    })(content);
    const byId = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    const incompatible = used.find((tag) => {
        const supported = byId.get(tag)?.surfaces ?? ["control", "delivery"];
        return !supported.includes(surface);
    });
    if (incompatible) {
        throw new ContentValidationError("content", `bloc "${incompatible}" does not support the ${surface} surface`);
    }
}
