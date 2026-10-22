import { expect, test } from "bun:test";
import { PUBLISHED_PAGE_SNAPSHOT_ROUTE, type ContentReader, type TPage } from "@bernouy/cms-content/rendering";
import { TtlCache } from "@bernouy/http-runner";
import KernelCms from "cms-kernel/KernelCms";
import { CaptureRunner } from "./CaptureRunner";
import { deliveryHandlers } from "./deliveryHandlers";
import { NOOP_LOGGER } from "@bernouy/logging";

test("mounts the published Page snapshot handler", async () => {
    const page = { id: "page-legal", path: "/terms", visible: true } as TPage;
    const runner = new CaptureRunner();
    const content = {
        getPublishedPageById: async (id: string) => (id === page.id ? page : null),
    } as ContentReader;
    new KernelCms({
        runner,
        cache: new TtlCache(),
        content,
        ...deliveryHandlers(content),
        resolveActor: async () => ({ kind: "anonymous" }),
        logger: NOOP_LOGGER,
    });

    const url = `https://site.test${PUBLISHED_PAGE_SNAPSHOT_ROUTE}?id=${page.id}`;
    const response = await runner.endpointHandler("GET", PUBLISHED_PAGE_SNAPSHOT_ROUTE)(new Request(url));

    expect(response.status).toBe(200);
});
