import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapAccessError } from "cms-auth/application/capabilities/mapError";
import { authorizeMcpConnection } from "cms-auth/application/capabilities/mcp/authorize-mcp-connection";
import { confirmEmailVerification } from "cms-auth/application/capabilities/accounts/confirm-email-verification";
import { confirmPasswordReset } from "cms-auth/application/capabilities/accounts/confirm-password-reset";
import { createPersonalAccessToken } from "cms-auth/application/capabilities/tokens/create-personal-access-token";
import { deleteUser } from "cms-auth/application/capabilities/users/delete-user";
import { denyMcpAuthorization } from "cms-auth/application/capabilities/mcp/deny-mcp-authorization";
import { exchangeMcpToken } from "cms-auth/application/capabilities/mcp/exchange-mcp-token";
import { loginPassword } from "cms-auth/application/capabilities/sessions/login-password";
import { logout } from "cms-auth/application/capabilities/sessions/logout";
import { prepareMcpAuthorization } from "cms-auth/application/capabilities/mcp/prepare-mcp-authorization";
import { registerMcpClient } from "cms-auth/application/capabilities/mcp/register-mcp-client";
import { requestEmailVerification } from "cms-auth/application/capabilities/accounts/request-email-verification";
import { requestPasswordReset } from "cms-auth/application/capabilities/accounts/request-password-reset";
import { revokeMcpConnection } from "cms-auth/application/capabilities/mcp/revoke-mcp-connection";
import { revokePersonalAccessToken } from "cms-auth/application/capabilities/tokens/revoke-personal-access-token";
import { setAdministrator } from "cms-auth/application/capabilities/users/set-administrator";
import { signup } from "cms-auth/application/capabilities/accounts/signup";
import { getUser } from "cms-auth/application/capabilities/users/get-user";
import { inspectActor } from "cms-auth/application/capabilities/actors/inspect-actor";
import { listMcpConnections } from "cms-auth/application/capabilities/mcp/list-mcp-connections";
import { listPersonalAccessTokens } from "cms-auth/application/capabilities/tokens/list-personal-access-tokens";
import { listUsers } from "cms-auth/application/capabilities/users/list-users";
import { resolveActor } from "cms-auth/application/capabilities/actors/resolve-actor";
import { resolveMcpConnection } from "cms-auth/application/capabilities/mcp/resolve-mcp-connection";
export const accessFeature = defineFeature({
    contractId: "ulvia/cms.access",
    name: "CMS Access",
    description: "Authenticate actors and manage CMS membership and administrator grants.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "users", categories: ["administration", "access"] },
    mapError: mapAccessError,
    documents: new URL("../../docs/", import.meta.url),
    capabilities: [
        authorizeMcpConnection,
        confirmEmailVerification,
        confirmPasswordReset,
        createPersonalAccessToken,
        deleteUser,
        denyMcpAuthorization,
        exchangeMcpToken,
        loginPassword,
        logout,
        prepareMcpAuthorization,
        registerMcpClient,
        requestEmailVerification,
        requestPasswordReset,
        revokeMcpConnection,
        revokePersonalAccessToken,
        setAdministrator,
        signup,
        getUser,
        inspectActor,
        listMcpConnections,
        listPersonalAccessTokens,
        listUsers,
        resolveActor,
        resolveMcpConnection,
    ],
});
export type { AccessServices } from "cms-auth/application/interfaces/AccessServices";
export type { AccessGovernance, AccessAdministratorState } from "cms-auth/application/interfaces/AccessGovernance";
export type { AccessUser, PublicPatMetadata } from "cms-auth/application/core/access/projections";
