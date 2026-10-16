import { parseHTML } from "linkedom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { pageBlocHostAttributesIssue } from "cms-content/blocs/core/markup/validation/contracts/hostAttributes";
import type { BlocSettings, ManagedNativeElement } from "cms-content/pages/interfaces/document";

type BlocSettingsContract = { id: string; root: ManagedNativeElement; settings?: BlocSettings };

/** Validate each stored host's attributes against its installed bloc definition. */
export function assertBlocSettingAttributes(content: string, blocs: readonly BlocSettingsContract[]): void {
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = content;
    for (const bloc of blocs) {
        for (const host of Array.from(document.querySelectorAll(`[cms-bloc="${bloc.id}"]`))) {
            const issue = pageBlocHostAttributesIssue(
                Object.fromEntries(host.getAttributeNames().map((name) => [name, host.getAttribute(name) ?? ""])),
                { id: bloc.id, root: bloc.root, settings: bloc.settings },
                host.parentElement !== document.body,
                true,
                false,
                host.localName,
            );
            if (issue) {
                throw new ContentValidationError("content", issue);
            }
        }
    }
}
