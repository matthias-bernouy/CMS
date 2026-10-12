import { registerKernelEndpoints } from "cms-kernel/runtime/registerKernelEndpoints";
import type { KernelCmsConfig } from "cms-kernel/interfaces/KernelCmsConfig";
import { KernelCmsContext } from "cms-kernel/runtime/KernelCmsContext";
import { mountKernelCmsRoutes } from "cms-kernel/core/admin/runtime/mountRoutes";
import { createKernelCmsState } from "cms-kernel/core/admin/runtime/state";
import type { KernelCmsState } from "cms-kernel/core/admin/runtime/types";

export type { KernelCmsConfig } from "cms-kernel/interfaces/KernelCmsConfig";

export default class KernelCms extends KernelCmsContext {
    readonly ready: Promise<void>;
    readonly state: KernelCmsState;

    constructor(config: KernelCmsConfig) {
        super(config);
        registerKernelEndpoints(this);
        this.state = createKernelCmsState({
            runner: this.runner,
            repository: this.cmsRepository,
            dependencies: {
                configuration: {
                    publicAuth: this.publicAuth,
                    collections: this.collections,
                },
                identityProviders: this.identityProviders,
            },
        });
        this.ready = mountKernelCmsRoutes(this.state, this.authBackends ?? {});
    }
}
