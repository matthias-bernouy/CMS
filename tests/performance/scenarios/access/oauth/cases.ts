import { assertCondition, requireRecord } from "../../queries/types";
import { oauthFixture } from "./fixture";
import { oauthDocument, oauthRedirect, oauthSuccess } from "./protocol";
import type { OAuthLease } from "./fixture";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { QueryEnvironment } from "../../queries/execute";

export async function prepareOAuth(
    lease: OAuthLease,
    capability: string,
    environment: QueryEnvironment,
): Promise<PreparedSample> {
    try {
        const state = await oauthFixture(lease, capability);
        let result: Readonly<Record<string, unknown>> | undefined;
        let grantId = state.grantId;
        return {
            async send() {
                return (
                    await state.call(capability, state.input, (output) => {
                        result = oauthSuccess(output);
                        if (capability === "register-mcp-client") {
                            assertCondition(
                                typeof result.client_id === "string" &&
                                    result.client_name === state.registration.client_name,
                            );
                        } else if (capability === "prepare-mcp-authorization") {
                            assertCondition(
                                typeof result.requestId === "string" && result.redirectUri === state.callback,
                            );
                        } else if (
                            capability === "authorize-mcp-connection" ||
                            capability === "deny-mcp-authorization"
                        ) {
                            const redirect = oauthRedirect(result, state.callback, state.state);
                            assertCondition(
                                capability === "deny-mcp-authorization"
                                    ? redirect.searchParams.get("error") === "access_denied"
                                    : Boolean(redirect.searchParams.get("code")),
                            );
                        } else if (capability === "exchange-mcp-token") {
                            assertCondition(
                                typeof result.access_token === "string" &&
                                    typeof result.refresh_token === "string" &&
                                    result.expires_in === 900,
                            );
                            grantId = result.refresh_token.split(".")[0];
                        } else if (capability === "resolve-mcp-connection") {
                            assertCondition(
                                result.subjectId === state.tenant.session.subjectId &&
                                    Number.isSafeInteger(result.authorizationRevision),
                            );
                        } else if (capability === "list-mcp-connections") {
                            assertCondition(
                                Array.isArray(result.items) &&
                                    result.items.some((entry) => entry.id === grantId && entry.revoked === false),
                            );
                        } else {
                            assertCondition(result.revoked === true);
                        }
                        return result;
                    })
                ).observation;
            },
            async verify() {
                if (
                    ["authorize-mcp-connection", "list-mcp-connections", "revoke-mcp-connection"].includes(capability)
                ) {
                    const foreign = await state.tenant.client(
                        "ulvia/cms.access",
                        capability,
                        "http",
                        { requestJson: JSON.stringify(state.input) },
                        undefined,
                        { httpCredentials: { cookie: environment.main.cookie } },
                    );
                    assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                }
                if (capability === "register-mcp-client" || capability === "prepare-mcp-authorization") {
                    const prepared =
                        capability === "register-mcp-client"
                            ? await state.checked("prepare-mcp-authorization", state.prepare(result!.client_id))
                            : result!;
                    const denied = await state.checked("deny-mcp-authorization", { requestId: prepared.requestId });
                    assertCondition(
                        oauthRedirect(denied, state.callback, state.state).searchParams.get("error") ===
                            "access_denied",
                    );
                } else if (capability === "deny-mcp-authorization") {
                    const refused = await state.call(
                        "authorize-mcp-connection",
                        { requestId: state.prepared!.requestId },
                        oauthDocument,
                    );
                    assertCondition(oauthDocument(refused.output).error === "invalid_grant");
                } else {
                    const token =
                        capability === "authorize-mcp-connection"
                            ? await state.checked("exchange-mcp-token", state.exchange(result!))
                            : capability === "exchange-mcp-token"
                              ? result!
                              : state.exchanged!;
                    grantId = String(token.refresh_token).split(".")[0];
                    const resolved = await state.call(
                        "resolve-mcp-connection",
                        { token: token.access_token },
                        oauthDocument,
                    );
                    const principal = oauthDocument(resolved.output);
                    assertCondition(
                        capability === "revoke-mcp-connection"
                            ? principal.error === "invalid_token"
                            : principal.subjectId === state.tenant.session.subjectId,
                    );
                    if (capability === "authorize-mcp-connection") {
                        const replay = await state.call(capability, state.input, oauthDocument);
                        assertCondition(oauthDocument(replay.output).error === "invalid_grant");
                        const unchanged = await state.checked("resolve-mcp-connection", { token: token.access_token });
                        assertCondition(
                            unchanged.connectionId === principal.connectionId &&
                                unchanged.subjectId === principal.subjectId,
                        );
                    }
                    if (capability === "exchange-mcp-token") {
                        const replay = await state.call(capability, state.input, oauthDocument);
                        assertCondition(oauthDocument(replay.output).error === "invalid_grant");
                    }
                    if (capability === "revoke-mcp-connection") {
                        const listed = await state.checked("list-mcp-connections", { limit: 100 });
                        assertCondition(
                            Array.isArray(listed.items) &&
                                listed.items.some(
                                    (entry) => entry.id === grantId && requireRecord(entry).revoked === true,
                                ),
                        );
                    }
                }
            },
            async close() {
                try {
                    if (grantId) {
                        await state.checked("revoke-mcp-connection", { id: grantId });
                    }
                } finally {
                    lease.release();
                }
            },
        };
    } catch (error) {
        lease.release();
        throw error;
    }
}
