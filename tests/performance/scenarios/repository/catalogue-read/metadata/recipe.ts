import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import { catalogueOracle, searchOracle } from "./oracle";
import { verifyDiscoveryPages } from "./pagination";
import type { RegistryReadContext } from "../context";
import type { PublicKind } from "./types";
import type { PreparedSample } from "../../../../harness/execution/samples";

export async function prepareDiscoveryRead(
    context: RegistryReadContext,
    capability: string,
    profile: string,
    index: number,
    invalid: (input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    const { state, read } = context;
    const kind: PublicKind =
        capability === "collection-catalogue"
            ? "collection"
            : (["collection", "contract", "provider-manifest"][index % 3] as PublicKind);
    const latest = capability !== "catalogue-list";
    const selected = () => state.visible(kind, latest);
    const input = () => ({
        limit: 16,
        publisherId: state.scope.namespace,
        ...(capability === "catalogue-list"
            ? { kind, channel: "stable" }
            : capability === "catalogue-search"
              ? { query: selected()[0]!.reference.id, kinds: [kind], channel: "stable" }
              : { channel: "stable" }),
    });
    const oracle = () =>
        capability === "catalogue-search"
            ? searchOracle(selected(), selected()[0]!, true)
            : catalogueOracle(selected(), 0);
    let priorRevision: unknown;
    if (profile === "invalidation") {
        const prime = await read.call(capability, "http", input(), oracle());
        assertCondition(prime.observation.validated, "registry-discovery-prime");
        priorRevision = requireRecord(prime.output).revision;
        await state.publish(kind, 0, index + 1);
    }
    const expected = selected();
    const exact = expected[0]!;
    const request = input();
    return {
        async send() {
            return (
                await read.call(capability, "http", request, (value) => {
                    oracle()(value);
                    if (capability === "catalogue-search" && profile === "invalidation") {
                        assertCondition(
                            requireRecord(value).revision !== priorRevision,
                            "registry-search-stale-revision",
                        );
                    }
                })
            ).observation;
        },
        async verify() {
            const mutationTarget = expected.at(-1)!;
            const before = await state.refuseForeignMutation(context.foreign, mutationTarget);
            await invalid(request);
            if (index < 3 || profile === "invalidation" || index === 9) {
                await verifyDiscoveryPages(read, capability, request, expected, exact);
            }
            assertCondition(
                canonicalizeIJson(await state.snapshot([mutationTarget])) === canonicalizeIJson(before),
                "registry-discovery-refusal-mutated-state",
            );
        },
    };
}
