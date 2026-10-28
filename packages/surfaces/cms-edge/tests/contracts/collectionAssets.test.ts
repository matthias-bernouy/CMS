import { expect, test } from "bun:test";
import EdgeCms from "cms-edge/EdgeCms";
import { CaptureRunner } from "../gateway/support/CaptureRunner";
import { NOOP_LOGGER } from "@bernouy/logging";
test("Edge forwards asset paths without knowing the collection protocol", async () => {
    const runner = new CaptureRunner();
    const paths: string[] = [];
    new EdgeCms({
        runner,
        logger: NOOP_LOGGER,
        resolveActor: async () => ({ kind: "anonymous" }),
        resourceHandler: async (request) => {
            paths.push(new URL(request.url).pathname);
            return new Response(null, { status: 404 });
        },
    });
    const path = "/_content/collections/design-system/assets/missing.svg";
    expect((await runner.defaultHandler("GET", "/")(new Request(`https://site.test${path}`))).status).toBe(404);
    expect(paths).toEqual([path]);
});
