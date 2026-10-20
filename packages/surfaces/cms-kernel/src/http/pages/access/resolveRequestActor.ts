import type { GatewayActor } from "@bernouy/cms-gateway";
import type KernelCms from "cms-kernel/KernelCms";

const kernelActors = new WeakMap<KernelCms, WeakMap<Request, Promise<GatewayActor>>>();

export async function resolveRequestActor(kernel: KernelCms, request: Request): Promise<GatewayActor> {
    let requestActors = kernelActors.get(kernel);
    if (!requestActors) {
        requestActors = new WeakMap();
        kernelActors.set(kernel, requestActors);
    }
    const current = requestActors.get(request);
    if (current) {
        return current;
    }
    const pending = kernel.resolveActor(request).catch((error) => {
        if (requestActors.get(request) === pending) {
            requestActors.delete(request);
        }
        throw error;
    });
    requestActors.set(request, pending);
    return pending;
}
