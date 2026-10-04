import { BunRunner } from "@bernouy/http-runner";
import type { OfficialRepositoryApplication } from "./application";
import type { OfficialRepositoryEnv } from "./env";

export function startOfficialRepositoryServer(application: OfficialRepositoryApplication, env: OfficialRepositoryEnv) {
    const runner = new BunRunner({ hostname: env.host, idleTimeoutSeconds: 120 });
    for (const method of ["GET", "HEAD", "POST", "PUT", "DELETE"] as const) {
        runner.setDefaultEndpoint(method, (request) => application.handle(request));
    }
    runner.start(env.port);
    return runner;
}
