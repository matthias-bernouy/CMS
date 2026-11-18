import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../../integration/instance/repository/client";
import { accessCalls } from "../fixture";
import { scenarioClient } from "../../../harness/clients/session";
import { assertCondition, requireRecord } from "../../queries/types";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export type OwnedAccount = Readonly<{ email: string; sub: string; cookie: string }>;

/** Account IDs come only from a completed signup or an exact lookup of a previously attempted owned email. */
export function accessReadContext(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    signup = (email: string, password: string) => repositoryApi(environment.main.origin).signup(email, password),
) {
    const calls = accessCalls(scenarioClient(inventory, environment.main));
    const owned = new Map<string, string | undefined>();
    const create = async (): Promise<OwnedAccount> => {
        const email = `access-read-${randomUUID()}@performance.test`;
        owned.set(email, undefined);
        const user = await signup(email, `Fixture-${randomUUID()}!`);
        owned.set(email, user.accountId);
        return { email, sub: user.accountId, cookie: user.cookie };
    };
    const close = async () => {
        let firstError: unknown;
        for (const [email, known] of owned) {
            try {
                let sub = known;
                if (!sub) {
                    const page = await calls.fixture("list-users", { search: email, page: 1, limit: 2 });
                    assertCondition(Array.isArray(page.users) && page.users.length <= 1);
                    if (page.users.length) {
                        const user = requireRecord(page.users[0]);
                        assertCondition(user.email === email && typeof user.sub === "string");
                        sub = user.sub;
                    }
                }
                if (sub) {
                    const result = await calls.fixture("delete-user", { sub });
                    assertCondition(result.sub === sub && result.deleted === true);
                }
                owned.delete(email);
            } catch (error) {
                firstError ??= error;
            }
        }
        if (firstError) {
            throw firstError;
        }
    };
    return { ...calls, create, close };
}

export type AccessReadContext = ReturnType<typeof accessReadContext>;
