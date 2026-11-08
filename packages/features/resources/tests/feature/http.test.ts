import { expect, test } from "bun:test";
import { writeResourceArchive } from "../../src/exports";
import { resourceProviderFixture } from "./httpFixture";

test("signed resource HTTP review/apply/status preserve authority, private causes and source-free completed replay", async () => {
    const f = await resourceProviderFixture();
    try {
        const entry = await f.call("entry", undefined, { actorKind: "anonymous", subjectId: undefined });
        expect(entry.status).toBe(200);
        expect(await entry.json()).toEqual({ pending: true });
        const reviewResponse = await f.call("plan", { choice: "base", locale: "en" });
        expect(reviewResponse.status).toBe(200);
        const plan = await reviewResponse.json();
        const review = JSON.parse(plan.reviewJson);
        expect(plan.planDigest).toBe(review.digest);
        expect(review.counts).toEqual({ assets: 1, texts: 1, blocs: 1, pages: 2 });
        expect(await f.metadata.isEmpty()).toBe(true);
        const input = { reviewJson: plan.reviewJson, browserRiskAcknowledgement: review.browserRiskDigest };
        const apply = await f.call("apply", input);
        expect(apply.status).toBe(202);
        let operation = await apply.json();
        const lookups = f.operations.receiptLookups;
        f.authority.allowed = false;
        const denied = await f.call("apply", input);
        expect(denied.status).toBe(403);
        expect(await denied.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
        expect(f.operations.receiptLookups).toBe(lookups);
        expect(await f.metadata.isEmpty()).toBe(true);
        await expect(f.operations.run(operation.operationId)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(await f.metadata.isEmpty()).toBe(true);
        expect(f.operations.receiptLookups).toBe(lookups);
        f.authority.allowed = true;
        operation = await (await f.call("apply", input, {}, "resume-apply")).json();
        expect(await f.operations.run(operation.operationId)).toMatchObject({ status: "completed" });
        expect((await f.call("status")).status).toBe(200);
        const status = await (await f.call("status")).json();
        expect(status).toMatchObject({
            status: "completed",
            choice: "base",
            completed: { assets: 1, texts: 1, blocs: 1, pages: 2 },
            operationStatus: "succeeded",
            redirectPath: "/",
        });
        expect(
            await (await f.call("entry", undefined, { actorKind: "anonymous", subjectId: undefined })).json(),
        ).toEqual({ pending: false });
        f.options.source = async () => {
            throw new Error("Source ZIP removed");
        };
        expect(await (await f.call("apply", input, {}, "resume-apply")).json()).toEqual(operation);
        expect((await f.raw.scanPages(undefined, 10)).pages).toHaveLength(2);
        expect(f.retained.size).toBe(0);
    } finally {
        await f.close();
    }
});

test("foreign instances, machine subjects, denied actors and invalid resource choices refuse without copying", async () => {
    const f = await resourceProviderFixture();
    try {
        expect((await f.call("status", undefined, { instanceId: "instance-b" })).status).toBe(401);
        expect((await f.call("plan", { choice: "base", locale: "en" }, { subjectId: "unknown" })).status).toBe(403);
        expect(
            (
                await f.call(
                    "plan",
                    { choice: "base", locale: "en" },
                    { subjectId: undefined, actorKind: undefined, systemServiceId: "worker" },
                )
            ).status,
        ).toBe(403);
        expect((await f.call("plan", { choice: "collection", locale: "en" })).status).toBe(400);
        const state = await f.state.read();
        f.options.verify = async () => {
            throw new Error("private-storage-key-should-never-leak");
        };
        const failed = await f.call("plan", { choice: "base", locale: "en" });
        expect(failed.status).toBe(503);
        expect(await failed.text()).not.toContain("private-storage-key");
        expect(await f.state.read()).toEqual(state);
        expect(await f.metadata.isEmpty()).toBe(true);
        expect((await f.raw.scanPages(undefined, 1)).pages).toHaveLength(0);
        expect(f.operations.receiptLookups).toBe(0);
    } finally {
        await f.close();
    }
});

test("resource review retains publication visibility and completion never redirects to a draft-only Page", async () => {
    const f = await resourceProviderFixture();
    try {
        const archive = await writeResourceArchive({
            document: {
                ...f.archive.document,
                pages: f.archive.document.pages.map((page) => ({ ...page, visible: false })),
            },
            assets: f.archive.assets.map(({ definition, bytes }) => ({ path: definition.entry, bytes })),
        });
        f.options.source = async () => ({ digest: archive.digest, bytes: archive.bytes });
        const plan = await (await f.call("plan", { choice: "base", locale: "en" })).json();
        const review = JSON.parse(plan.reviewJson);
        expect(review.pages.map((page: { visible: boolean }) => page.visible)).toEqual([false, false]);
        const operation = await (
            await f.call("apply", { reviewJson: plan.reviewJson, browserRiskAcknowledgement: review.browserRiskDigest })
        ).json();
        expect(await f.operations.run(operation.operationId)).toMatchObject({ status: "completed", redirectPath: "" });
        const status = await (await f.call("status")).json();
        expect(status.redirectPath).toBe("");
        expect((await f.raw.scanPages(undefined, 10)).pages.every((page) => !page.visible)).toBe(true);
    } finally {
        await f.close();
    }
});
