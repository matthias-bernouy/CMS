import { validateEventMessage, validateEventReceipt } from "@bernouy/cms-gateway/events";
import { createCapabilityDefiner } from "ulvia-sdk/definitions/capabilityDefiner";
import type { CapabilityDefinition } from "ulvia-sdk/interfaces/capabilities";
import type { CapabilityAuthorization, CapabilityExecutor } from "ulvia-sdk/interfaces/execution";
import { eventReceiptSchema, eventReceiverErrors } from "./schemas";
import { eventMessageDeliverySchema } from "./messageSchema";

const behavior = { effect: "command", execution: "sync", idempotency: "natural", sensitive: true } as const;
type Receiver = CapabilityDefinition<
    typeof eventMessageDeliverySchema,
    typeof eventReceiptSchema,
    typeof eventReceiverErrors
> & {
    readonly behavior: typeof behavior;
};

/** Natural idempotency belongs to the receiver's atomic inbox/business transaction. No second keyed receipt is added. */
export function eventMessageReceiversFor<Services>() {
    const define = createCapabilityDefiner<Services>();
    return function defineEventMessageReceiver<const Id extends string>(options: {
        readonly id: Id;
        readonly path: string;
        readonly docs?: readonly string[];
        readonly authorize: CapabilityAuthorization<Receiver, Services>;
        readonly execute: CapabilityExecutor<Receiver, Services>;
    }) {
        const authorize = options.authorize;
        const execute = options.execute;
        return define({
            id: options.id,
            access: "admin",
            behavior,
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "POST",
                    path: options.path,
                    input: { body: true },
                    response: {
                        successStatuses: [200],
                        contentTypes: ["application/json"],
                        errorStatuses: {
                            FORBIDDEN: 403,
                            INVALID_INPUT: 422,
                            DELIVERY_CONFLICT: 409,
                            CORE_UNAVAILABLE: 503,
                        },
                    },
                },
            ],
            ...(options.docs ? { docs: options.docs } : {}),
            input: eventMessageDeliverySchema,
            output: eventReceiptSchema,
            errors: eventReceiverErrors,
            authorize,
            execute: async (execution) => {
                try {
                    validateEventMessage(execution.input);
                } catch (cause) {
                    throw execution.fail("INVALID_INPUT", { message: "The event envelope is invalid." }, { cause });
                }
                const receipt = await execute(execution);
                try {
                    return validateEventReceipt(receipt, execution.input.deliveryId);
                } catch (cause) {
                    throw execution.fail(
                        "CORE_UNAVAILABLE",
                        { message: "The event receipt could not be confirmed." },
                        { cause },
                    );
                }
            },
        });
    };
}
export const defineEventMessageReceiver = eventMessageReceiversFor<{}>();
