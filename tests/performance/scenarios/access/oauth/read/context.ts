import { createHash, randomBytes, randomUUID } from "node:crypto";
import { accessReadContext } from "../../advanced/context";
import type { AccessReadContext, OwnedAccount } from "../../advanced/context";
import { assertCondition } from "../../../queries/types";
import { oauthRedirect } from "../protocol";
import { oauthReadClient } from "./client";
import { grantId } from "./oracles";
import type { GrantEvidence } from "./oracles";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";

export function oauthReadContext(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    accounts: AccessReadContext = accessReadContext(inventory, environment),
) {
    const client = oauthReadClient(accounts.call);
    const actors: OwnedAccount[] = [];
    const grants = new Map<string, GrantEvidence>();
    const callback = `http://localhost:${new URL(environment.main.origin).port}/performance-oauth-read`;
    const clientName = `Performance OAuth Read ${randomUUID()}`;
    let clientId: string;
    let closed = false;
    const actor = async () => {
        const account = await accounts.create();
        actors.push(account);
        const result = await accounts.fixture("set-administrator", {
            sub: account.sub,
            enabled: true,
            expectedRevision: 0,
        });
        assertCondition(result.administrator === true && result.revision === 1);
        return account;
    };
    return {
        client,
        grants,
        get owner() {
            assertCondition(actors[0]);
            return actors[0];
        },
        get foreign() {
            assertCondition(actors[1]);
            return actors[1];
        },
        async initialize() {
            assertCondition(!actors.length && !closed);
            const owner = await actor();
            await actor();
            const registration = await client.preparation(owner, "register-mcp-client", {
                client_name: clientName,
                redirect_uris: [callback],
            });
            assertCondition(grantId(registration.client_id));
            clientId = registration.client_id;
        },
        async issue(owner: OwnedAccount) {
            assertCondition(!closed && actors.includes(owner) && grants.size < 160 && clientId);
            const verifier = randomBytes(48).toString("base64url");
            const state = randomUUID();
            const prepared = await client.preparation(owner, "prepare-mcp-authorization", {
                response_type: "code",
                client_id: clientId,
                redirect_uri: callback,
                resource: `${environment.main.origin}/.cms/mcp`,
                code_challenge: createHash("sha256").update(verifier).digest("base64url"),
                code_challenge_method: "S256",
                scope: "cms:full",
                state,
            });
            const authorized = await client.checked(owner, "authorize-mcp-connection", {
                requestId: prepared.requestId,
            });
            const code = oauthRedirect(authorized, callback, state).searchParams.get("code");
            const createdAfter = Date.now();
            const exchanged = await client.checked(owner, "exchange-mcp-token", {
                grant_type: "authorization_code",
                client_id: clientId,
                redirect_uri: callback,
                resource: `${environment.main.origin}/.cms/mcp`,
                code,
                code_verifier: verifier,
            });
            const createdBefore = Date.now();
            assertCondition(typeof exchanged.access_token === "string" && typeof exchanged.refresh_token === "string");
            const id = exchanged.refresh_token.split(".")[0];
            assertCondition(grantId(id) && !grants.has(id));
            const grant: GrantEvidence = {
                id,
                subjectId: owner.sub,
                clientName,
                token: exchanged.access_token,
                createdAfter,
                createdBefore,
                revoked: false,
            };
            grants.set(id, grant);
            return grant;
        },
        async revoke(grant: GrantEvidence) {
            const owner = actors.find((account) => account.sub === grant.subjectId);
            assertCondition(owner && grants.get(grant.id) === grant);
            const result = await client.checked(owner, "revoke-mcp-connection", { id: grant.id });
            assertCondition(result.revoked === true);
            grant.revoked = true;
        },
        async close() {
            if (closed) {
                return;
            }
            closed = true;
            let failed = false;
            const deadline = Date.now() + 30_000;
            for (const grant of grants.values()) {
                if (grant.revoked) {
                    continue;
                }
                if (Date.now() > deadline) {
                    failed = true;
                    break;
                }
                try {
                    const owner = actors.find((account) => account.sub === grant.subjectId)!;
                    const result = await client.checked(owner, "revoke-mcp-connection", { id: grant.id });
                    assertCondition(result.revoked === true);
                } catch {
                    failed = true;
                }
            }
            for (const owner of actors) {
                try {
                    const current = await accounts.fixture("get-user", { sub: owner.sub });
                    if (current.administrator === true) {
                        await accounts.fixture("set-administrator", {
                            sub: owner.sub,
                            enabled: false,
                            expectedRevision: current.administratorRevision,
                        });
                    }
                } catch {
                    failed = true;
                }
            }
            try {
                await accounts.close();
            } catch {
                failed = true;
            }
            assertCondition(!failed, "oauth-read-cleanup-failed");
        },
    };
}

export type OAuthReadContext = ReturnType<typeof oauthReadContext>;
