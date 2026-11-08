import type { z } from "zod";
import type { claimedNamespaceSchema } from "cms-repository/application/authoring/schemas/namespaces";
export type RepositoryOwnedNamespace = Readonly<{
    namespace: string;
    ownerAccountId: string;
    revision: number;
    state: "active" | "suspended";
    updatedAt: string;
}>;

export type RepositoryNamespaceView = z.output<typeof claimedNamespaceSchema>;

/** Membership existence is supplied by the runtime; authentication stays outside this domain. */
export interface RepositoryNamespaceAccounts {
    exists(accountId: string): Promise<boolean>;
}

export interface RepositoryNamespaceOwnershipStore {
    get(namespace: string): Promise<RepositoryOwnedNamespace | null>;
    /** Returns at most the fixed per-account namespace limit. */
    listOwned(accountId: string): Promise<readonly RepositoryOwnedNamespace[]>;
    /** Stops at the supplied maximum; callers only need an existence/quota decision. */
    countOwned(accountId: string, maximum: number): Promise<number>;
    /** Serializes claims, transfers and account deletion within this Repository instance. */
    exclusiveOwners<T>(operation: () => Promise<T>): Promise<T>;
    /** Held through publication; transfers acquire this same namespace fence. */
    exclusive<T>(
        namespace: string,
        operation: (
            current: RepositoryOwnedNamespace | null,
            save: (next: RepositoryOwnedNamespace) => Promise<void>,
        ) => Promise<T>,
    ): Promise<T>;
}

/** Runtime-selected cross-process lock, scoped to one Repository instance. */
export interface RepositoryNamespaceLocks {
    exclusive<T>(key: string, operation: () => Promise<T>): Promise<T>;
}
