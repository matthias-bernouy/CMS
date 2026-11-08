import { RepositoryRequestError } from "../core/errors";

export function repositoryAccount(accountId?: string): string {
    if (!accountId) {
        throw new RepositoryRequestError("REJECTED", "An authenticated account is required");
    }
    return accountId;
}
