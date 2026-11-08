import { expect, test } from "bun:test";
import type { ResourceInitializationIntent } from "../../src/exports/initialization";
import { ResourceInitializationService } from "../../src/exports/initialization";
import { initializationFixture, workerGuard } from "./fixtures";

test("uncertain Bloc commit resumes exact resources under the maintenance fence", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    const create = f.options.createBloc;
    f.options.createBloc = async (bloc) => {
        await create(bloc);
        throw new Error("crash after Bloc commit");
    };
    await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toThrow("crash after Bloc commit");
    expect((await f.state.read())?.progress.blocs).toHaveLength(0);
    expect([...f.retained.keys()]).toEqual([review.digest]);
    expect(await f.raw.getBlocRecord("sample-card")).not.toBeNull();
    await expect(f.intents.withWrite("site-a", async () => "must not run")).rejects.toThrow("read-only");
    f.options.createBloc = create;
    f.options.source = async () => {
        throw new Error("source ZIP removed");
    };
    const result = await new ResourceInitializationService(f.options).apply("admin", review, null, workerGuard());
    expect(result.status).toBe("completed");
    expect(await f.raw.getBlocsList({ includeHidden: true })).toHaveLength(1);
    expect(f.retained.size).toBe(0);
});

test("uncertain Page publication is recognized after restart without duplicating Page identities", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    const update = f.content.updatePage.bind(f.content);
    let crashed = false;
    f.content.updatePage = async (...args) => {
        const page = await update(...args);
        if (!crashed && args[0].visible === true) {
            crashed = true;
            throw new Error("crash after publication");
        }
        return page;
    };
    await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toThrow("crash after publication");
    const ids = (await f.state.read())!.progress.pageIds;
    const result = await new ResourceInitializationService(f.options).apply("admin", review, null, workerGuard());
    expect(result.status).toBe("completed");
    expect(result.progress.pageIds).toEqual(ids);
    expect((await f.raw.scanPages(undefined, 10)).pages).toHaveLength(2);
});

test("completed resources disappearing during recovery cause refusal without repairing missing data", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    const create = f.options.createBloc;
    f.options.createBloc = async () => {
        throw new Error("pause before Blocs");
    };
    await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toThrow("pause before Blocs");
    const before = await f.state.read();
    const get = f.metadata.getTexts.bind(f.metadata);
    f.metadata.getTexts = async () => null;
    f.options.createBloc = create;
    await expect(
        new ResourceInitializationService(f.options).apply("admin", review, null, workerGuard()),
    ).rejects.toThrow("text source disappeared");
    expect(await f.state.read()).toEqual(before);
    expect(await f.raw.getBlocRecord("sample-card")).toBeNull();
    f.metadata.getTexts = get;
});

test("recovery reauthorizes and refuses changed execution without new business writes", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    f.options.createBloc = async () => {
        throw new Error("pause");
    };
    await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toThrow("pause");
    const state = await f.state.read();
    const receipts = f.calls.receipt;
    f.authority.allowed = false;
    await expect(
        new ResourceInitializationService(f.options).apply("admin", review, null, workerGuard()),
    ).rejects.toThrow("not authorized");
    expect(f.calls.receipt).toBe(receipts);
    f.authority.allowed = true;
    f.options.execution = async () => ({ fingerprint: "changed", selected: [], denied: [] });
    await expect(
        new ResourceInitializationService(f.options).apply("admin", review, null, workerGuard()),
    ).rejects.toThrow("execution changed");
    expect(await f.state.read()).toEqual(state);
});

test("missing retained ZIP refuses recovery and an expired worker never releases maintenance", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    const controller = new AbortController();
    f.options.createBloc = async () => {
        controller.abort(new Error("lease expired"));
        throw new Error("stopped");
    };
    await expect(f.service.apply("admin", review, null, workerGuard(controller))).rejects.toThrow("lease expired");
    await expect(f.intents.withWrite("site-a", async () => 1)).rejects.toThrow("read-only");
    f.retained.clear();
    await expect(
        new ResourceInitializationService(f.options).apply("admin", review, null, workerGuard()),
    ).rejects.toThrow("unavailable for recovery");
    expect(await f.raw.getBlocRecord("sample-card")).toBeNull();
});

test("a prepared review invalidated before copying can be reviewed again without a stuck intent", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    const begin = f.intents.begin.bind(f.intents);
    const execution = f.options.execution;
    f.intents.begin = async <Payload>(intent: ResourceInitializationIntent<Payload>) => {
        const result = await begin(intent);
        f.options.execution = async () => ({ fingerprint: "changed after receipt creation", selected: [], denied: [] });
        return result;
    };
    await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toThrow("execution changed");
    expect(await f.intents.getActive("site-a")).toBeNull();
    expect((await f.state.read())?.status).toBe("pending");
    expect((await f.state.read())?.revision).toBe(1);
    expect(await f.metadata.isEmpty()).toBe(true);
    expect(f.retained.size).toBe(0);
    f.intents.begin = begin;
    f.options.execution = execution;
    const replacement = await f.service.plan("admin", "base", "en");
    expect(replacement.digest).not.toBe(review.digest);
    expect((await f.service.apply("admin", replacement, null, workerGuard())).status).toBe("completed");
});
