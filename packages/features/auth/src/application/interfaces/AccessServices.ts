import type { AccountEmailTemplates } from "auth/email/templates/AccountEmailTemplates";
import type { UsersRepository } from "auth/accounts/interfaces/UsersRepository";
import type { LocalCredentialStore } from "auth/providers/interfaces/LocalCredentialStore";
import type { PatRepository } from "auth/tokens/personal-access/interfaces/PatRepository";
import type { LocalAuthenticationActions } from "auth/application/interfaces/LocalAuthenticationActions";
import type { PublicAuthActions } from "auth/application/interfaces/PublicAuthActions";
import type { UserDeletionStores } from "auth/application/core/account-lifecycle/deleteUserCompletely";
import type { McpAuthorization } from "auth/oauth/core/McpAuthorization";
import type { AccessGovernance } from "auth/application/interfaces/AccessGovernance";

export interface AccessServices {
    readonly accountEmailTemplates: Pick<AccountEmailTemplates, "get" | "update">;
    readonly users: UsersRepository;
    readonly credentials: LocalCredentialStore;
    readonly pats: PatRepository;
    readonly authentication: LocalAuthenticationActions;
    readonly accountLifecycle: PublicAuthActions;
    readonly mcpAuthorization: Pick<
        McpAuthorization,
        "deny" | "register" | "prepare" | "exchange" | "resolve" | "authorize" | "list" | "revoke"
    > &
        Partial<Pick<McpAuthorization, "resolveWithAuthority">>;
    readonly governance: AccessGovernance;
    readonly withUserDeletion?: UserDeletionStores["withUserDeletion"];
}
