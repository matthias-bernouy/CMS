import type { TPageRef } from "cms-content/pages/interfaces/pages";
import { validatePageReference } from "cms-content/pages/core/routing/values";

export function coercePageRef(raw: unknown): TPageRef {
    if (raw === null || raw === undefined || raw === "") {
        return null;
    }
    if (typeof raw === "string") {
        try {
            return validatePageReference({ pageId: raw });
        } catch {
            return null;
        }
    }
    if (typeof raw === "object" && raw !== null && "pageId" in raw) {
        try {
            return validatePageReference(raw as Exclude<TPageRef, null>);
        } catch {
            return null;
        }
    }
    return null;
}

export function pageRefToString(ref: TPageRef | undefined): string {
    return ref?.pageId ?? "";
}
