import type { Locator } from "playwright";
import type { Route } from "playwright";
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

/** Capture the accepted handle before the browser redirects and releases its response resource. */
export async function submitSiteUpgrade(
    page: ProbePage & Pick<Page, "route" | "unroute">,
    apply: Pick<Locator, "click">,
    capability: "apply-collection-upgrade" | "apply-contract-upgrade",
): Promise<void> {
    let accept!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const accepted = new Promise<unknown>((resolve, fail) => {
        accept = resolve;
        reject = fail;
    });
    const timer = setTimeout(() => reject(new Error("Site upgrade command was not acknowledged")), 15_000);
    const pattern = `**/ulvia.cms.installations/${capability}`;
    const intercept = async (route: Route) => {
        try {
            const response = await route.fetch();
            try {
                const handle: unknown = await response.json();
                await route.fulfill({ response });
                if (!response.ok()) {
                    throw new Error(`Site upgrade command failed (${response.status()})`);
                }
                accept(handle);
            } finally {
                await response.dispose();
            }
        } catch (error) {
            reject(error);
            await route.abort().catch(() => undefined);
        }
    };
    await page.route(pattern, intercept, { times: 1 });
    try {
        const [handle] = await Promise.all([accepted, apply.click()]);
        await waitForSiteOperation(page, handle);
    } finally {
        clearTimeout(timer);
        await page.unroute(pattern, intercept);
    }
}
