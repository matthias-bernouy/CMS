import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { hostedInput } from "./context";
import { hostingDataset, HOSTING_DATASET_SIZE } from "./datasets";
import { hostingPage, seekBefore, verifyNextPage } from "./pages";
import { assertCondition, requireRecord } from "../queries/types";
import { retainDisabledTenantDatabase } from "../../harness/docker/cleanup/tenant";
import type { HostingContext } from "./context";
import type { Variant } from "../../capabilities/types";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareHostingInstance(
    context: HostingContext,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<PreparedSample> {
    const listing = capability === "instances.list";
    await hostingDataset(context, "instances", variant);
    const fresh = capability === "instances.disable" || variant === "invalidation" ? await context.create() : undefined;
    let current =
        fresh?.instance ??
        (await context.checked("instances.get", { instanceId: context.environment.stack.instanceId }));
    let input: Readonly<Record<string, unknown>> =
        capability === "instances.create"
            ? hostedInput(context.control.origin)
            : listing
              ? {
                    after: variant === "invalidation" ? seekBefore(String(current.id)) : null,
                    limit: variant === "large" || variant === "history" ? 50 : 1,
                }
              : { instanceId: current.id };
    if (variant === "invalidation") {
        await context.checked(capability, input);
        current = await context.checked("instances.disable", { instanceId: current.id });
    }
    let output: Readonly<Record<string, unknown>> | undefined;
    let createdId: unknown;
    await context.prepare(binding);
    return {
        async send() {
            return (
                await context.call(capability, binding, input, (value) => {
                    output = requireRecord(value);
                    if (capability === "instances.create") {
                        const instance = requireRecord(output.instance);
                        const domain = requireRecord(output.domain);
                        assertCondition(
                            instance.status === "ready" &&
                                instance.label === input.label &&
                                instance.origin === input.origin,
                        );
                        assertCondition(
                            domain.instanceId === instance.id &&
                                domain.state === "active" &&
                                domain.tls === "not-required" &&
                                output.proof === null,
                        );
                        createdId = instance.id;
                    } else if (listing) {
                        const page = hostingPage(output, Number(input.limit), "id");
                        assertCondition(page.items.length === input.limit);
                        if (variant === "invalidation") {
                            assertCondition(page.items[0]?.id === current.id && page.items[0]?.status === "disabled");
                        }
                    } else {
                        assertCondition(
                            output.id === current.id &&
                                output.status === (capability === "instances.disable" ? "disabled" : current.status),
                        );
                        assertCondition(
                            output.revision === Number(current.revision) + (capability === "instances.disable" ? 1 : 0),
                        );
                    }
                })
            ).observation;
        },
        async verify() {
            await context.foreign(capability, input);
            if (capability === "instances.create") {
                const stored = await context.checked("instances.get", { instanceId: createdId });
                const replay = await context.checked(capability, input);
                assertCondition(canonicalizeIJson(requireRecord(replay.instance)) === canonicalizeIJson(stored));
                await context.refused(capability, { ...input, label: "Changed idempotent input" }, 422);
                assertCondition(
                    canonicalizeIJson(await context.checked("instances.get", { instanceId: createdId })) ===
                        canonicalizeIJson(stored),
                );
            } else if (listing) {
                await verifyNextPage(context, capability, input, output, "id");
                await context.refused(capability, { ...input, after: "invalid-cursor" }, 422);
                if (variant === "large" || variant === "history") {
                    assertCondition(HOSTING_DATASET_SIZE > Number(input.limit));
                }
            } else {
                const stored = await context.checked("instances.get", input);
                assertCondition(canonicalizeIJson(stored) === canonicalizeIJson(output));
                await context.refused("instances.get", { instanceId: "instance:missing" }, 404);
                assertCondition(
                    canonicalizeIJson(await context.checked("instances.get", input)) === canonicalizeIJson(stored),
                );
            }
        },
        async close() {
            if (createdId) {
                await context.checked("instances.disable", { instanceId: createdId });
                assertCondition(typeof createdId === "string" && typeof input.origin === "string");
                await retainDisabledTenantDatabase(context.environment.stack, {
                    instanceId: createdId,
                    origin: input.origin,
                });
            }
            if (fresh) {
                await context.checked("instances.disable", { instanceId: fresh.instance.id });
                assertCondition(typeof fresh.instance.id === "string");
                await retainDisabledTenantDatabase(context.environment.stack, {
                    instanceId: fresh.instance.id,
                    origin: fresh.input.origin,
                });
            }
        },
    };
}
