import { registerKernelEndpoints } from "cms-kernel/runtime/registerKernelEndpoints";
import type { KernelCmsConfig } from "cms-kernel/interfaces/KernelCmsConfig";
import { KernelCmsContext } from "cms-kernel/runtime/KernelCmsContext";
import { mountAuthRoutes } from "cms-kernel/auth/mountAuthRoutes";

export type { KernelCmsConfig } from "cms-kernel/interfaces/KernelCmsConfig";

export default class KernelCms extends KernelCmsContext {
    readonly ready: Promise<void>;

    constructor(config: KernelCmsConfig) {
        super(config);
        registerKernelEndpoints(this);
        mountAuthRoutes(this);
        this.ready = Promise.resolve();
    }
}
