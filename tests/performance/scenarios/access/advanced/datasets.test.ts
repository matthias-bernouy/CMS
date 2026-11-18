import { expect, test } from "bun:test";
import {
    InMemoryPatRepository,
    InMemoryUsersRepository,
    personalAccessTokenInput,
    PersonalAccessTokenLimitError,
} from "@bernouy/auth";
import type { TUser } from "@bernouy/auth";
import { patDataset } from "./pats";
import { accountDataset, verifyAccountPages } from "./members";
import type { AccessReadContext } from "./context";

test("PAT history actually retains 32 expired domain records and does not count removed revocations as history", async () => {
    const store = new InMemoryPatRepository();
    const data = await patDataset(async (input) => {
        const { pat, token } = await store.create({ sub: "owned", ...personalAccessTokenInput(input) });
        return {
            token,
            metadata: {
                id: pat.id,
                name: pat.name,
                createdAt: pat.createdAt.toISOString(),
                expiresAt: pat.expiresAt?.toISOString() ?? null,
            },
        };
    }, true);
    const retained = await store.list("owned");
    expect(retained).toHaveLength(32);
    expect(data.records).toHaveLength(32);
    expect(retained.every((record) => record.expiresAt!.getTime() < Date.now())).toBe(true);
    expect(await store.verify(data.token)).toBeNull();
    await expect(store.create({ sub: "owned", name: "over quota" })).rejects.toBeInstanceOf(
        PersonalAccessTokenLimitError,
    );
    const foreign = await store.create({ sub: "foreign", name: "foreign" });
    expect((await store.list("owned")).some((row) => row.id === foreign.pat.id)).toBe(false);
    expect(await store.revoke("owned", data.records[0]!.id as string)).toBe(true);
    expect(await store.list("owned")).toHaveLength(31);
}, 10_000);

test("the membership dataset retains 64 actual authority changes across 100 members and verifies every page", async () => {
    const users = new InMemoryUsersRepository();
    const grants = new Map<string, { administrator: boolean; administratorRevision: number }>();
    const pages: number[] = [];
    let created = 0;
    let mutations = 0;
    const dto = (user: TUser) => ({
        ...user,
        ...grants.get(user.sub),
        createdAt: user.createdAt.toISOString(),
        lastSeenAt: user.lastSeenAt.toISOString(),
    });
    const context: AccessReadContext = {
        async create() {
            await Bun.sleep(2);
            const sub = `member-${created++}`;
            const email = `${sub}@performance.test`;
            await users.upsert({ sub, email });
            grants.set(sub, { administrator: false, administratorRevision: 0 });
            return { sub, email, cookie: "unit-only" };
        },
        async fixture(capability, input) {
            if (capability === "get-user") {
                return dto((await users.getBySub(String(input.sub)))!);
            }
            if (capability === "set-administrator") {
                const state = grants.get(String(input.sub))!;
                expect(input.expectedRevision).toBe(state.administratorRevision);
                const next = {
                    administrator: Boolean(input.enabled),
                    administratorRevision: state.administratorRevision + 1,
                };
                grants.set(String(input.sub), next);
                mutations++;
                return {
                    sub: input.sub,
                    administrator: next.administrator,
                    revision: next.administratorRevision,
                    bootstrap: false,
                };
            }
            expect(capability).toBe("list-users");
            pages.push(Number(input.page));
            const result = await users.list({ pagination: { page: Number(input.page), limit: Number(input.limit) } });
            return { ...result, users: result.users.map(dto) };
        },
        call: async () => {
            throw new Error("No measured transport is used by this fixture unit test");
        },
        close: async () => {},
    };
    const expected = await accountDataset(context, true);
    expect(expected).toHaveLength(100);
    expect(mutations).toBe(64);
    expect(expected.filter((row) => row.administratorRevision === 8)).toHaveLength(8);
    expect(expected.every((row) => row.administrator === false)).toBe(true);
    pages.length = 0;
    await verifyAccountPages(context, expected);
    expect(pages).toEqual([1, 2, 3, 4, 5]);
});
