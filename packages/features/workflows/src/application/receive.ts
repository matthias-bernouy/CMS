import { eventMessageReceiversFor } from "@bernouy/ulvia-sdk";
import type { WorkflowServices } from "workflows/interfaces/services";
import { receiveWorkflowMessage } from "workflows/execution/receivers/message";
export const receive = eventMessageReceiversFor<WorkflowServices>()({
    id: "events.receive",
    path: "/events/receive",
    docs: ["overview.md"],
    authorize: ({ services, context, input }) => services.authority.assertEventDelivery(context, input),
    execute: ({ services, context, input }) => receiveWorkflowMessage(services, input, context),
});
