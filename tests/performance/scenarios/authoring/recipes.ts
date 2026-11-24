import { requireRecord, assertCondition } from "../queries/types";
import { authoringFixture } from "./fixture";
import type { ScenarioClient } from "../../harness/clients/session";
import type { PreparedSample } from "../../harness/execution/samples";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";

export async function prepareAuthoring(
    client: ScenarioClient,
    capability: string,
    binding: string,
    implementation: ContractParentReference,
    repositoryOrigin: string,
): Promise<PreparedSample> {
    const state = await authoringFixture(client, capability, implementation);
    let output: Readonly<Record<string, unknown>> | undefined;
    let completed = false;
    return {
        async send() {
            const result = await state.call(
                capability,
                binding,
                state.input,
                (value) => {
                    output = requireRecord(value);
                    if (capability.startsWith("prepare-")) {
                        assertCondition(
                            output.valid === true &&
                                Array.isArray(output.diagnostics) &&
                                output.diagnostics.length === 0,
                        );
                        assertCondition(
                            typeof output.preparationId === "string" &&
                                typeof output.digest === "string" &&
                                output.publisherId === state.source.namespace,
                        );
                        const field =
                            state.source.kind === "provider-manifest" ? "providerId" : `${state.source.kind}Id`;
                        assertCondition(output[field] === state.source.id);
                    } else if (capability.startsWith("publish-")) {
                        assertCondition(
                            output.digest === state.prepared!.digest &&
                                output.publisherId === state.source.namespace &&
                                output.kind === state.source.kind &&
                                output.added === true,
                        );
                    } else if (capability === "claim-namespace") {
                        assertCondition(
                            output.namespace === state.source.namespace &&
                                output.state === "active" &&
                                output.revision === 1,
                        );
                    } else if (capability === "list-namespaces") {
                        assertCondition(
                            Array.isArray(output.items) &&
                                output.items.some(
                                    (item) => item.namespace === state.source.namespace && item.access === "owned",
                                ),
                        );
                    } else if (capability === "get-connection") {
                        assertCondition(
                            output.configured === true &&
                                output.repositoryUrl === repositoryOrigin &&
                                typeof output.repositoryId === "string",
                        );
                    } else if (capability === "list-preparations") {
                        const quota = requireRecord(output.quota);
                        assertCondition(
                            Array.isArray(output.items) &&
                                output.items.length <= 8 &&
                                typeof quota.count === "number" &&
                                quota.count >= 1,
                        );
                    } else if (capability === "discard-preparation") {
                        assertCondition(output.discarded === true);
                    } else if (capability === "get-publication-operation") {
                        assertCondition(
                            output.operationId === state.input.operationId &&
                                output.status === "succeeded" &&
                                requireRecord(output.result).digest === state.prepared!.digest,
                        );
                    } else {
                        assertCondition(output.releaseDigest === state.prepared!.digest);
                        const retained = requireRecord(JSON.parse(String(output.sourceJson)));
                        const expected = requireRecord(JSON.parse(state.source.sourceJson));
                        assertCondition(
                            Array.isArray(retained.files) &&
                                Array.isArray(expected.files) &&
                                retained.files.length === expected.files.length,
                        );
                        for (const file of expected.files) {
                            const found = retained.files.find((entry) => entry.path === file.path);
                            assertCondition(
                                found &&
                                    (String(file.path).endsWith(".json")
                                        ? canonicalizeIJson(JSON.parse(found.content)) ===
                                          canonicalizeIJson(JSON.parse(file.content))
                                        : found.content === file.content),
                            );
                        }
                    }
                },
                capability === "publish-collection-operation" ? { complete: state.complete } : {},
            );
            completed = result.observation.validated;
            return result.observation;
        },
        async verify() {
            if (capability.startsWith("prepare-")) {
                const published = requireRecord(
                    await state.fixture(`publish-${state.source.kind}`, {
                        preparationId: output!.preparationId,
                        expectedDigest: output!.digest,
                    }),
                );
                assertCondition(published.digest === output!.digest);
            } else if (capability.startsWith("publish-")) {
                const retained = requireRecord(
                    await state.fixture("get-source-snapshot", {
                        namespace: state.source.namespace,
                        id: state.source.id,
                        version: state.source.version,
                        kind: state.source.kind,
                    }),
                );
                assertCondition(retained.releaseDigest === output!.digest);
            } else if (capability === "discard-preparation") {
                const refused = await state.call(`publish-${state.source.kind}`, "http", state.publication);
                assertCondition(refused.observation.status === 422 && !refused.observation.validated);
                assertCondition(requireRecord(await state.fixture("get-connection", {})).configured === true);
            } else if (capability === "claim-namespace") {
                const owned = requireRecord(
                    await state.fixture("list-namespaces", { namespace: state.source.namespace, limit: 32 }),
                );
                assertCondition(
                    Array.isArray(owned.items) && owned.items.some((item) => item.namespace === state.source.namespace),
                );
            }
        },
        async close() {
            const preparationId = capability.startsWith("prepare-")
                ? output?.preparationId
                : state.prepared?.preparationId;
            if (preparationId && !(capability === "discard-preparation" && completed)) {
                await state.fixture("discard-preparation", { preparationId });
            }
        },
    };
}
