import { capabilitiesFor, z } from "@bernouy/ulvia-sdk";
import type { ProviderCapabilityHandler } from "@bernouy/ulvia-sdk";

const defineCapability = capabilitiesFor<{}>();
const operation = defineCapability({
    id: "start",
    access: "admin",
    behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/start",
            input: { body: true },
            response: { successStatuses: [202], contentTypes: ["application/json"], errorStatuses: {} },
        },
    ],
    input: z.strictObject({}),
    output: z.strictObject({ done: z.boolean() }),
    errors: {},
    execute: async () => ({ done: true }),
});
const result: Awaited<ReturnType<typeof operation.execute>> = { done: true };
// @ts-expect-error Default execution returns the terminal schema, not a queue handle.
const wrongResult: Awaited<ReturnType<typeof operation.execute>> = { operationId: "job" };
const alternative: ProviderCapabilityHandler<typeof operation> = async () => ({
    operationId: "00000000-0000-4000-8000-000000000001",
});
// @ts-expect-error A complete alternative operation handler owns queueing and returns a handle.
const wrongAlternative: ProviderCapabilityHandler<typeof operation> = async () => ({ done: true });
void [result, wrongResult, alternative, wrongAlternative];
