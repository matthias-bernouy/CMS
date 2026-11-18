import { ContentValidationError } from "content/application/core/validation/errors";

export const SITE_BLOC_DOCUMENT_LIMIT = 4 * 1024 * 1024;

export function checkSnapshotBytes(source: string) {
    if (
        typeof source !== "string" ||
        source.length > SITE_BLOC_DOCUMENT_LIMIT ||
        Buffer.byteLength(source) > SITE_BLOC_DOCUMENT_LIMIT
    ) {
        throw new ContentValidationError("draftJson", "document exceeds the 4 MiB UTF-8 limit");
    }
}

/** Bound traversal before recursive validation, serialization and cloning, for every authoring entrypoint. */
export function checkSnapshotBudget(value: unknown) {
    const pending = [{ value, depth: 0 }];
    let count = 0;
    let bytes = 0;
    while (pending.length) {
        const entry = pending.pop()!;
        if (typeof entry.value === "string") {
            bytes += Buffer.byteLength(entry.value);
        }
        if (entry.depth > 256 || ++count > 262144) {
            throw new ContentValidationError("draft", "document traversal budget exceeded");
        }
        if (entry.value && typeof entry.value === "object") {
            for (const [key, child] of Object.entries(entry.value)) {
                if (child === undefined) {
                    continue;
                }
                if (!Array.isArray(entry.value)) {
                    bytes += Buffer.byteLength(key) + 1;
                }
                if (pending.length + count >= 262144) {
                    throw new ContentValidationError("draft", "document traversal budget exceeded");
                }
                pending.push({ value: child, depth: entry.depth + 1 });
            }
        }
        if (bytes > SITE_BLOC_DOCUMENT_LIMIT) {
            throw new ContentValidationError("draft", "document exceeds the 4 MiB UTF-8 limit");
        }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return;
    }
    const snapshot = value as Record<string, unknown>;
    for (const [field, maximum] of [
        ["name", 120],
        ["group", 120],
        ["description", 500],
    ] as const) {
        if (typeof snapshot[field] !== "string" || snapshot[field].length > maximum) {
            throw new ContentValidationError(`draft.${field}`, `a string of at most ${maximum} characters is required`);
        }
    }
    const structure = Array.isArray(snapshot.structure) ? snapshot.structure.map((node) => ({ node, depth: 1 })) : [];
    let nodes = 0;
    while (structure.length) {
        const { node, depth } = structure.pop()!;
        if (++nodes > 16384 || depth > 64) {
            throw new ContentValidationError("draft.structure", "at most 16,384 nodes and 64 levels are supported");
        }
        if (node && typeof node === "object" && node.kind === "bloc" && Array.isArray(node.children)) {
            if (structure.length + nodes + node.children.length > 16384) {
                throw new ContentValidationError("draft.structure", "at most 16,384 nodes are supported");
            }
            for (const child of node.children) {
                structure.push({ node: child, depth: depth + 1 });
            }
        }
    }
}
