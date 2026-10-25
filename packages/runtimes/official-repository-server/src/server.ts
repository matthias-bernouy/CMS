import { BunRunner } from "@bernouy/http-runner";
import type { OfficialRepositoryApplication } from "./application";
import type { OfficialRepositoryEnv } from "./env";
import type { Logger } from "@bernouy/logging";

export function startOfficialRepositoryServer(
    application: OfficialRepositoryApplication,
    env: OfficialRepositoryEnv,
    logger: Logger,
) {
    const runner = new BunRunner({ hostname: env.host, idleTimeoutSeconds: 120, logger });
    for (const method of ["GET", "HEAD", "POST", "PUT", "DELETE", "QUERY"] as const) {
        runner.setDefaultEndpoint(method, (request) => application.handle(request));
    }
    runner.start(env.port);
    return runner;
}
