import { expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

export async function verifySecondInstanceIsolation(
    dataRoot: string,
    credentials: { adminPassword: string },
    kernelUrl: string,
    providerUrl: string,
): Promise<void> {
    const [operatorToken, primary] = await Promise.all([
        readFile(join(dataRoot, "services", "provider-operator-token"), "utf8"),
        readFile(join(dataRoot, "instances", "default", "instance.json"), "utf8").then(
            (source) => JSON.parse(source) as { instanceId: string; token: string },
        ),
    ]);
    const created = await fetch(`${providerUrl}/ulvia/operator/instances`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${operatorToken}`,
            "content-type": "application/json",
            "idempotency-key": "kernel-smoke-second",
        },
        body: JSON.stringify({
            label: "Second isolated instance",
            kernelUrl,
            administrator: { email: "second@ulvia.local", password: credentials.adminPassword },
        }),
    });
    expect(created.status).toBe(201);
    const secondary = (await created.json()) as {
        instance: { id: string };
        credentials: { instanceAccessToken: string };
    };
    expect(secondary.instance.id).not.toBe(primary.instanceId);

    const reports = await Promise.all(
        [primary.token, secondary.credentials.instanceAccessToken].map((token) =>
            fetch(`${providerUrl}/ulvia/report`, { headers: { authorization: `Bearer ${token}` } }).then((response) =>
                response.json(),
            ),
        ),
    );
    expect(reports.map((report) => report.instanceId)).toEqual([primary.instanceId, secondary.instance.id]);
}

export async function mutateProviders(page: Page): Promise<void> {
    await adminPageLink(page, "providers").click();
    await page.locator("#provider-installations").waitFor();
    await page.locator('a[href="#contract-routing"]').click();
    await page.waitForURL(/#contract-routing$/u);
    await page.locator("#contract-routing").waitFor();
    await page.locator('a[href^="/admin/providers/upgrade?ulvia-official-contract=ulvia.cms.content&"]').click();
    const apply = page.locator(
        'form[cms-mutation="ulvia.cms.installations:apply-contract-upgrade as mutation"] button[type="submit"]',
    );
    await apply.waitFor();
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.installations/apply-contract-upgrade")),
        apply.click(),
    ]);
    if (!response.ok()) {
        throw new Error(`Contract routing review failed (${response.status()}).`);
    }
    await page.waitForURL(/\/admin\/providers$/u);
    const installation = page.locator("#provider-installations [role=listitem]").first();
    for (const action of ["disable", "revoke"]) {
        const button = installation
            .locator('form[cms-mutation^="ulvia.cms.installations:set-provider-status "]')
            .filter({ has: page.locator(`input[name="action"][value="${action}"]`) })
            .locator('button[type="submit"]');
        if (await button.isEnabled()) {
            throw new Error(`Selected provider installation unexpectedly allowed ${action}`);
        }
    }
}

export async function mutateAccess(page: Page, adminEmail: string): Promise<void> {
    await adminPageLink(page, "access").click();
    await page.locator("#access-members").waitFor();
    const administrator = page.locator('#access-members [role="listitem"]').filter({ hasText: adminEmail });
    const removeAdministrator = administrator
        .locator('form[cms-mutation^="ulvia.cms.access:set-administrator "]')
        .filter({ has: page.locator('input[name="enabled"][value="false"]') });
    await expectMutationError(page, removeAdministrator, "set-administrator", ["CANNOT_REMOVE_SELF"]);
    await expectMutationError(
        page,
        administrator.locator('form[cms-mutation^="ulvia.cms.access:delete-user "]'),
        "delete-user",
        ["CANNOT_REMOVE_SELF", "PROTECTED_USER"],
    );
}

async function expectMutationError(
    page: Page,
    form: ReturnType<Page["locator"]>,
    capability: string,
    expectedCodes: string[],
): Promise<void> {
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes(`ulvia.cms.access/${capability}`)),
        form.locator('button[type="submit"]').click(),
    ]);
    if (response.ok()) {
        throw new Error(`${capability} unexpectedly succeeded for the current administrator`);
    }
    const body = (await response.json()) as { error?: { code?: string } };
    if (!body.error?.code || !expectedCodes.includes(body.error.code)) {
        throw new Error(`${capability} returned an unexpected error: ${JSON.stringify(body)}`);
    }
}

function adminPageLink(page: Page, pageId: string) {
    return page.locator(`a[href="/admin/${pageId}"]`).first();
}
