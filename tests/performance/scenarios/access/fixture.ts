import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../integration/instance/repository/client";
import { assertCondition, requireRecord } from "../queries/types";
import { ClientFailure } from "../../harness/clients/failure";
import type { ScenarioClient } from "../../harness/clients/session";
import type { ClientCall } from "../../harness/clients/types";

export const ACCESS_LIFECYCLE = [
    "signup",
    "login-password",
    "logout",
    "delete-user",
    "set-administrator",
    "create-personal-access-token",
    "revoke-personal-access-token",
] as const;

export function accessCalls(client: ScenarioClient) {
    const call = (
        capability: string,
        input: Readonly<Record<string, unknown>>,
        assert?: (output: unknown) => void,
        options?: { httpCredentials?: ClientCall["credentials"]; captureHeaders?: ClientCall["captureHeaders"] },
    ) => client("ulvia/cms.access", capability, "http", input, assert, options);
    const fixture = async (
        capability: string,
        input: Readonly<Record<string, unknown>>,
        credentials?: ClientCall["credentials"],
    ) => {
        const result = await call(capability, input, undefined, credentials ? { httpCredentials: credentials } : {});
        if (!result.observation.validated) {
            throw new ClientFailure(`fixture-${capability}-${result.observation.failure ?? "invalid-result"}`);
        }
        return requireRecord(result.output);
    };
    return { call, fixture };
}

export async function accessFixture(client: ScenarioClient, capability: string, origin: string) {
    const calls = accessCalls(client);
    const id = randomUUID();
    const name = `performance-${id}`;
    const email = `${name}@performance.test`;
    const password = `Performance-${randomUUID()}!`;
    const user = capability === "signup" ? null : await repositoryApi(origin).signup(email, password);
    const credentials = user ? { cookie: user.cookie } : {};
    const token =
        capability === "revoke-personal-access-token"
            ? await calls.fixture("create-personal-access-token", { name }, credentials)
            : null;
    const input = ["signup", "login-password"].includes(capability)
        ? { email, password }
        : capability === "delete-user"
          ? { sub: user!.accountId }
          : capability === "set-administrator"
            ? { sub: user!.accountId, enabled: true, expectedRevision: 0 }
            : capability === "create-personal-access-token"
              ? { name }
              : capability === "revoke-personal-access-token"
                ? { id: requireRecord(token!.metadata).id }
                : {};
    const rootCredentials = ["delete-user", "set-administrator"].includes(capability) ? undefined : credentials;
    const actor = async (credential: ClientCall["credentials"], authenticated: boolean) => {
        const current = await calls.fixture("resolve-actor", {}, credential);
        assertCondition(current.state === (authenticated ? "authenticated" : "anonymous"));
        if (authenticated) {
            assertCondition(current.subjectId === user!.accountId);
        }
        return current;
    };
    return { ...calls, name, email, password, user, credentials, token, input, rootCredentials, actor };
}
