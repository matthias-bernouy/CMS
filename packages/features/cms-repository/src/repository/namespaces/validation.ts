import { RepositoryRequestError } from "../core/errors";

export function assertRepositoryNamespace(namespace: string): void {
    if (
        typeof namespace !== "string" ||
        !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(namespace) ||
        namespace.length > 96
    ) {
        throw new RepositoryRequestError("REJECTED", "Invalid repository namespace");
    }
}
