import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import { assertTextChunk, consumeText } from "../../../readers/continuation";
import { nextCollectionReadCoordinate } from "../collections/resources/collection";
import { expectBodyRefusal } from "../../../../harness/clients/refusal";
import { scenarioClient } from "../../../../harness/clients/session";
import { resourceReference, expectedSearch, expectedResourceContent, searchPageOracle } from "./oracle";
import { searchInput, searchPageInput, verifySearchPages } from "./pages";
import type { CollectionReadState } from "../collections/context/types";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { PreparedSample } from "../../../../harness/execution/samples";
import type { QueryEnvironment } from "../../../queries/execute";

const CONTRACT = "ulvia/cms.installations";

export async function prepareSiteDiscovery(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    state: CollectionReadState,
    capability: string,
    binding: string,
    profile: string,
    index: number,
): Promise<PreparedSample> {
    await state.tenant.prepare();
    const searching = capability === "repository.search";
    const invalidating = profile === "invalidation";
    const latest = () => state.resources.filter((row) => row.index === 0).at(-1)!;
    const old = latest();
    const inputFor = (resource: typeof old) => ({
        repositoryId: state.repositoryId,
        reference: resourceReference(resource),
        limit: 1024,
    });
    if (invalidating) {
        const primed = await state.tenant.client(
            CONTRACT,
            capability,
            binding,
            searching ? searchInput(state) : inputFor(old),
            searching
                ? searchPageOracle(expectedSearch(state), 16)
                : (output) => {
                      assertTextChunk(requireRecord(output), expectedResourceContent(old), 0, 1024, false);
                  },
        );
        assertCondition(primed.observation.validated, "site-discovery-old-state-prime");
        const coordinate = nextCollectionReadCoordinate(state.resources, false);
        await state.publish(await state.create(coordinate.index, coordinate.patch));
    }
    const resource = latest();
    const expected = expectedResourceContent(resource);
    const input = searching ? await searchPageInput(state, index) : inputFor(resource);
    let first: unknown;
    const publicState = () =>
        state.registry.calls.fixture("publication-state", {
            kind: "collection",
            publisherId: resource.namespace,
            id: resource.id,
            version: resource.version,
        });
    const before = canonicalizeIJson(await publicState());
    return {
        async send() {
            return (
                await state.tenant.client(CONTRACT, capability, binding, input, (output) => {
                    if (searching) {
                        searchPageOracle(expectedSearch(state), 16)(output);
                    } else {
                        assertCondition(
                            canonicalizeIJson(requireRecord(output).reference) ===
                                canonicalizeIJson(resourceReference(resource)),
                            "site-discovery-exact-reference",
                        );
                        assertTextChunk(requireRecord(output), expected, 0, 1024, false);
                        first = output;
                    }
                })
            ).observation;
        },
        async verify() {
            const foreign = await state.tenant.client(CONTRACT, capability, "http", input, undefined, {
                httpCredentials: { cookie: environment.main.cookie },
            });
            assertCondition(
                !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                "site-discovery-foreign-session",
            );
            await expectBodyRefusal(
                inventory,
                state.tenant.session,
                CONTRACT,
                capability,
                input,
                { ...input, unexpectedPerformanceField: true },
                400,
            );
            if (searching) {
                if (index === 0 || index === 9 || invalidating) {
                    await verifySearchPages(state);
                    // Every authored identity remains reachable, including those outside the source's fifty-candidate ranking.
                    for (const row of state.resources.filter((value) => value.patch === 0)) {
                        const exact = await state.tenant.client(
                            CONTRACT,
                            capability,
                            "http",
                            { ...searchInput(state), query: row.id, limit: 1 },
                            searchPageOracle(expectedSearch(state), 1),
                        );
                        assertCondition(
                            exact.observation.validated &&
                                requireRecord((requireRecord(exact.output).results as readonly unknown[])[0])
                                    .reference &&
                                requireRecord(
                                    requireRecord((requireRecord(exact.output).results as readonly unknown[])[0])
                                        .reference,
                                ).id === row.id,
                            "site-discovery-exact-identity-reachable",
                        );
                    }
                }
            } else {
                await consumeText(first, expected, 1024, false, async (offset) => {
                    const response = await state.tenant.client(CONTRACT, capability, "http", { ...input, offset });
                    assertCondition(response.observation.validated, "site-discovery-continuation");
                    return requireRecord(response.output);
                });
                if (invalidating) {
                    const previous = await state.tenant.client(
                        CONTRACT,
                        capability,
                        "http",
                        inputFor(old),
                        (output) => {
                            assertTextChunk(requireRecord(output), expectedResourceContent(old), 0, 1024, false);
                        },
                    );
                    assertCondition(previous.observation.validated, "site-discovery-immutable-old-reference-preserved");
                }
                const elsewhere = await scenarioClient(inventory, environment.main)(
                    CONTRACT,
                    capability,
                    "http",
                    input,
                );
                assertCondition(
                    !elsewhere.observation.validated && elsewhere.observation.status === 422,
                    "site-discovery-unconfigured-source-cross-instance",
                );
                const mismatch = await state.tenant.client(CONTRACT, capability, "http", {
                    ...input,
                    reference: { ...resourceReference(resource), digest: `sha256:${"0".repeat(64)}` },
                });
                assertCondition(
                    !mismatch.observation.validated && mismatch.observation.status === 409,
                    "site-discovery-refused-digest",
                );
            }
            assertCondition(
                canonicalizeIJson(await publicState()) === before,
                "site-discovery-refusals-preserve-publication",
            );
        },
    };
}
