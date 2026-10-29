import type { Locator } from "playwright";
import type { Page } from "playwright";
import { parseCapabilityOperationHandle } from "@bernouy/cms-repository/contracts/protocol";

type ProbePage = Pick<Page, "request" | "url" | "waitForTimeout">;

/** A 202 acknowledges work; only the terminal operation result permits inspecting the new site state. */
export async function waitForSiteOperation(page: ProbePage, handle: unknown, now = Date.now): Promise<void> {
    const { operationId } = parseCapabilityOperationHandle(handle);
    const endpoint = new URL("/.cms/query/ulvia.cms.installations/get-operation", page.url()).href;
    const deadline = now() + 60_000;
    while (now() < deadline) {
        const response = await page.request.fetch(endpoint, { method: "QUERY", data: { operationId } });
        let value: { operationId?: unknown; status?: unknown; result?: { status?: unknown }; errorCode?: unknown };
        try {
            if (!response.ok()) {
                throw new Error(`Operation status query failed (${response.status()})`);
            }
            value = await response.json();
        } finally {
            await response.dispose();
        }
        if (value.operationId !== operationId) {
            throw new Error("Operation status returned a different identity");
        }
        if (value.status === "succeeded") {
            if (value.result?.status !== "completed") {
                throw new Error("Site operation did not complete its upgrade");
            }
            return;
        }
        if (value.status === "failed") {
            throw new Error(`Site operation failed: ${String(value.errorCode ?? "unknown").slice(0, 64)}`);
        }
        if (value.status !== "queued" && value.status !== "running") {
            throw new Error("Unknown site operation status");
        }
        await page.waitForTimeout(250);
    }
    throw new Error("Site operation did not finish before its deadline");
}

/** Observe the real 202 and identify its durable operation without rewriting the browser response. */
export async function submitSiteUpgrade(
    page: ProbePage & Pick<Page, "waitForResponse">,
    apply: Pick<Locator, "click">,
    capability: "apply-collection-upgrade" | "apply-contract-upgrade",
): Promise<void> {
    const before = new Set((await listSiteOperations(page)).map((item) => item.operationId));
    const accepted = page
        .waitForResponse(
            (response) =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname.endsWith(`/ulvia.cms.installations/${capability}`),
            { timeout: 15_000 },
        )
        .then((response) => {
            if (response.status() !== 202) {
                throw new Error(`Site upgrade command was not acknowledged (${response.status()})`);
            }
        });
    await Promise.all([accepted, apply.click({ noWaitAfter: true })]);
    const created = (await listSiteOperations(page)).filter(
        (item) => item.capabilityId === capability && !before.has(item.operationId),
    );
    if (created.length !== 1) {
        throw new Error("Site upgrade did not produce one unambiguous new operation");
    }
    await waitForSiteOperation(page, { operationId: created[0]!.operationId });
}

async function listSiteOperations(page: ProbePage): Promise<{ operationId: string; capabilityId: string }[]> {
    const endpoint = new URL("/.cms/query/ulvia.cms.installations/list-operations", page.url()).href;
    const response = await page.request.fetch(endpoint, { method: "QUERY", data: { limit: 100 } });
    try {
        if (!response.ok()) {
            throw new Error(`Operation inventory failed (${response.status()})`);
        }
        const value = (await response.json()) as { items: { operationId: string; capabilityId: string }[] };
        if (!Array.isArray(value.items) || value.items.length > 100) {
            throw new Error("Invalid operation inventory");
        }
        for (const item of value.items) {
            parseCapabilityOperationHandle({ operationId: item.operationId });
        }
        return value.items;
    } finally {
        await response.dispose();
    }
}
