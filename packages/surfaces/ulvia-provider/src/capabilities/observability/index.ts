import { ObservabilityError, type CmsObservability } from "@bernouy/cms-observability";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";

export function registerObservabilityCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    observability: CmsObservability,
): void {
    dispatcher.register("ulvia.cms.observability", "logs.append", async (input, context) => {
        if (context.rootRequestId || context.subjectId || (!context.systemServiceId && !context.sourceInstallationId)) {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        return execute(() =>
            observability.append(
                input,
                context.sourceInstallationId ? `provider:${context.sourceInstallationId}` : context.systemServiceId!,
            ),
        );
    });
    dispatcher.register("ulvia.cms.observability", "logs.query", (input) => execute(() => observability.query(input)));
    dispatcher.register("ulvia.cms.observability", "logs.get", (input) => execute(() => observability.get(input)));
    dispatcher.register("ulvia.cms.observability", "logs.aggregate", (input) =>
        execute(() => observability.aggregate(input)),
    );
}

async function execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof ObservabilityError) {
            const status = error.code === "NOT_FOUND" ? 404 : error.code === "ENTRY_CONFLICT" ? 409 : 422;
            throw new ProviderCapabilityDispatchError(error.code, status);
        }
        throw error;
    }
}
