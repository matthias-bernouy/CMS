import { mountEdgeRoutes } from "cms-edge/http/mountEdgeRoutes";
import type { EdgeCmsConfig } from "cms-edge/EdgeCmsConfig";
export type { EdgeCmsConfig } from "cms-edge/EdgeCmsConfig";

/** Public HTTP boundary: authentication, protocols and resource forwarding. */
export default class EdgeCms {
    readonly runner;
    readonly resolveActor;
    readonly resourceHandler;
    readonly sessionCookie;
    readonly mcpHandler;
    readonly capabilityGateway;
    readonly capabilityHandler;
    readonly mutationHandler;
    readonly queryHandler;
    readonly basePath;
    readonly logger;
    constructor(config: EdgeCmsConfig) {
        this.runner = config.runner;
        this.resolveActor = config.resolveActor;
        this.resourceHandler = config.resourceHandler;
        this.sessionCookie = config.sessionCookie;
        this.mcpHandler = config.mcpHandler;
        this.capabilityGateway = config.capabilityGateway;
        this.capabilityHandler = config.capabilityHandler;
        this.mutationHandler = config.mutationHandler;
        this.queryHandler = config.queryHandler;
        this.logger = config.logger;
        this.basePath = config.runner.basePath === "/" ? "" : config.runner.basePath;
        mountEdgeRoutes(this);
    }
}
