import { capabilitiesFor } from "@bernouy/ulvia-sdk";
import type { ResourceServices } from "resources/application/interfaces/services";
import { initializationErrorStatuses } from "resources/application/schemas/common";
export const defineCapability = capabilitiesFor<ResourceServices>();
export function resourceBindings(name: "entry" | "status" | "plan" | "apply") {
    return [
        {
            id: "http",
            transport: "http" as const,
            method: name === "apply" ? ("POST" as const) : name === "plan" ? ("QUERY" as const) : ("GET" as const),
            path: `/initialization/${name}`,
            input: name === "apply" || name === "plan" ? { body: true as const } : {},
            response: {
                successStatuses: [name === "apply" ? 202 : 200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    ...initializationErrorStatuses,
                    ...(name === "apply"
                        ? { IDEMPOTENCY_CONFLICT: 409, IDEMPOTENCY_KEY_REQUIRED: 422, PROVIDER_SHUTTING_DOWN: 503 }
                        : {}),
                },
            },
        },
        { id: "mcp", transport: "mcp" as const, tool: { name: `resources_initialization_${name}` } },
    ];
}
