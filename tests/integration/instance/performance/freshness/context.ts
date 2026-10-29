import { expect } from "bun:test";
import type { connectBrowser } from "../../oauth";
export type Connection = Awaited<ReturnType<typeof connectBrowser>>;
export function cachedPage(cmsUrl: string, path: string) {
    const read = async (outcome?: string) => {
        const response = await fetch(`${cmsUrl}${path}`, { redirect: "manual" });
        if (outcome) {
            expect(response.headers.get("x-cache")).toBe(outcome);
        }
        return { status: response.status, text: await response.text(), etag: response.headers.get("etag") };
    };
    return {
        read,
        async warm() {
            expect((await read()).status).toBe(200);
            const hit = await read("HIT");
            expect(hit.status).toBe(200);
            return hit;
        },
    };
}
export async function publishPage(connection: Connection, path: string, content: string) {
    const page = await connection.call("ulvia.cms.content", "pages.create", {
        path,
        title: "Mutation freshness",
        content,
    });
    return connection.call("ulvia.cms.content", "pages.publish", {
        id: page.id,
        expectedRevision: page.revision,
        visible: true,
    });
}

export async function contractSelectionOperation(
    connection: Connection,
    cmsUrl: string,
    input: Record<string, unknown>,
) {
    const response = await connection.page.request.post(
        `${cmsUrl}/.cms/mutation/ulvia.cms.installations/apply-contract-upgrade`,
        {
            data: input,
            headers: { "x-ulvia-automatic-idempotency-key": crypto.randomUUID() },
        },
    );
    expect(response.status(), await response.text()).toBe(202);
    const handle = await response.json();
    for (let attempt = 0; attempt < 100; attempt++) {
        const poll = await connection.page.request.fetch(`${cmsUrl}/.cms/query/ulvia.cms.installations/get-operation`, {
            method: "QUERY",
            data: { operationId: handle.operationId },
        });
        expect(poll.status()).toBe(200);
        const operation = await poll.json();
        await poll.dispose();
        if (operation.status === "succeeded") {
            return operation.result;
        }
        expect(operation.status, JSON.stringify(operation)).not.toBe("failed");
        await Bun.sleep(100);
    }
    throw new Error("Selection operation did not finish");
}
