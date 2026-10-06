import type { Authentication } from "@bernouy/cms-auth";
import type { CmsRepository } from "@bernouy/cms-content";
import type { Runner } from "@bernouy/http-runner";
import { mountControlCmsRoutes } from "cms-control/core/admin/control/mountRoutes";
import { createControlCmsState } from "cms-control/core/admin/control/state";
import type { ControlCmsDependencies } from "cms-control/core/admin/control/types";

export type {
    ControlAuthBackends,
    ControlCmsDependencies,
    ControlCmsOptions,
} from "cms-control/core/admin/control/types";

export class ControlCms {
    readonly ready: Promise<void>;

    constructor(
        runner: Runner,
        repository: CmsRepository,
        auth: Authentication,
        dependencies: ControlCmsDependencies = {},
    ) {
        const state = createControlCmsState({
            runner,
            repository,
            auth,
            dependencies,
        });
        this.ready = mountControlCmsRoutes(state, dependencies.authBackends ?? {});
    }
}
