import type { CmsSecrets } from "cms-secrets/core/CmsSecrets";

/** Structural service port; implementations need no access to the Secrets class's private stores. */
export type SecretsService = Pick<
    CmsSecrets,
    | "authorizeNamespace"
    | "createNamespace"
    | "getNamespace"
    | "createNamespaceKey"
    | "rotateNamespaceKey"
    | "revokeNamespaceKey"
    | "deleteNamespace"
    | "create"
    | "get"
    | "getByName"
    | "list"
    | "rotate"
    | "delete"
    | "resolve"
>;
export interface SecretsServices {
    readonly secrets: SecretsService;
}
