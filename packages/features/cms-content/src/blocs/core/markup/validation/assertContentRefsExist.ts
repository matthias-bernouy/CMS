import { extractRefs } from "cms-content/blocs/core/markup/contentRefs";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { managedNativeElementIssue } from "cms-content/blocs/core/markup/validation/managedNativeElements";
import { assertCollectionSettingAttributes } from "cms-content/blocs/core/markup/validation/collectionSettings";
import type { CollectionComponentSettings } from "@bernouy/cms-repository/collections";
import type { TBloc } from "cms-content/blocs/interfaces/blocs";
import { parseHTML } from "linkedom";
import { isValidCustomElementTag } from "cms-content/application/core/validation/predicates";
import { blocHostContractIssue } from "cms-content/blocs/core/markup/validation/pageSlotContracts";

/** Minimal reader — `CmsRepository` satisfies it structurally. */
export type ContentRefsReader = {
    getBlocsList(options?: { includeInactive?: boolean }): Promise<
        Array<{
            id: string;
            nativeElement?: TBloc["nativeElement"];
            collectionSlots?: TBloc["collectionSlots"];
            collectionSettings?: CollectionComponentSettings;
        }>
    >;
};

/**
 * Server-side Page grammar gate. Every root is an active Bloc and every child
 * must satisfy the direct parent's managed-native or named-slot contract.
 */
export async function assertContentRefsExist(repository: ContentRefsReader, content: string): Promise<void> {
    if (!content) {
        return;
    }

    const { blocs: referencedBlocs } = extractRefs(content);
    const missing: string[] = [];
    const registeredBlocs = await repository.getBlocsList();
    const known = new Map(registeredBlocs.map((bloc) => [bloc.id, bloc]));
    for (const tag of referencedBlocs) {
        if (!known.has(tag)) {
            missing.push(`bloc "${tag}"`);
        }
    }

    if (missing.length > 0) {
        throw new ContentValidationError("content", `unknown or inactive reference(s): ${missing.join(", ")}`);
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
    assertCollectionSettingAttributes(content, registeredBlocs);

    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = content;
    for (const node of Array.from(document.body.childNodes)) {
        if (node.nodeType === 3 && node.textContent?.trim()) {
            throw new ContentValidationError("content", "Page root text must be owned by a Bloc slot");
        }
        if (node.nodeType !== 1) {
            continue;
        }
        const root = node as Element;
        if (!isValidCustomElementTag(root.localName)) {
            throw new ContentValidationError(
                "content",
                `native <${root.localName}> cannot be a Page root; add it through a Bloc contract`,
            );
        }
        const bloc = known.get(root.localName);
        if (!bloc) {
            throw new ContentValidationError("content", `unavailable Page root Bloc <${root.localName}>`);
        }
        const issue = blocHostContractIssue(root, bloc, known);
        if (issue) {
            throw new ContentValidationError("content", issue);
        }
    }
}
