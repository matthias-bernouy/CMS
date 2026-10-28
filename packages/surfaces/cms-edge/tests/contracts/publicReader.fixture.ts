import type { EdgeCmsConfig } from "@bernouy/cms-edge";
import type { Runner } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";
declare const runner: Runner;
declare const logger: Logger;
export const config: EdgeCmsConfig = {
    runner,
    logger,
    resolveActor: async () => ({ kind: "anonymous" }),
    resourceHandler: async () => new Response("resource"),
};
const invalid: EdgeCmsConfig = {
    ...config,
    // @ts-expect-error Edge never receives the Content repository or a rendering projection.
    content: {},
};
void invalid;
