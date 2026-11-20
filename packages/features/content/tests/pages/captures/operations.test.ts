import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";
import { MemoryCaptureArtifacts } from "@bernouy/browser-capture";
import type { ContentServices } from "@bernouy/content/feature";
import type { ContentCapabilityContext } from "content/application/interfaces/ContentCapabilityContext";
import { capturePage, captureImage } from "content/application/captures/operations";
const context: ContentCapabilityContext = {
    siteId: "default",
    providerId: "provider",
    subjectId: "admin",
    actorKind: "administrator",
    requestId: "test",
    contractVersion: "1.3.0",
    invocation: { contractId: "ulvia/cms.content", instanceId: "instance-a" },
};
const options = { width: 640, height: 360, mode: "viewport" as const, themeMode: "light" as const };
async function fixture() {
    const repo = new InMemoryContentRepository();
    await repo.insertPage("/draft", "Draft", "<p>Private</p>");
    const page = (await repo.getPage("/draft"))!;
    let executions = 0;
    const services = {
        repo,
        captures: {
            run: async (work) => work(),
            artifacts: new MemoryCaptureArtifacts(),
            revision: async () => "settings-1",
            engine: {
                capture: async () => {
                    executions++;
                    return {
                        bytes: new Uint8Array([137, 80, 78, 71]),
                        width: 640,
                        height: 360,
                        browserVersion: "test",
                        diagnostics: [],
                    };
                },
            },
            pageDocument: async () => ({
                path: "index.html",
                files: new Map([["index.html", new Blob([page.content])]]),
            }),
        },
    } as unknown as ContentServices;
    return { services, page, executions: () => executions };
}
test("draft capture preserves business state and images refuse other instances, subjects and connections", async () => {
    const { services, page, executions } = await fixture();
    const before = await services.repo.getPageById(page.id);
    const capture = await capturePage(
        services,
        { id: page.id, expectedRevision: page.revision, locale: "en", options },
        context,
    );
    expect(executions()).toBe(1);
    expect(capture.source).toMatchObject({ kind: "page", id: page.id, revision: "1:settings-1" });
    expect(await services.repo.getPageById(page.id)).toEqual(before);
    expect((await captureImage(services, capture.captureId, context).arrayBuffer()).byteLength).toBe(4);
    for (const foreign of [
        { ...context, subjectId: "other" },
        { ...context, connectionId: "other" },
        { ...context, invocation: { ...context.invocation!, instanceId: "instance-b" } },
    ]) {
        expect(() => captureImage(services, capture.captureId, foreign)).toThrow("NOT_FOUND");
    }
});
test("stale, missing and unauthorized Page reads refuse before browser execution", async () => {
    const { services, page, executions } = await fixture();
    for (const input of [
        { id: page.id, expectedRevision: 2 },
        { id: "foreign-page", expectedRevision: 1 },
    ]) {
        await expect(capturePage(services, { ...input, locale: "en", options }, context)).rejects.toThrow();
    }
    await expect(
        capturePage(
            services,
            { id: page.id, expectedRevision: 1, locale: "en", options },
            { ...context, actorKind: "anonymous" },
        ),
    ).rejects.toThrow();
    expect(executions()).toBe(0);
    expect((await services.repo.getPageById(page.id))?.visible).toBeFalse();
});
test("a settings change during resource preparation refuses without producing an artifact", async () => {
    const { services, page, executions } = await fixture();
    let revision = 0;
    Object.assign(services.captures!, { revision: async () => String(revision++) });
    await expect(
        capturePage(services, { id: page.id, expectedRevision: 1, locale: "en", options }, context),
    ).rejects.toThrow("REVISION_CONFLICT");
    expect(executions()).toBe(0);
});

test("authorized ordinary invocation subjects own captures without a resource-only actorKind claim", async () => {
    const { services, page } = await fixture();
    const ordinary = { ...context, actorKind: undefined };
    const capture = await capturePage(
        services,
        { id: page.id, expectedRevision: page.revision, locale: "en", options },
        ordinary,
    );
    expect((await captureImage(services, capture.captureId, ordinary).arrayBuffer()).byteLength).toBe(4);
    await expect(
        capturePage(
            services,
            { id: page.id, expectedRevision: page.revision, locale: "en", options },
            { ...ordinary, subjectId: undefined },
        ),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
        capturePage(
            services,
            { id: page.id, expectedRevision: page.revision, locale: "en", options },
            { ...context, actorKind: "user" },
        ),
    ).rejects.toThrow("NOT_FOUND");
});
