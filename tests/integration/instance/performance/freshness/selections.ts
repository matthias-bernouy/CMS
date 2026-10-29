import { expect } from "bun:test";
import { cachedPage, contractSelectionOperation, type Connection } from "./context";
export async function exerciseSelectionFreshness(connection: Connection, cmsUrl: string) {
    const call = async (capability: string, input: Record<string, unknown> = {}) => {
        const url = `${cmsUrl}/.cms/query/ulvia.cms.installations/${capability}`;
        const response =
            capability === "list-provider-installations"
                ? await connection.page.request.get(url)
                : await connection.page.request.fetch(url, { method: "QUERY", data: input });
        expect(response.status(), await response.text()).toBe(200);
        const value = await response.json();
        await response.dispose();
        return value;
    };
    const page = cachedPage(cmsUrl, "/cache-collection");
    await page.warm();
    const current = await call("list-provider-installations");
    const grants = {
        default: "allow-selected",
        denied: [{ contractId: "ulvia.cms.emailer.smtp", capabilityId: "smtp.configuration.update" }],
    };
    const plan = await call("plan-contract-upgrade", { selections: current.selections, grants });
    expect(plan.status, JSON.stringify(plan.issues)).toBe("applicable");
    const applied = await contractSelectionOperation(connection, cmsUrl, {
        selections: plan.selections,
        grants,
        planDigest: plan.planDigest,
    });
    expect(applied.status).toBe("completed");
    expect(applied.selectionRevision).toBeGreaterThan(current.selectionRevision);
    const after = await page.read("MISS");
    expect(after.status).toBe(200);
    expect((await call("plan-contract-upgrade", { selections: current.selections })).grants).toEqual(grants);
    await page.read("HIT");
    const smtpUrl = `${cmsUrl}/.cms/query/ulvia.cms.emailer.smtp/smtp.configuration.get`;
    const before = await connection.page.request.get(smtpUrl);
    expect(before.status()).toBe(200);
    const configuration = await before.json();
    const denied = await connection.page.request.post(
        `${cmsUrl}/.cms/mutation/ulvia.cms.emailer.smtp/smtp.configuration.update`,
        {
            data: {
                enabled: false,
                fromEmail: "test@example.invalid",
                fromName: "Test",
                replyTo: "",
                smtp: {
                    host: "localhost",
                    port: 25,
                    secure: false,
                    username: "",
                },
            },
        },
    );
    expect(denied.status()).toBe(403);
    const unchanged = await connection.page.request.get(smtpUrl);
    expect(await unchanged.json()).toEqual(configuration);
    await before.dispose();
    await denied.dispose();
    await unchanged.dispose();
    return { selectionGrantsImmediate: true };
}
