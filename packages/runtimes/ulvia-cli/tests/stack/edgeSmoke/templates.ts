import { expect } from "bun:test";
import type { Page } from "playwright";
import { repositoryApi } from "../../../../../../tests/integration/instance/repository/client";
import type { HostedSite } from "./setup";

export async function verifyAccountTemplates(page: Page, primary: HostedSite, foreign: HostedSite) {
    const api = repositoryApi(primary.origin);
    const actor = await api.session(primary.administrator.email, primary.administrator.password);
    const call = async (contract: string, path: string, method: string, input?: unknown) => {
        const response = await api.request(contract, path, method, input, actor);
        expect(response.status, `${path}: ${response.status}`).toBe(200);
        return response.json();
    };
    const configuration = await call("ulvia/cms.access", "/accounts/email-configuration/get", "GET");
    expect(configuration.emailVerification.version).toBe(1);
    expect(configuration.selectedSource).toBe(configuration.emailVerification.source);
    const defaults = await call("ulvia/cms.email-templates", "/email-templates/list", "QUERY", {
        limit: 25,
        includeArchived: false,
    });
    expect(defaults.items).toHaveLength(2);
    expect(
        defaults.items.every((item: { origin: { consumer: string } }) => item.origin.consumer === "ulvia/cms.access"),
    ).toBe(true);
    const original = await call("ulvia/cms.email-templates", "/email-templates/get", "QUERY", {
        id: configuration.emailVerification.id,
    });
    const id = crypto.randomUUID();
    const custom = await call("ulvia/cms.email-templates", "/email-templates/create", "POST", {
        id,
        name: "Custom account email",
        description: "Browser journey",
        locale: "en",
        draft: { ...original.draft, subject: "Custom verification for {{siteName}}" },
    });
    const preview = await page.evaluate(
        async ({ origin, id, revision }) => {
            const response = await fetch(`${origin}/.cms/call/ulvia/cms.email-templates/email-templates/preview`, {
                method: "QUERY",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    id,
                    expectedRevision: revision,
                    values: [
                        { name: "siteName", value: "Browser site" },
                        { name: "recipientEmail", value: "visitor@example.com" },
                        { name: "recipientName", value: "Visitor" },
                        { name: "actionUrl", value: "https://example.com/confirm?token=fictitious" },
                        { name: "expiresAt", value: "2026-12-01T12:00:00.000Z" },
                    ],
                }),
            });
            return { status: response.status, body: await response.json() };
        },
        { origin: primary.origin, id, revision: custom.revision },
    );
    expect(preview.status).toBe(200);
    expect(preview.body.subject).toBe("Custom verification for Browser site");
    expect(preview.body.text).toContain("token=fictitious");
    const publication = await call("ulvia/cms.email-templates", "/email-templates/publish", "POST", {
        id,
        expectedRevision: custom.revision,
    });
    await call("ulvia/cms.access", "/accounts/email-configuration/update", "PUT", {
        expectedRevision: configuration.revision,
        emailVerification: { id, version: publication.version, source: configuration.selectedSource },
        passwordReset: configuration.passwordReset,
    });
    await call("ulvia/cms.email-templates", "/email-templates/archive", "POST", {
        id,
        expectedRevision: custom.revision + 1,
    });
    const anonymous = await api.request("ulvia/cms.email-templates", "/email-templates/render", "QUERY", {
        id,
        version: 1,
        values: [],
    });
    expect([401, 403]).toContain(anonymous.status);
    await anonymous.body?.cancel();
    const other = repositoryApi(foreign.origin);
    const foreignActor = await other.session(foreign.administrator.email, foreign.administrator.password);
    const cross = await other.request(
        "ulvia/cms.email-templates",
        "/email-templates/get",
        "QUERY",
        { id },
        foreignActor,
    );
    expect(cross.status).toBe(404);
    await cross.body?.cancel();
    return id;
}
export async function verifyAccountTemplatesAfterRestart(primary: HostedSite, id: string) {
    const api = repositoryApi(primary.origin);
    const actor = await api.session(primary.administrator.email, primary.administrator.password);
    const response = await api.request(
        "ulvia/cms.access",
        "/accounts/email-configuration/get",
        "GET",
        undefined,
        actor,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).emailVerification).toMatchObject({ id, version: 1 });
}
