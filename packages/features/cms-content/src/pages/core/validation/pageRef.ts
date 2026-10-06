import type { TPageRef } from "cms-content/pages/interfaces/pages";
import { validatePageReference } from "cms-content/pages/core/routing/values";

export function coercePageRef(raw: unknown): TPageRef {
    if (raw === null || raw === undefined || raw === "") {
        return null;
    }
    if (typeof raw === "string") {
        try {
            return validatePageReference({ kind: "site", pageId: raw }) as Exclude<TPageRef, null>;
        } catch {
            return null;
        }
    }
    if (typeof raw === "object" && raw !== null && "kind" in raw && "pageId" in raw) {
        try {
            const reference = validatePageReference(raw as Exclude<TPageRef, null>);
            return reference.kind === "site" ? reference : null;
        } catch {
            return null;
        }
    }
    return null;
}

export function pageRefToString(ref: TPageRef | undefined): string {
    return ref?.pageId ?? "";
}
