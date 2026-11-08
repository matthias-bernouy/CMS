import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapAccessError } from "auth/application/capabilities/mapError";
import { authorizeMcpConnection } from "auth/application/capabilities/mcp/authorize-mcp-connection";
import { confirmEmailVerification } from "auth/application/capabilities/accounts/confirm-email-verification";
import { confirmPasswordReset } from "auth/application/capabilities/accounts/confirm-password-reset";
import { createPersonalAccessToken } from "auth/application/capabilities/tokens/create-personal-access-token";
import { deleteUser } from "auth/application/capabilities/users/delete-user";
import { denyMcpAuthorization } from "auth/application/capabilities/mcp/deny-mcp-authorization";
import { exchangeMcpToken } from "auth/application/capabilities/mcp/exchange-mcp-token";
import { loginPassword } from "auth/application/capabilities/sessions/login-password";
import { logout } from "auth/application/capabilities/sessions/logout";
import { prepareMcpAuthorization } from "auth/application/capabilities/mcp/prepare-mcp-authorization";
import { registerMcpClient } from "auth/application/capabilities/mcp/register-mcp-client";
import { requestEmailVerification } from "auth/application/capabilities/accounts/request-email-verification";
import { requestPasswordReset } from "auth/application/capabilities/accounts/request-password-reset";
import { revokeMcpConnection } from "auth/application/capabilities/mcp/revoke-mcp-connection";
import { revokePersonalAccessToken } from "auth/application/capabilities/tokens/revoke-personal-access-token";
import { setAdministrator } from "auth/application/capabilities/users/set-administrator";
import { signup } from "auth/application/capabilities/accounts/signup";
import { getUser } from "auth/application/capabilities/users/get-user";
import { inspectActor } from "auth/application/capabilities/actors/inspect-actor";
import { listMcpConnections } from "auth/application/capabilities/mcp/list-mcp-connections";
import { listPersonalAccessTokens } from "auth/application/capabilities/tokens/list-personal-access-tokens";
import { listUsers } from "auth/application/capabilities/users/list-users";
import { resolveActor } from "auth/application/capabilities/actors/resolve-actor";
import { resolveMcpConnection } from "auth/application/capabilities/mcp/resolve-mcp-connection";
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
export type { AccessServices } from "auth/application/interfaces/AccessServices";
export type { AccessGovernance, AccessAdministratorState } from "auth/application/interfaces/AccessGovernance";
export type { AccessUser, PublicPatMetadata } from "auth/application/core/access/projections";
