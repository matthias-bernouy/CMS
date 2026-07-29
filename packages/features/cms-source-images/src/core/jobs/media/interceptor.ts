import type { SourceEndpointInterceptor } from "@bernouy/cms-sources";
import type { DefaultSourceImageMediaCoordinator } from "./coordinator";

export function createSourceMediaEffectInterceptor(
    coordinator: Pick<DefaultSourceImageMediaCoordinator, "recordEffects">,
    onError?: (error: unknown) => void,
): SourceEndpointInterceptor {
    return async (endpoint, request, next) => {
        const response = await next(request);
        if (
            response.ok &&
            ((endpoint.effects?.producesMedia?.length ?? 0) > 0 || (endpoint.effects?.removesMedia?.length ?? 0) > 0)
        ) {
            try {
                await coordinator.recordEffects(endpoint, response.clone(), request);
            } catch (error) {
                onError?.(error);
            }
        }
        return response;
    };
}
