import { repositoryApi } from "./client";
import { expect } from "bun:test";

export function initializationApi(origin: string, cookie = "") {
    const call = async (path: string, method = "GET", input?: unknown) =>
        fetch(`${origin}/.cms/call/ulvia/cms.installations/${path}`, {
            method,
            redirect: "manual",
            signal: AbortSignal.timeout(120_000),
            headers: {
                origin,
                cookie,
                ...(input === undefined ? {} : { "content-type": "application/json" }),
                ...(method === "POST" ? { "idempotency-key": crypto.randomUUID() } : {}),
            },
            ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        });
    return {
        call,
        async plan(root: unknown) {
            const response = await call("initialization/plan", "QUERY", { root });
            expect(response.status).toBe(200);
            const body = await response.json();
            return JSON.parse(body.reviewJson);
        },
        async apply(root: unknown, planDigest: string, expected = "succeeded") {
            const response = await call("initialization/apply", "POST", { root, planDigest });
            expect(response.status).toBe(202);
            const operation = await response.json();
            for (let attempt = 0; attempt < 180; attempt++) {
                const result = await call("initialization/status");
                expect(result.status).toBe(200);
                const record = await result.json();
                const status =
                    record.status === "completed"
                        ? "succeeded"
                        : record.operationId === operation.operationId && record.operationStatus === "failed"
                          ? "failed"
                          : "running";
                if (["succeeded", "failed"].includes(status)) {
                    expect(status, JSON.stringify(record)).toBe(expected);
                    return { ...record, status };
                }
                await Bun.sleep(250);
            }
            throw new Error("Initialization operation did not complete");
        },
    };
}

/** Explicit test setup through the same admitted API used by the native screens. */
export async function installStarter(
    origin: string,
    administrator: { email: string; password: string },
    collectionId: string,
) {
    const session = await repositoryApi(origin).session(administrator.email, administrator.password);
    const api = initializationApi(origin, session.cookie);
    let cursor = "";
    do {
        const response = await api.call("initialization/recipes", "QUERY", { cursor });
        expect(response.status).toBe(200);
        const page = await response.json();
        const recipe = page.items.find(
            (item: { root: { collectionId: string } }) => item.root.collectionId === collectionId,
        );
        if (recipe) {
            const review = await api.plan(recipe.root);
            await api.apply(recipe.root, review.digest);
            return;
        }
        cursor = page.cursor;
    } while (cursor);
    throw new Error(`Missing test bootstrap for ${collectionId}`);
}
