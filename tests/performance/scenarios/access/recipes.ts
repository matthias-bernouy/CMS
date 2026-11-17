import { repositoryApi } from "../../../integration/instance/repository/client";
import { assertCondition, requireRecord } from "../queries/types";
import { accessFixture } from "./fixture";
import type { ScenarioClient } from "../../harness/clients/session";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareAccess(
    client: ScenarioClient,
    capability: string,
    origin: string,
): Promise<PreparedSample> {
    const state = await accessFixture(client, capability, origin);
    let output: Readonly<Record<string, unknown>> | undefined;
    let cookie: string | undefined;
    let created = state.user;
    let completed = false;
    return {
        async send() {
            const result = await state.call(
                capability,
                state.input,
                (value) => {
                    output = requireRecord(value);
                    if (capability === "signup") {
                        assertCondition(output.accepted === true);
                    } else if (capability === "login-password") {
                        assertCondition(output.subjectId === state.user!.accountId && output.administrator === false);
                    } else if (capability === "logout") {
                        assertCondition(output.cleared === true);
                    } else if (capability === "delete-user") {
                        assertCondition(output.sub === state.user!.accountId && output.deleted === true);
                    } else if (capability === "set-administrator") {
                        assertCondition(
                            output.sub === state.user!.accountId &&
                                output.administrator === true &&
                                output.revision === 1,
                        );
                    } else if (capability === "create-personal-access-token") {
                        assertCondition(typeof output.token === "string" && output.token.length > 0);
                        assertCondition(requireRecord(output.metadata).name === state.name);
                    } else if (capability === "revoke-personal-access-token") {
                        assertCondition(output.revoked === true);
                    }
                },
                {
                    ...(state.rootCredentials ? { httpCredentials: state.rootCredentials } : {}),
                    captureHeaders: (headers) => {
                        cookie = headers
                            .getSetCookie()
                            .map((value) => value.split(";")[0]!)
                            .join("; ");
                    },
                },
            );
            completed = result.observation.validated;
            return result.observation;
        },
        async verify() {
            if (capability === "signup") {
                created = await repositoryApi(origin).session(state.email, state.password);
                const saved = await state.fixture("get-user", { sub: created.accountId });
                assertCondition(saved.email === state.email && saved.administrator === false);
            } else if (capability === "login-password") {
                assertCondition(cookie && cookie.length > 0);
                await state.actor({ cookie }, true);
            } else if (capability === "logout") {
                assertCondition(cookie && cookie.length > 0);
                await state.actor(state.credentials, false);
            } else if (capability === "delete-user") {
                const missing = await state.call("get-user", { sub: state.user!.accountId });
                assertCondition(missing.observation.status === 404);
                await state.actor(state.credentials, false);
            } else if (capability === "set-administrator") {
                const saved = await state.fixture("get-user", { sub: state.user!.accountId });
                assertCondition(saved.administrator === true && saved.administratorRevision === 1);
                assertCondition((await state.actor(state.credentials, true)).administrator === true);
            } else if (capability === "create-personal-access-token") {
                await state.actor({ token: String(output!.token) }, true);
                const listing = await state.fixture("list-personal-access-tokens", {}, state.credentials);
                assertCondition(
                    Array.isArray(listing.tokens) &&
                        listing.tokens.some((item) => item.id === requireRecord(output!.metadata).id),
                );
            } else if (capability === "revoke-personal-access-token") {
                await state.actor({ token: String(state.token!.token) }, false);
            }
        },
        async close() {
            if (created && !(capability === "delete-user" && completed)) {
                await state.fixture("delete-user", { sub: created.accountId });
            }
        },
    };
}
