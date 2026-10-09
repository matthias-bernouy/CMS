import { pageBlocHostAttributesIssue, type CollectionComponentSettings } from "@bernouy/cms-repository/collections";
import { parseHTML } from "linkedom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";

type BlocSettings = { id: string; collectionSettings?: CollectionComponentSettings };

/** Validate each stored host's attributes against its installed bloc definition. */
export function assertCollectionSettingAttributes(content: string, blocs: readonly BlocSettings[]): void {
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = content;
    for (const bloc of blocs) {
        for (const host of Array.from(document.querySelectorAll(bloc.id))) {
            const issue = pageBlocHostAttributesIssue(
                Object.fromEntries(host.getAttributeNames().map((name) => [name, host.getAttribute(name) ?? ""])),
                { id: bloc.id, settings: bloc.collectionSettings },
                host.parentElement !== document.body,
            );
            if (issue) {
                throw new ContentValidationError("content", issue);
            }
        }
    }
}
