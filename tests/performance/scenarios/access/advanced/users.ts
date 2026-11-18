import { assertCondition, requireRecord } from "../../queries/types";
import { assertAccountPage } from "./oracles";
import { accountDataset, verifyAccountPages } from "./members";
import type { AccessReadContext } from "./context";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { Variant } from "../../../capabilities/types";

export async function prepareAccountRead(
    context: AccessReadContext,
    capability: string,
    foreignCookie: string,
): Promise<PreparedSample> {
    try {
        const owner = await context.create();
        const credentials = capability === "resolve-actor" ? { cookie: owner.cookie } : undefined;
        const input =
            capability === "get-user"
                ? { sub: owner.sub }
                : capability === "list-users"
                  ? { search: owner.email, page: 1, limit: 25 }
                  : {};
        const call = (assert?: (output: unknown) => void) =>
            context.call(capability, input, assert, { httpCredentials: credentials });
        const prime = await call();
        assertCondition(prime.observation.validated);
        const first = requireRecord(prime.output);
        if (capability === "list-users") {
            assertCondition(
                Array.isArray(first.users) &&
                    first.users.length === 1 &&
                    requireRecord(first.users[0]).administrator === false,
            );
        } else {
            assertCondition(first.administrator === false);
        }
        const previous = capability === "list-users" ? requireRecord((first.users as unknown[])[0]) : first;
        const wanted = { ...previous, administrator: true, administratorRevision: 1 };
        const changed = await context.fixture("set-administrator", {
            sub: owner.sub,
            enabled: true,
            expectedRevision: 0,
        });
        assertCondition(changed.administrator === true && changed.revision === 1);
        return {
            async send() {
                return (
                    await call((output) => {
                        if (capability === "list-users") {
                            assertAccountPage(output, [wanted], 1, 25);
                        } else {
                            const result = requireRecord(output);
                            assertCondition(
                                result.administrator === true &&
                                    (capability === "get-user"
                                        ? result.sub === owner.sub && result.administratorRevision === 1
                                        : result.subjectId === owner.sub && result.authorizationRevision === 1),
                                "access-reader-stale-authority",
                            );
                        }
                    })
                ).observation;
            },
            async verify() {
                const foreign = await context.call(capability, input, undefined, {
                    httpCredentials: { cookie: foreignCookie },
                });
                if (capability === "resolve-actor") {
                    assertCondition(
                        foreign.observation.validated && requireRecord(foreign.output).state === "anonymous",
                        "foreign-session-resolved",
                    );
                } else {
                    assertCondition(
                        !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                        "foreign-session-accepted",
                    );
                    const elevated = await context.call(capability, input, undefined, {
                        httpCredentials: { cookie: owner.cookie },
                    });
                    assertCondition(elevated.observation.validated);
                    const member = await context.create();
                    const refused = await context.call(capability, input, undefined, {
                        httpCredentials: { cookie: member.cookie },
                    });
                    assertCondition(!refused.observation.validated && refused.observation.status === 403);
                }
                const saved = await context.fixture("get-user", { sub: owner.sub });
                assertCondition(saved.administrator === true && saved.administratorRevision === 1);
            },
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}

export async function prepareAccountList(context: AccessReadContext, variant: Variant): Promise<PreparedSample> {
    try {
        const expected = await accountDataset(context, variant === "history");
        return {
            async send() {
                return (
                    await context.call("list-users", { page: 1, limit: 25 }, (output) =>
                        assertAccountPage(output, expected, 1, 25),
                    )
                ).observation;
            },
            verify: () => verifyAccountPages(context, expected),
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
