/** Public HTTP metadata travels through request context, outside authored input. */
export function publicDeliveryInvocation(request: Request) {
    const url = new URL(request.url);
    return {
        capabilityId: "delivery.resolve-resource",
        input: {
            path: url.pathname,
            method: request.method,
            query: [...url.searchParams].map(([name, value]) => ({ name, value })),
        },
    };
}
