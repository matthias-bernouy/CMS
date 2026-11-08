import { RepositoryRequestError } from "../../core/errors";
import { assertRepositoryNamespace } from "../validation";
import type {
    RepositoryNamespaceAccounts,
    RepositoryNamespaceOwnershipStore,
    RepositoryNamespaceView,
    RepositoryOwnedNamespace,
} from "./interfaces";
import {
    MAX_ACCOUNT_NAMESPACES,
    namespaceAccountId,
    namespaceRevision,
    namespaceView,
} from "repository/repository/namespaces/accounts/validation";

/** Account ownership is independent of credentials; every call receives a verified account identity. */
export class RepositoryNamespaces {
    constructor(
        private readonly store: RepositoryNamespaceOwnershipStore,
        private readonly accounts: RepositoryNamespaceAccounts,
    ) {}

    async get(namespace: string): Promise<RepositoryNamespaceView | null> {
        assertRepositoryNamespace(namespace);
        const current = await this.store.get(namespace);
        return current ? namespaceView(current) : null;
    }

    async listOwned(accountId: string): Promise<readonly RepositoryNamespaceView[]> {
        await this.activeAccount(accountId);
        return (await this.store.listOwned(accountId)).map(namespaceView);
    }

    async claim(accountId: string, namespace: string): Promise<RepositoryNamespaceView> {
        assertRepositoryNamespace(namespace);
        return this.store.exclusiveOwners(async () => {
            await this.activeAccount(accountId);
            return this.store.exclusive(namespace, async (current, save) => {
                if (current) {
                    if (current.ownerAccountId === accountId && current.state === "active") {
                        return namespaceView(current);
                    }
                    throw new RepositoryRequestError("REJECTED", "Namespace is already reserved");
                }
                await this.availableQuota(accountId);
                const next: RepositoryOwnedNamespace = {
                    namespace,
                    ownerAccountId: accountId,
                    revision: 1,
                    state: "active",
                    updatedAt: new Date().toISOString(),
                };
                await save(next);
                return namespaceView(next);
            });
        });
    }

    async transfer(accountId: string, namespace: string, expectedRevision: number, targetAccountId: string) {
        assertRepositoryNamespace(namespace);
        namespaceRevision(expectedRevision);
        return this.store.exclusiveOwners(() =>
            this.store.exclusive(namespace, async (current, save) => {
                await this.owner(accountId, current, expectedRevision, false);
                await this.activeAccount(targetAccountId);
                if (targetAccountId === accountId) {
                    throw new RepositoryRequestError("REJECTED", "Namespace already belongs to this account");
                }
                await this.availableQuota(targetAccountId);
                const next: RepositoryOwnedNamespace = {
                    ...current!,
                    ownerAccountId: targetAccountId,
                    revision: current!.revision + 1,
                    updatedAt: new Date().toISOString(),
                };
                await save(next);
                return namespaceView(next);
            }),
        );
    }

    async suspend(accountId: string, namespace: string, expectedRevision: number) {
        assertRepositoryNamespace(namespace);
        namespaceRevision(expectedRevision);
        return this.store.exclusive(namespace, async (current, save) => {
            await this.owner(accountId, current, expectedRevision);
            const next: RepositoryOwnedNamespace = {
                ...current!,
                revision: current!.revision + 1,
                state: "suspended",
                updatedAt: new Date().toISOString(),
            };
            await save(next);
            return namespaceView(next);
        });
    }

    async execute<T>(
        accountId: string,
        namespace: string,
        expectedRevision: number,
        operation: () => Promise<T>,
    ): Promise<T> {
        assertRepositoryNamespace(namespace);
        namespaceRevision(expectedRevision);
        return this.store.exclusive(namespace, async (current) => {
            await this.owner(accountId, current, expectedRevision);
            return operation();
        });
    }

    /** Hold the ownership fence before any credential, token or membership deletion takes place. */
    async withoutOwnedNamespaces<T>(accountId: string, deletion: () => Promise<T>): Promise<T> {
        namespaceAccountId(accountId);
        return this.store.exclusiveOwners(async () => {
            if (await this.store.countOwned(accountId, 1)) {
                throw new RepositoryRequestError("REJECTED", "Transfer owned namespaces before deleting this account");
            }
            return deletion();
        });
    }

    private async owner(
        accountId: string,
        current: RepositoryOwnedNamespace | null,
        revision: number,
        requireActive = true,
    ): Promise<void> {
        await this.activeAccount(accountId);
        if (
            !current ||
            current.ownerAccountId !== accountId ||
            current.revision !== revision ||
            (requireActive && current.state !== "active")
        ) {
            throw new RepositoryRequestError("REJECTED", "Namespace ownership is unavailable or stale");
        }
    }

    private async activeAccount(accountId: string): Promise<void> {
        namespaceAccountId(accountId);
        if (!(await this.accounts.exists(accountId))) {
            throw new RepositoryRequestError("REJECTED", "Namespace account is unavailable");
        }
    }

    private async availableQuota(accountId: string): Promise<void> {
        if ((await this.store.countOwned(accountId, MAX_ACCOUNT_NAMESPACES)) >= MAX_ACCOUNT_NAMESPACES) {
            throw new RepositoryRequestError("REJECTED", "Account namespace limit reached");
        }
    }
}
