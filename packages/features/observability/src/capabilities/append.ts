import { defineCapability } from "observability/capabilities/define";
import { appendErrors as errors } from "observability/schemas/errors";
import { appendLogsInputSchema, appendLogsOutputSchema } from "observability/schemas/ingestion";
export const appendLogs = defineCapability({
    id: "logs.append",
    description:
        "Append an authenticated machine batch. Instance and emitter identity are supplied by verified invocation context.",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/observability/logs/append",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    CORE_UNAVAILABLE: 503,
                    FORBIDDEN: 403,
                    ENTRY_CONFLICT: 409,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: appendLogsInputSchema,
    output: appendLogsOutputSchema,
    errors,
    execute: ({ input, services, context, fail }) => {
        if (context.rootRequestId || context.subjectId || (!context.systemServiceId && !context.sourceInstallationId)) {
            throw fail("FORBIDDEN", { message: "Diagnostic ingestion requires a machine identity." });
        }
        return services.observability.append(
            input,
            context.sourceInstallationId ? `provider:${context.sourceInstallationId}` : context.systemServiceId!,
        );
    },
});
