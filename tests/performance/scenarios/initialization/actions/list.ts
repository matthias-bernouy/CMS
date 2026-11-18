import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { FreshTenant } from "../../installations/fresh";
import type { Dataset } from "../datasets";
import type { Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { workflowDatasets } from "./datasets";

const rootKey = (value: unknown) => canonicalizeIJson(value);

export function recipePage(value: unknown) {
    const row = requireRecord(value);
    assertCondition(Array.isArray(row.items) && row.items.length <= 4 && typeof row.cursor === "string");
    const keys = row.items.map((value) => {
        const item = requireRecord(value);
        const root = requireRecord(item.root);
        assertCondition(typeof item.label === "string" && typeof item.description === "string");
        assertCondition(Number.isSafeInteger(item.pageCount) && Number.isSafeInteger(item.includeCount));
        assertCondition(typeof root.digest === "string" && /^sha256:[a-f0-9]{64}$/u.test(root.digest));
        return rootKey(root);
    });
    assertCondition(new Set(keys).size === keys.length);
    return { items: row.items.map(requireRecord), cursor: row.cursor, keys };
}

export async function prepareInitializationList(
    state: FreshTenant,
    environment: QueryEnvironment,
    binding: string,
    variant: Variant,
    datasets: ReturnType<typeof workflowDatasets>,
): Promise<PreparedSample> {
    const capability = "initialization.list";
    const contract = "ulvia/cms.installations";
    try {
        const expected = await datasets(
            environment,
            variant === "large" || variant === "invalidation" ? "large" : variant === "history" ? "history" : "one",
        );
        let previous: ReturnType<typeof recipePage> | undefined;
        let changed: Dataset | undefined;
        if (variant === "invalidation") {
            previous = recipePage(await state.fixture(capability));
            assertCondition(previous.cursor !== "");
            changed = (await datasets(environment, "changed"))[0];
        }
        const snapshot = async () => ({
            status: await state.fixture("initialization.status"),
            pages: await state.fixture("pages.list", { limit: 1 }, "ulvia/cms.content"),
            collections: await state.fixture("list-collection-installations"),
        });
        const before = canonicalizeIJson(await snapshot());
        let first: ReturnType<typeof recipePage> | undefined;
        return {
            async send() {
                await state.prepare();
                return (
                    await state.client(contract, capability, binding, {}, (output) => {
                        first = recipePage(output);
                        assertCondition(first.items.length > 0);
                        if (previous) {
                            assertCondition(first.cursor !== "" && first.cursor !== previous.cursor);
                        }
                    })
                ).observation;
            },
            async verify() {
                assertCondition(first);
                const seen = new Set<string>();
                const cursors = new Set<string>();
                let page = first;
                for (let index = 0; ; index++) {
                    assertCondition(index < 128);
                    for (const key of page.keys) {
                        assertCondition(!seen.has(key));
                        seen.add(key);
                    }
                    if (!page.cursor) {
                        break;
                    }
                    assertCondition(!cursors.has(page.cursor));
                    cursors.add(page.cursor);
                    page = recipePage(await state.fixture(capability, { cursor: page.cursor }));
                    assertCondition(page.items.length > 0);
                }
                const required = variant === "history" ? [expected.at(-1)!] : expected;
                for (const entry of [...required, ...(changed ? [changed] : [])]) {
                    assertCondition(seen.has(rootKey(entry.root)));
                }
                if (variant === "large" || variant === "invalidation") {
                    assertCondition(cursors.size >= 3);
                }
                if (variant === "history") {
                    for (const older of expected.slice(0, -1)) {
                        assertCondition(!seen.has(rootKey(older.root)));
                    }
                }
                const invalid = await state.client(contract, capability, "http", { cursor: "invalid-cursor" });
                assertCondition(!invalid.observation.validated && invalid.observation.status === 422);
                const foreign = await state.client(contract, capability, "http", {}, undefined, {
                    httpCredentials: { cookie: environment.main.cookie },
                });
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                assertCondition(canonicalizeIJson(await snapshot()) === before);
            },
            close: state.close,
        };
    } catch (error) {
        await state.close();
        throw error;
    }
}
