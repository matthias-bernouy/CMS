import { randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
import { hostingDataset } from "./datasets";
import { hostingPage, peekHosting, seekBefore, verifyNextPage } from "./pages";
import type { HostingContext } from "./context";
import type { DependencyMetrics, Variant } from "../../capabilities/types";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareHostingDomain(
    context: HostingContext,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<PreparedSample> {
    const kind = capability.startsWith("zones.") ? "zones" : "domains";
    const claim = capability.endsWith(".claim");
    const listing = capability.endsWith(".list");
    const verifying = capability.endsWith(".verify");
    const anchor = kind === "domains" ? await context.anchor() : undefined;
    const instanceId = anchor?.instance.id;
    const hostname = `sample-${randomUUID()}.performance.test`;
    const owned = kind === "domains" ? { instanceId, origin: `https://${hostname}` } : { hostname };
    await hostingDataset(context, kind, variant);
    const claimed = claim ? undefined : await context.checked(`${kind}.claim`, owned);
    let expected = claimed ? requireRecord(kind === "domains" ? claimed.domain : claimed.zone) : undefined;
    let input: Readonly<Record<string, unknown>> = claim
        ? owned
        : listing
          ? {
                ...(kind === "domains" ? { instanceId } : {}),
                after: variant === "large" || variant === "history" ? null : seekBefore(hostname),
                limit: variant === "large" || variant === "history" ? 50 : 1,
            }
          : { hostname, expectedRevision: expected!.revision };
    const dns = context.environment.stack.dns;
    const proof = claimed ? requireRecord(claimed.proof) : undefined;
    if (verifying) {
        assertCondition(dns && typeof proof?.name === "string" && typeof proof.value === "string");
        await dns.put(String(proof.name), "incorrect-performance-proof");
        await context.refused(capability, input, 409);
        assertCondition(
            canonicalizeIJson(await peekHosting(context, kind, hostname, instanceId)) === canonicalizeIJson(expected),
        );
        await dns.put(String(proof.name), String(proof.value));
    }
    if (variant === "invalidation") {
        await context.checked(capability, input);
        expected = await context.checked(`${kind}.disable`, { hostname, expectedRevision: expected!.revision });
    }
    let output: Readonly<Record<string, unknown>> | undefined;
    let dependency: DependencyMetrics | undefined;
    await context.prepare(binding);
    return {
        async send() {
            const before = verifying ? await dns!.counts(String(proof!.name)) : undefined;
            const result = await context.call(capability, binding, input, (value) => {
                output = requireRecord(value);
                if (listing) {
                    const page = hostingPage(output, Number(input.limit), "hostname");
                    assertCondition(page.items.length === input.limit);
                    if (variant !== "large" && variant !== "history") {
                        assertCondition(
                            page.items[0]?.hostname === hostname && page.items[0]?.state === expected!.state,
                        );
                    }
                } else {
                    const record = claim ? requireRecord(kind === "domains" ? output.domain : output.zone) : output;
                    assertCondition(
                        record.hostname === hostname &&
                            record.state === (claim ? "pending" : verifying ? "verified" : "disabled"),
                    );
                    assertCondition(record.revision === (claim ? 1 : Number(expected!.revision) + 1));
                    if (kind === "domains") {
                        assertCondition(record.instanceId === instanceId);
                    }
                    if (claim) {
                        const returnedProof = requireRecord(output.proof);
                        assertCondition(
                            typeof returnedProof.name === "string" && typeof returnedProof.value === "string",
                        );
                    }
                }
            });
            if (before) {
                try {
                    const after = await dns!.counts(String(proof!.name));
                    dependency = {
                        service: "dns",
                        requests: after.requests - before.requests,
                        requestBytes: after.requestBytes - before.requestBytes,
                        responseBytes: after.responseBytes - before.responseBytes,
                        complete: after.requests > before.requests,
                    };
                } catch {
                    // Preserve the actual HTTP/MCP attempt even when its auxiliary counters are unavailable.
                    return {
                        ...result.observation,
                        validated: false,
                        failure: "dependency-evidence-incomplete",
                        dependencies: [
                            {
                                service: "dns" as const,
                                requests: 0,
                                requestBytes: 0,
                                responseBytes: 0,
                                complete: false,
                            },
                        ],
                    };
                }
            }
            return { ...result.observation, ...(dependency ? { dependencies: [dependency] } : {}) };
        },
        async verify() {
            await context.foreign(capability, input);
            if (listing) {
                await verifyNextPage(context, capability, input, output, "hostname");
                await context.refused(capability, { ...input, after: "invalid hostname" }, 422);
                if (variant === "invalidation") {
                    assertCondition((await peekHosting(context, kind, hostname, instanceId)).state === "disabled");
                }
            } else {
                const stored = await peekHosting(context, kind, hostname, instanceId);
                const measured = claim ? requireRecord(kind === "domains" ? output!.domain : output!.zone) : output!;
                assertCondition(canonicalizeIJson(stored) === canonicalizeIJson(measured));
                if (!claim) {
                    await context.refused(capability, { hostname, expectedRevision: expected!.revision }, 409);
                }
                await context.refused(
                    `${kind}.claim`,
                    kind === "domains"
                        ? { instanceId, origin: "https://invalid.performance.test/path" }
                        : { hostname: "invalid hostname" },
                    422,
                );
                assertCondition(
                    canonicalizeIJson(await peekHosting(context, kind, hostname, instanceId)) ===
                        canonicalizeIJson(stored),
                );
                if (verifying) {
                    assertCondition(dependency?.complete === true && dependency.requests >= 1);
                }
            }
        },
        async close() {
            if (verifying) {
                await dns!.remove(String(proof!.name));
            }
        },
    };
}
