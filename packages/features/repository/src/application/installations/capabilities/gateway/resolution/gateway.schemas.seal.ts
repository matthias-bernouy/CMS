import { z, contractString } from "@bernouy/ulvia-sdk";
import { parseSchemaDescriptor, SchemaResolutionError } from "@bernouy/ulvia-contracts/resolution";
import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { control, required, requiredGateway } from "repository/application/installations/core/gateway/requirements";
import { gatewayActor } from "repository/application/installations/core/gateway/actors";
import { gatewaySchemaSealInputSchema } from "repository/application/installations/schemas/gateway/resolution/gateway.schemas.seal";
const output = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
export const gatewaySchemaSeal = defineCapability({
    id: "gateway.schemas.seal",
    description: "Edge control only. Validate a resolver descriptor and seal its immutable version in CMS authority.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    input: gatewaySchemaSealInputSchema,
    output: z.strictObject({ sealed: z.boolean() }),
    docs: ["overview.md"],
    errors: {
        INVALID_INPUT: { retryable: false, output },
        FORBIDDEN: { retryable: false, output },
        CORE_UNAVAILABLE: { retryable: true, output },
        SCHEMA_VERSION_CONFLICT: { retryable: false, output },
    },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/schemas/seal",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    FORBIDDEN: 403,
                    CORE_UNAVAILABLE: 503,
                    SCHEMA_VERSION_CONFLICT: 409,
                },
            },
        },
    ],
    execute: async ({ input, context, services, fail }) => {
        control(context);
        let descriptor;
        try {
            descriptor = parseSchemaDescriptor(input.descriptor);
        } catch {
            throw fail("INVALID_INPUT", { message: "Invalid schema descriptor" });
        }
        try {
            await required(requiredGateway(services.gateway).schemaVersions).seal({
                actor: gatewayActor(input.actor),
                target: input.target,
                descriptor,
            });
        } catch (error) {
            if (error instanceof SchemaResolutionError && error.code === "SCHEMA_VERSION_CONFLICT") {
                throw fail(error.code, { message: "The schema changed without a new resource version." });
            }
            if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                ["not_authorized", "stale_route", "invalid_route", "not_selected", "installation_unavailable"].includes(
                    String(error.code),
                )
            ) {
                throw fail("FORBIDDEN", { message: "Schema authority refused the target" });
            }
            throw error;
        }
        return { sealed: true };
    },
});
