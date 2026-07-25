import type { SourceEndpointInterceptor } from "./handleSourceRequest";

/**
 * Compose endpoint middleware in declaration order. The first interceptor is
 * outermost, so it still observes a response returned from an inner cache hit.
 */
export function composeSourceEndpointInterceptors(
    ...configured: Array<SourceEndpointInterceptor | null | undefined>
): SourceEndpointInterceptor | undefined {
    const interceptors = configured.filter(
        (interceptor): interceptor is SourceEndpointInterceptor => interceptor !== null && interceptor !== undefined,
    );
    if (interceptors.length === 0) {
        return undefined;
    }
    if (interceptors.length === 1) {
        return interceptors[0];
    }
    return (endpoint, request, next) => {
        const dispatch = (index: number, current: Request): Promise<Response> => {
            const interceptor = interceptors[index];
            return interceptor
                ? interceptor(endpoint, current, (forwarded) => dispatch(index + 1, forwarded))
                : next(current);
        };
        return dispatch(0, request);
    };
}
