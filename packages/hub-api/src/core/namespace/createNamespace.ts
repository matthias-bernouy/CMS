import type { Namespace } from "src/interfaces/Namespace";
import type { NamespaceRepository } from "src/interfaces/NamespaceRepository";
import type { CreateNamespaceInput } from "src/core/schemas/namespace";

/** Persist a new namespace. No Keycloak / SMTP / OIDC touched — the hub is
 *  pure metadata for namespaces. */
export async function createNamespace(
    repo: NamespaceRepository,
    input: CreateNamespaceInput,
): Promise<Namespace> {
    const ns: Namespace = {
        namespaceId: input.namespaceId,
        displayName: input.displayName,
        ...(input.description !== undefined ? { description: input.description } : {}),
        createdAt:   new Date(),
    };
    return repo.insertNamespace(ns);
}
