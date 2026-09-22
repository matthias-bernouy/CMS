import { expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { createContentReader } from "@bernouy/cms-content/rendering";
import { ControlCms } from "cms-control/ControlCms";
import { authSystem, CaptureRunner } from "../../control/access/authPublicSupport";

test("Control's mounted frame previews drafts only through its authenticated route", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.insertPage("/draft", "Draft", "<p>Unpublished preview sentinel</p>");
    const page = (await repository.getPage("/draft"))!;
    expect(page.visible).toBe(false);
    const publicReader = createContentReader(repository);
    expect(await publicReader.getPublishedPageById(page.id)).toBeNull();
    expect(await publicReader.getPublishedPage(page.path)).toBeNull();

    for (const authenticated of [false, true]) {
        const runner = new CaptureRunner("/cms");
        const auth = authenticated ? new InMemoryAuthentication() : authSystem().local;
        const control = new ControlCms(runner, repository, auth);
        await control.ready;
        const route = "GET /cms/api/editor/frame";
        const handler = runner.handlers.get(route);
        const chain = runner.middlewareChains.get(route);
        expect(handler).toBeDefined();
        expect(chain?.length).toBeGreaterThan(0);
        const request = new Request(`http://localhost/cms/api/editor/frame?id=${page.id}`);
        const invoke = chain!.reduceRight<() => Promise<Response>>(
            (next, middleware) => () => middleware(request, next),
            async () => handler!(request),
        );
        const response = await invoke();
        const body = await response.text();
        if (authenticated) {
            expect(response.status).toBe(200);
            expect(body).toContain("Unpublished preview sentinel");
        } else {
            expect(response.status).toBe(302);
            expect(response.headers.get("location")).toContain("/login");
            expect(body).not.toContain("Unpublished preview sentinel");
        }
    }
});
