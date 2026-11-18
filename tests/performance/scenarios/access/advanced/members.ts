import { assertCondition, requireRecord } from "../../queries/types";
import { assertAccountPage } from "./oracles";
import type { AccessReadContext } from "./context";

/** All pages are read through the real capability, with bounded pagination and no hidden account discovery. */
export async function accountSnapshot(context: AccessReadContext) {
    const users: Readonly<Record<string, unknown>>[] = [];
    let expectedTotal: number | undefined;
    for (let page = 1; page <= 128; page++) {
        const output = await context.fixture("list-users", { page, limit: 100 });
        assertCondition(Array.isArray(output.users) && Number.isSafeInteger(output.total), "account-snapshot-invalid");
        expectedTotal ??= Number(output.total);
        assertCondition(
            output.total === expectedTotal && output.page === page && output.limit === 100,
            "account-snapshot-changed",
        );
        users.push(...output.users.map(requireRecord));
        if (output.hasMore === false) {
            assertCondition(
                users.length === expectedTotal && new Set(users.map((row) => row.sub)).size === expectedTotal,
            );
            return users;
        }
        assertCondition(output.users.length === 100, "account-snapshot-incomplete-page");
    }
    throw new Error("Account snapshot exceeded its page bound");
}

export async function accountDataset(context: AccessReadContext, history: boolean) {
    const before = await accountSnapshot(context);
    const added: Readonly<Record<string, unknown>>[] = [];
    for (let index = 0; index < 100; index++) {
        const account = await context.create();
        const initial = await context.fixture("get-user", { sub: account.sub });
        assertCondition(
            initial.email === account.email && initial.administrator === false && initial.administratorRevision === 0,
        );
        let current = initial;
        if (history && index < 8) {
            for (let revision = 0; revision < 8; revision++) {
                const changed = await context.fixture("set-administrator", {
                    sub: account.sub,
                    enabled: revision % 2 === 0,
                    expectedRevision: revision,
                });
                assertCondition(changed.revision === revision + 1 && changed.administrator === (revision % 2 === 0));
            }
            current = await context.fixture("get-user", { sub: account.sub });
            assertCondition(
                current.administrator === false && current.administratorRevision === 8,
                "account-history-not-retained",
            );
        }
        added.push(current);
    }
    assertCondition(
        new Set(added.map((row) => row.createdAt)).size === added.length,
        "account-fixture-ambiguous-order",
    );
    return [...before, ...added].toSorted((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function verifyAccountPages(
    context: AccessReadContext,
    expected: readonly Readonly<Record<string, unknown>>[],
) {
    const seen = new Set<unknown>();
    for (let page = 1; page <= Math.ceil(expected.length / 25) + 1; page++) {
        const output = await context.fixture("list-users", { page, limit: 25 });
        assertAccountPage(output, expected, page, 25);
        for (const value of output.users as unknown[]) {
            const user = requireRecord(value);
            assertCondition(!seen.has(user.sub), "account-pagination-duplicate");
            seen.add(user.sub);
        }
    }
    assertCondition(seen.size === expected.length, "account-pagination-incomplete");
}
