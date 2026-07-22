import type { DetailSelection } from "../../domain";
import { resolveExpression } from "../../runtime/expressions";

export function downloadBlob(blob: Blob, filename: string): void {
    if (typeof URL.createObjectURL !== "function") {
        throw new Error("Downloads are not supported in this browser");
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    if (typeof URL.revokeObjectURL === "function") {
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}

export function createdId(value: unknown): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const id = (value as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) {
        return id;
    }
    if (typeof id === "number" && Number.isFinite(id)) {
        return String(id);
    }
    return null;
}

export function afterTarget(
    after: { opens: string; row?: string } | undefined,
    result: unknown,
    detail: DetailSelection | null,
): DetailSelection | null {
    if (!after?.opens) {
        return null;
    }
    const rowValue =
        after.row === undefined
            ? createdId(result)
            : resolveExpression(after.row, {
                  result,
                  ...(detail ? { selection: { id: detail.row } } : {}),
              });
    const row = stringValue(rowValue);
    return row ? { collection: after.opens, row } : null;
}

function stringValue(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return "";
}
