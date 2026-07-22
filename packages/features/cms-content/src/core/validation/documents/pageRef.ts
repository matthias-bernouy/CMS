import type { TPageRef } from "cms-content/interfaces/pages";

export function coercePageRef(raw: unknown): TPageRef {
    if (raw === null || raw === undefined || raw === "") {
        return null;
    }
    if (typeof raw === "string") {
        return { path: raw };
    }
    if (typeof raw === "object" && raw !== null && "path" in raw) {
        const path = (raw as { path: unknown }).path;
        return typeof path === "string" && path !== "" ? { path } : null;
    }
    return null;
}

export function pageRefToString(ref: TPageRef | undefined): string {
    return ref && typeof ref === "object" && "path" in ref ? ref.path : "";
}
