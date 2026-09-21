import type { Page } from "playwright";
import { installReadonlyRoutes } from "../fixture";
export const subject = "OIDC:Tenant/User+Opaque==";
export const aliceLabel = `Alice Martin — alice@example.test · ${subject}`;
export async function installUserRoutes(page: Page, bundle: string, styles: string, shown = false, long = false) {
    const fixture = await installReadonlyRoutes(page, bundle, styles, {
        resource: { id: "users", title: "CMS users", name: "Initial", shown, user: "", reviewer: "missing:subject" },
        normalize: (resource) => ({ ...resource, name: String(resource.name).trim() }),
        fields: [
            { id: "name", path: "name", type: "text", label: "Name" },
            { id: "shown", path: "shown", type: "checkbox", label: "Choose CMS users" },
            {
                id: "user",
                path: "user",
                type: "cms-user",
                label: "CMS user",
                required: true,
                visibleWhen: { value: "$field.shown", equals: true },
            },
            {
                id: "reviewer",
                path: "reviewer",
                type: "cms-user",
                label: "Reviewer",
                visibleWhen: { value: "$field.shown", equals: true },
            },
            ...(long
                ? Array.from({ length: 16 }, (_, index) => ({
                      id: `spacer${index}`,
                      label: `Information ${index + 1}`,
                      path: "name",
                      type: "readonly" as const,
                  }))
                : []),
            ...(long ? [{ id: "notes", label: "Notes", path: "notes", type: "textarea" as const }] : []),
        ],
    });
    let reads = 0;
    let fail = false;
    let hold: Promise<void> | undefined;
    await page.route("**/api/users", async (route) => {
        reads += 1;
        await hold;
        if (fail) {
            fail = false;
            await route.fulfill({ status: 503, json: { error: "Directory unavailable" } });
        } else {
            await route.fulfill({
                json: [
                    { sub: subject, displayName: "Alice Martin", email: "alice@example.test" },
                    { sub: "user:bob", email: "bob@example.test" },
                ],
            });
        }
    });
    return {
        ...fixture,
        reads: () => reads,
        fail: () => {
            fail = true;
        },
        hold: () => {
            let release = () => {};
            hold = new Promise<void>((resolve) => {
                release = resolve;
            });
            return release;
        },
    };
}
