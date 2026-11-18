import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import { assertTextChunk, consumeText } from "../../../readers/continuation";
import { expectBodyRefusal } from "../../../../harness/clients/refusal";
import { documentationSearchOracle } from "./oracle";
import type { MetadataContext } from "../state/context";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { PreparedSample } from "../../../../harness/execution/samples";

const CONTRACT = "ulvia/cms.installations";
export async function prepareMetadataDocumentation(
    inventory: CapabilityInventory,
    state: MetadataContext,
    capability: string,
    binding: string,
    profile: string,
    index: number,
): Promise<PreparedSample> {
    await state.tenant.prepare();
    const searching = capability === "documentation.search";
    const docIndex = profile === "large" && index % 2 ? index % 64 : undefined;
    const inputFor = (resource: ReturnType<typeof state.resources.latestContract>) =>
        searching
            ? {
                  query: "Controlled documentation",
                  contractId: resource.id,
                  limit: 10,
                  ...(docIndex === undefined ? {} : { capabilityId: resource.documents[docIndex]!.capabilityId }),
              }
            : {
                  reference: {
                      contractId: resource.id,
                      releaseDigest: resource.digest,
                      path: resource.documents[0]!.path,
                  },
              };
    const old = state.resources.latestContract();
    if (profile === "invalidation") {
        const prime = await state.tenant.client(
            CONTRACT,
            capability,
            binding,
            inputFor(old),
            searching
                ? documentationSearchOracle(old)
                : (output) => {
                      assertTextChunk(requireRecord(output), old.documents[0]!.content, 0, 16384, true);
                  },
        );
        assertCondition(prime.observation.validated, "metadata-documentation-old-selection-prime");
        await state.mutateDocumentation();
    }
    const resource = state.resources.latestContract();
    const input = inputFor(resource);
    const before = canonicalizeIJson({
        revision: state.connections.revision,
        selections: state.connections.selections,
    });
    let first: unknown;
    return {
        async send() {
            return (
                await state.tenant.client(CONTRACT, capability, binding, input, (output) => {
                    if (searching) {
                        documentationSearchOracle(resource, docIndex)(output);
                    } else {
                        const row = requireRecord(output);
                        assertCondition(
                            canonicalizeIJson(row.reference) === canonicalizeIJson(inputFor(resource).reference) &&
                                row.version === resource.version &&
                                row.title === resource.documents[0]!.title,
                            "metadata-documentation-read-reference",
                        );
                        assertTextChunk(row, resource.documents[0]!.content, 0, 16384, true);
                        first = output;
                    }
                })
            ).observation;
        },
        async verify() {
            const foreign = await state.tenant.client(CONTRACT, capability, "http", input, undefined, {
                httpCredentials: { cookie: state.environment.main.cookie },
            });
            assertCondition(
                !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                "metadata-documentation-foreign-session",
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
                if (index === 0 || index === 9) {
                    for (const document of resource.documents) {
                        const found = await state.tenant.client(
                            CONTRACT,
                            capability,
                            "http",
                            {
                                query: document.token,
                                contractId: resource.id,
                                capabilityId: document.capabilityId,
                                limit: 10,
                            },
                            documentationSearchOracle(resource, resource.documents.indexOf(document)),
                        );
                        assertCondition(
                            found.observation.validated,
                            "metadata-documentation-every-authored-document-reachable",
                        );
                    }
                }
            } else {
                await consumeText(first, resource.documents[0]!.content, 16384, true, async (offset) => {
                    const response = await state.tenant.client(CONTRACT, capability, "http", { ...input, offset });
                    assertCondition(response.observation.validated, "metadata-documentation-complete-body");
                    return requireRecord(response.output);
                });
                const stale = await state.tenant.client(CONTRACT, capability, "http", inputFor(old));
                assertCondition(
                    !stale.observation.validated && stale.observation.status === 409,
                    "metadata-documentation-old-release-no-longer-selected",
                );
            }
            assertCondition(
                canonicalizeIJson({
                    revision: state.connections.revision,
                    selections: state.connections.selections,
                }) === before,
                "metadata-documentation-refusals-preserve-selection",
            );
        },
    };
}
