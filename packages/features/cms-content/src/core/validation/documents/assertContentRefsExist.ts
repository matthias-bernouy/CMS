import { extractRefs } from "cms-content/core/utils/contentRefs";
import { ContentValidationError } from "cms-content/core/validation/errors";
import { managedNativeElementIssue } from "cms-content/core/validation/documents/managedNativeElements";

/** Minimal reader — `CmsRepository` satisfies it structurally. */
export type ContentRefsReader = {
    getBlocsList(options?: { includeInactive?: boolean }): Promise<Array<{ id: string; nativeElement?: string }>>;
};

/**
 * Reject content that references a bloc tag missing from the repository. The CLI
 * does the same check pre-push; this is the server-side gate that catches saves
 * from the admin UI, direct API calls and any other client. Strict by design —
 * no escape hatch.
 *
 * Skipped on empty content (no refs to verify). The bloc list is fetched only
 * when the content actually contains bloc refs.
 */
export async function assertContentRefsExist(repository: ContentRefsReader, content: string): Promise<void> {
    if (!content) {
        return;
    }

    const { blocs: referencedBlocs } = extractRefs(content);
    if (referencedBlocs.size === 0) {
        return;
    }

    const missing: string[] = [];

    const registeredBlocs = await repository.getBlocsList({ includeInactive: true });
    const known = new Set(registeredBlocs.map((bloc) => bloc.id));
    for (const tag of referencedBlocs) {
        if (!known.has(tag)) {
            missing.push(`bloc "${tag}"`);
        }
    }

    if (missing.length > 0) {
        throw new ContentValidationError("content", `unknown reference(s): ${missing.join(", ")}`);
    }

    const managedIssue = managedNativeElementIssue(
        content,
        registeredBlocs.flatMap((bloc) =>
            bloc.nativeElement ? [{ tag: bloc.id, nativeElement: bloc.nativeElement }] : [],
        ),
    );
    if (managedIssue) {
        throw new ContentValidationError("content", managedIssue);
    }
}
