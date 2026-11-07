import type { UsersRepository } from "cms-auth/accounts/interfaces/UsersRepository";
import type { LocalCredentialStore } from "cms-auth/providers/interfaces/LocalCredentialStore";
import type { PatRepository } from "cms-auth/tokens/personal-access/interfaces/PatRepository";
import type { LocalAuthenticationActions } from "cms-auth/application/interfaces/LocalAuthenticationActions";
import type { PublicAuthActions } from "cms-auth/application/interfaces/PublicAuthActions";
import type { UserDeletionStores } from "cms-auth/application/core/account-lifecycle/deleteUserCompletely";
import type { McpAuthorization } from "cms-auth/oauth/core/McpAuthorization";
import type { AccessGovernance } from "cms-auth/application/interfaces/AccessGovernance";

export interface AccessServices {
    readonly users: UsersRepository;
    readonly credentials: LocalCredentialStore;
    readonly pats: PatRepository;
    readonly authentication: LocalAuthenticationActions;
    readonly accountLifecycle: PublicAuthActions;
    readonly mcpAuthorization: Pick<
        McpAuthorization,
        "deny" | "register" | "prepare" | "exchange" | "resolve" | "authorize" | "list" | "revoke"
    >;
    readonly governance: AccessGovernance;
    readonly withUserDeletion?: UserDeletionStores["withUserDeletion"];
}
