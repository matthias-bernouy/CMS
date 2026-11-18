import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { responseBytes } from "../../../harness/transport/http";
import { ClientFailure } from "../../../harness/clients/failure";
import { assertCondition, requireRecord } from "../../queries/types";
import { assertInitializationReview } from "../review";
import { initializationCompletion } from "./completion";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { Dataset } from "../datasets";
import type { FreshTenant } from "../../installations/fresh";
import type { QueryEnvironment } from "../../queries/execute";
import type { Variant } from "../../../capabilities/types";

export async function prepareInitializationApply(
    state: FreshTenant,
    environment: QueryEnvironment,
    binding: string,
    variant: Variant,
    dataset: Dataset,
    onCompleted?: (output: Readonly<Record<string, unknown>>) => void,
): Promise<PreparedSample> {
    const contract = "ulvia/cms.installations";
    const capability = "initialization.apply";
    const root = dataset.root;
    const plan = async () =>
        assertInitializationReview(
            await state.fixture("initialization.plan", { root }),
            { site: state.site, main: state.session },
            dataset,
        );
    try {
        assertCondition((await state.fixture("initialization.status")).status === "pending");
        let review = await plan();
        const key = crypto.randomUUID();
        const complete = initializationCompletion(state, () => review.digest, dataset);
        let input = { root, planDigest: review.digest };
        return {
            async send() {
                await state.prepare();
                if (variant === "cold") {
                    review = await plan();
                }
                input = { root, planDigest: review.digest };
                return (
                    await state.client(
                        contract,
                        capability,
                        binding,
                        input,
                        (output) => {
                            const row = requireRecord(output);
                            assertCondition(row.status === "completed" && row.planDigest === review.digest);
                            assertCondition(
                                row.completedPages === dataset.paths.length && row.totalPages === dataset.paths.length,
                            );
                            assertCondition(row.redirectPath === dataset.paths[0] && row.locale === "en");
                            onCompleted?.(row);
                        },
                        { complete, idempotencyKey: key },
                    )
                ).observation;
            },
            async verify() {
                const status = await state.fixture("initialization.status");
                const pages = await state.fixture("pages.list", { limit: 100 }, "ulvia/cms.content");
                const collections = await state.fixture("list-collection-installations");
                assertCondition(
                    status.status === "completed" && status.planDigest === review.digest && Array.isArray(pages.items),
                );
                assertCondition(Array.isArray(collections.items) && collections.items.length === dataset.collections);
                assertCondition(
                    canonicalizeIJson(pages.items.map((entry) => requireRecord(entry).path).toSorted()) ===
                        canonicalizeIJson(dataset.paths.toSorted()),
                );
                for (const value of pages.items) {
                    const page = requireRecord(value);
                    assertCondition(page.visible === true && page.title === "MCP kit");
                }
                for (const path of new Set([dataset.paths[0]!, dataset.paths.at(-1)!])) {
                    const response = await fetch(new URL(path, state.session.origin), {
                        redirect: "manual",
                        signal: AbortSignal.timeout(30_000),
                    });
                    const bytes = await responseBytes(response);
                    if (response.status !== 200) {
                        throw new ClientFailure(`initialization-published-page-http-status-${response.status}`);
                    }
                    if (!new TextDecoder().decode(bytes).includes("Created through MCP")) {
                        throw new ClientFailure("initialization-published-page-content-mismatch");
                    }
                }
                const before = canonicalizeIJson({ status, pages, collections });
                const replay = await state.client(contract, capability, "http", input, undefined, {
                    complete,
                    idempotencyKey: key,
                });
                assertCondition(replay.observation.validated);
                await state.invalid(capability, input, { ...input, planDigest: "invalid" });
                const foreign = await state.client(contract, capability, "http", input, undefined, {
                    httpCredentials: { cookie: environment.main.cookie },
                });
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                const current = {
                    status: await state.fixture("initialization.status"),
                    pages: await state.fixture("pages.list", { limit: 100 }, "ulvia/cms.content"),
                    collections: await state.fixture("list-collection-installations"),
                };
                assertCondition(canonicalizeIJson(current) === before);
            },
            close: state.close,
        };
    } catch (error) {
        await state.close();
        throw error;
    }
}
