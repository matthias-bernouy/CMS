import { expect, test } from "bun:test";
import { ResourceInitializationService, pendingResourceInitialization } from "../../src/exports/initialization";
import { resourceTextSource } from "../../src/exports/storage";
import { initializationFixture, workerGuard } from "./fixtures";

test("review performs no live writes; ordinary resources and Pages survive exact replay without source ZIP", async () => {
    const f = await initializationFixture();
    const before = await f.raw.getSystem();
    const review = await f.service.plan("admin", "base", "en");
    expect(review.counts).toEqual({ blocs: 1, assets: 1, texts: 1, pages: 2 });
    expect(await f.metadata.isEmpty()).toBe(true);
    expect((await f.raw.scanPages(undefined, 1)).pages).toHaveLength(0);
    expect(await f.raw.getSystem()).toEqual(before);
    expect(await f.state.read()).toEqual(pendingResourceInitialization("instance-a", "site-a"));
    const completed = await f.service.apply("admin", review, null, workerGuard());
    expect(completed.status).toBe("completed");
    expect(completed.progress.pages).toHaveLength(2);
    expect((await f.raw.getPage("/"))?.visible).toBe(true);
    expect((await f.raw.getSystem()).site.login?.pageId).toBe((await f.raw.getPage("/login"))?.id);
    expect(resourceTextSource((await f.texts.snapshot()).sources[0]!).resolve("fr")).toEqual({ hello: "Bonjour" });
    expect(await new Response((await f.assets.read({ namespace: "acme/base", id: "file.txt" }))!.stream).text()).toBe(
        "base asset",
    );
    expect(f.retained.size).toBe(0);
    const { source, verification } = f.calls;
    f.options.source = async () => {
        throw new Error("ZIP no longer exists");
    };
    expect(await new ResourceInitializationService(f.options).apply("admin", review, null, workerGuard())).toEqual(
        completed,
    );
    expect(f.calls.source).toBe(source);
    expect(f.calls.verification).toBe(verification);
    expect(await f.intents.withWrite("site-a", async () => "allowed")).toBe("allowed");
});

test("empty initialization creates no Pages or resources and never loads a base archive", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "empty", "en");
    expect(review.archiveDigest).toBeNull();
    expect((await f.service.apply("admin", review, null, workerGuard())).status).toBe("completed");
    expect(f.calls.source).toBe(0);
    expect(f.calls.verification).toBe(0);
    expect(await f.metadata.isEmpty()).toBe(true);
    expect((await f.raw.scanPages(undefined, 1)).pages).toHaveLength(0);
});

test("fresh authorization precedes receipt access, including a completed replay", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    await f.service.apply("admin", review, null, workerGuard());
    const before = await f.state.read();
    const receipts = f.calls.receipt;
    f.authority.allowed = false;
    await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toThrow("not authorized");
    await expect(f.service.status("admin")).rejects.toThrow("not authorized");
    expect(f.calls.receipt).toBe(receipts);
    expect(await f.state.read()).toEqual(before);
});

test("browser authority acknowledgement, foreign actors and foreign instances refuse before intent or mutation", async () => {
    const f = await initializationFixture(true);
    const review = await f.service.plan("admin", "base", "en");
    expect(review.browserRisk.level).toBe("high");
    await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toThrow("acknowledged");
    await expect(f.service.apply("other-admin", review, review.browserRiskDigest, workerGuard())).rejects.toThrow(
        "not authorized",
    );
    const other = new ResourceInitializationService({ ...f.options, instanceId: "instance-b" });
    await expect(other.apply("admin", review, review.browserRiskDigest, workerGuard())).rejects.toThrow(
        "another actor or instance",
    );
    expect(f.calls.receipt).toBe(0);
    expect(await f.metadata.isEmpty()).toBe(true);
    expect((await f.state.read())?.status).toBe("pending");
    expect((await f.raw.scanPages(undefined, 1)).pages).toHaveLength(0);
    expect((await f.service.apply("admin", review, review.browserRiskDigest, workerGuard())).status).toBe("completed");
});

test("stale system/execution evidence and occupied content refuse without import", async () => {
    for (const change of ["system", "execution", "content"] as const) {
        const f = await initializationFixture();
        const review = await f.service.plan("admin", "base", "en");
        if (change === "system") {
            await f.raw.updateSystem(await f.raw.getSystem());
        }
        if (change === "execution") {
            f.options.execution = async () => ({ fingerprint: "selected-v2", selected: [], denied: [] });
        }
        if (change === "content") {
            await f.raw.insertPage("/existing", "Existing");
        }
        await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toBeInstanceOf(Error);
        expect(await f.metadata.isEmpty()).toBe(true);
        expect(await f.raw.getBlocsList({ includeHidden: true })).toHaveLength(0);
        expect((await f.state.read())?.status).toBe("pending");
        expect(await f.intents.getActive("site-a")).toBeNull();
    }
});
