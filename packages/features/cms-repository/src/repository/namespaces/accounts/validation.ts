import { RepositoryRequestError } from "../../core/errors";
import type { RepositoryNamespaceView, RepositoryOwnedNamespace } from "./interfaces";

export const MAX_ACCOUNT_NAMESPACES = 32;

export function namespaceAccountId(value: string): void {
    if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new RepositoryRequestError("REJECTED", "Invalid namespace account");
    }
}

export function namespaceRevision(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RepositoryRequestError("REJECTED", "Invalid namespace revision");
    }
}

export function namespaceView(record: RepositoryOwnedNamespace): RepositoryNamespaceView {
    return Object.freeze({
        namespace: record.namespace,
        revision: record.revision,
        state: record.state,
        updatedAt: record.updatedAt,
    });
}
