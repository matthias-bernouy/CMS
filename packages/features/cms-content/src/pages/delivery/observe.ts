import type ContentDeliveryHost from "./interfaces";
export function observeDelivery<T>(
    host: Pick<ContentDeliveryHost, "observe">,
    phase: string,
    operation: () => Promise<T>,
): Promise<T> {
    return host.observe ? host.observe(phase, operation) : operation();
}
