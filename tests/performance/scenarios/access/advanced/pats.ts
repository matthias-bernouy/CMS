import { assertCondition, requireRecord } from "../../queries/types";
import { assertPatListing } from "./oracles";
import type { AccessReadContext } from "./context";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { Variant } from "../../../capabilities/types";

type Create = (input: Readonly<Record<string, unknown>>) => Promise<Readonly<Record<string, unknown>>>;

/** History retains genuinely expired records; revocation removes PATs and cannot supply that dataset. */
export async function patDataset(create: Create, history: boolean) {
    const records: Readonly<Record<string, unknown>>[] = [];
    let token: string | undefined;
    let latestExpiry = 0;
    for (let index = 0; index < 32; index++) {
        const expiry = history ? Date.now() + 2_000 : 0;
        const result = await create({
            name: `owned-pat-${crypto.randomUUID()}`,
            ...(history ? { expiresAt: new Date(expiry).toISOString() } : {}),
        });
        assertCondition(typeof result.token === "string");
        token ??= result.token;
        records.push(requireRecord(result.metadata));
        latestExpiry = Math.max(latestExpiry, expiry);
    }
    if (history) {
        await Bun.sleep(Math.max(0, latestExpiry - Date.now() + 25));
        assertCondition(
            records.every((row) => Date.parse(String(row.expiresAt)) < Date.now()),
            "pat-history-not-expired",
        );
    }
    return { records, token: token! };
}

export async function preparePatRead(context: AccessReadContext, variant: Variant): Promise<PreparedSample> {
    try {
        const owner = await context.create();
        const foreign = await context.create();
        const credential = { cookie: owner.cookie };
        const create = (input: Readonly<Record<string, unknown>>) =>
            context.fixture("create-personal-access-token", input, credential);
        const foreignToken = await context.fixture(
            "create-personal-access-token",
            { name: "foreign-token" },
            { cookie: foreign.cookie },
        );
        let records: readonly Readonly<Record<string, unknown>>[];
        let expired: string | undefined;
        if (variant === "invalidation") {
            const first = await create({ name: "first-owned-token" });
            await context.fixture("create-personal-access-token", { name: "retained-owned-token" }, credential);
            const primed = await context.fixture("list-personal-access-tokens", {}, credential);
            assertCondition(Array.isArray(primed.tokens) && primed.tokens.length === 2);
            assertCondition(
                (
                    await context.fixture(
                        "revoke-personal-access-token",
                        { id: requireRecord(first.metadata).id },
                        credential,
                    )
                ).revoked === true,
            );
            records = primed.tokens.map(requireRecord).filter((row) => row.id !== requireRecord(first.metadata).id);
            const refused = await context.fixture("resolve-actor", {}, { token: String(first.token) });
            assertCondition(refused.state === "anonymous");
        } else {
            const data = await patDataset(create, variant === "history");
            records = data.records;
            expired = variant === "history" ? data.token : undefined;
        }
        return {
            async send() {
                return (
                    await context.call(
                        "list-personal-access-tokens",
                        {},
                        (output) => assertPatListing(output, records),
                        { httpCredentials: credential },
                    )
                ).observation;
            },
            async verify() {
                assertPatListing(await context.fixture("list-personal-access-tokens", {}, { cookie: foreign.cookie }), [
                    requireRecord(foreignToken.metadata),
                ]);
                if (expired) {
                    assertCondition(
                        (await context.fixture("resolve-actor", {}, { token: expired })).state === "anonymous",
                        "expired-pat-still-authorized",
                    );
                }
                if (variant !== "invalidation") {
                    const refused = await context.call(
                        "create-personal-access-token",
                        { name: "over-quota" },
                        undefined,
                        { httpCredentials: credential },
                    );
                    assertCondition(
                        !refused.observation.validated && refused.observation.status === 409,
                        "pat-quota-not-enforced",
                    );
                }
                assertPatListing(await context.fixture("list-personal-access-tokens", {}, credential), records);
            },
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
