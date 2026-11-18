import { assertCondition, requireRecord } from "../../../../../queries/types";
import { scenarioClient } from "../../../../../../harness/clients/session";
import { verifyCollectionReadBoundary } from "../negative";
import { usagePageOracle } from "./oracle";
import { usagePageInput, verifyUsagePages } from "./pages";
import type { UsageReadContext } from "./context";
import type { CapabilityInventory } from "../../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../../queries/execute";
import type { PreparedSample } from "../../../../../../harness/execution/samples";

export async function prepareUsageRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    context: UsageReadContext,
    binding: string,
    profile: string,
    index: number,
): Promise<PreparedSample> {
    const { state } = context;
    await state.tenant.prepare();
    const invalidating = profile === "invalidation";
    let beforeDigest: string | undefined;
    let oldCursor: string | undefined;
    if (invalidating) {
        const prime = await state.tenant.client(
            "ulvia/cms.installations",
            "list-site-usage",
            binding,
            { limit: 1 },
            usagePageOracle(context.expected(), 1),
        );
        assertCondition(prime.observation.validated, "usage-read-prime");
        const row = requireRecord(prime.output);
        assertCondition(typeof row.cursor === "string", "usage-read-invalidation-cursor");
        beforeDigest = String(row.digest);
        oldCursor = row.cursor;
        await context.mutate();
    }
    const expected = context.expected();
    assertCondition(!invalidating || expected.size <= 500, "usage-read-invalidation-count-bound");
    const request = invalidating
        ? { input: { limit: 500 }, digest: undefined }
        : await usagePageInput(state.tenant.client, expected, index);
    return {
        async send() {
            return (
                await state.tenant.client(
                    "ulvia/cms.installations",
                    "list-site-usage",
                    binding,
                    request.input,
                    (output) => {
                        usagePageOracle(expected, request.input.limit, request.digest, invalidating)(output);
                        assertCondition(
                            !beforeDigest || requireRecord(output).digest !== beforeDigest,
                            "usage-read-digest-invalidated",
                        );
                    },
                )
            ).observation;
        },
        async verify() {
            await verifyCollectionReadBoundary(inventory, environment, state, "list-site-usage", request.input);
            if (oldCursor) {
                const stale = await state.tenant.client("ulvia/cms.installations", "list-site-usage", "http", {
                    limit: 1,
                    cursor: oldCursor,
                });
                assertCondition(
                    !stale.observation.validated && stale.observation.status === 409,
                    `usage-read-stale-cursor-http-${stale.observation.status}`,
                );
            }
            const page = context.pages[0]!;
            const elsewhere = await scenarioClient(inventory, environment.main)(
                "ulvia/cms.content",
                "pages.get",
                "http",
                { id: page.id },
            );
            assertCondition(
                !elsewhere.observation.validated && elsewhere.observation.status === 404,
                "usage-read-page-cross-instance",
            );
            for (const page of context.pages) {
                const persisted = await state.tenant.fixture("pages.get", { id: page.id }, "ulvia/cms.content");
                assertCondition(
                    persisted.revision === page.revision &&
                        persisted.content === page.content &&
                        persisted.path === page.path &&
                        persisted.visible === true,
                    "usage-read-refusals-preserve-pages",
                );
            }
            if (index === 0 || index === 9 || invalidating) {
                await verifyUsagePages(state.tenant.client, expected);
            }
        },
    };
}
