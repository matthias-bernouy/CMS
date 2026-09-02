import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { installDashboardRoutes } from "./fixture";

const bundlePath = resolve(import.meta.dir, "../../../src/static/assets/control-components.js");
const adminPath = resolve(import.meta.dir, "../../../src/static/admin/_access/_workspaces/dashboards.html");
const operatorPath = resolve(import.meta.dir, "../../../src/static/dashboards/index.html");
const profilePath = resolve(import.meta.dir, "../../../src/static/dashboards/profile.html");

test("dashboard configuration uses binding while the operator runtime remains isolated", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(5_000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const fixture = await installDashboardRoutes(page);

        const started = performance.now();
        await mount(page, adminPath, "http://cms.test/admin/dashboards?id=support");
        expect(errors).toEqual([]);
        await expectPoll(async () => await text(page.locator(".dashboard-detail-title")), "Support");
        expect(performance.now() - started).toBeLessThan(5_000);

        const nav = page.locator(".dashboard-admin-nav");
        expect(await text(nav)).toContain("Site");
        expect(await text(nav)).toContain("Support");
        expect(await text(nav)).toContain("Integrations");
        expect(await text(nav)).toContain("Commerce");
        expect(await text(nav)).not.toContain("Managed");
        expect(await nav.locator(".dashboard-new").count()).toBe(1);
        await expectPoll(async () => await nav.locator("w13c-lateral-menu-item[active]").count(), 1);
        expect(
            await page.locator("cms-dashboard-workspace[mode='admin'], cms-dashboard-nav[mode='admin']").count(),
        ).toBe(0);
        expect(await page.locator("form[cms-source-trigger='submit']").count()).toBeGreaterThan(0);
        expect(await page.locator("#dashboard-settings-form").count()).toBe(1);
        expect(
            await page.evaluate(
                () =>
                    document.querySelector("#dashboard-settings-form")?.querySelectorAll("p9r-button[type='submit']")
                        .length,
            ),
        ).toBe(0);
        expect(await text(page.locator("[form='dashboard-settings-form']"))).toBe("Save changes");

        const editor = page.locator("cms-dashboard-navigation-editor:not([readonly])");
        expect(
            await editor.evaluate((node) => ({
                value: node.getAttribute("value"),
                views: node.getAttribute("views"),
                nodes: node.shadowRoot?.querySelectorAll("[data-navigation-node]").length,
            })),
        ).toMatchObject({ nodes: 1 });
        expect(await shadowCount(editor, "img")).toBe(0);
        expect(await shadowText(editor, "[data-navigation-tree]")).not.toContain("<img");

        await expectPoll(async () => await text(page.locator("[data-dashboard-member-count]")), "1");
        await page.locator("p9r-open-modal[modal-target='dashboard-members-modal']").click();
        const membersModal = page.locator("#dashboard-members-modal");
        await expectPoll(async () => await membersModal.getAttribute("open"), "");
        expect(await membersModal.locator("[data-dashboard-member-row]").count()).toBe(2);
        expect(await text(membersModal.locator("form[cms-source-method='DELETE'] p9r-button"))).toBe("Remove");

        await lightInput(membersModal.locator("[data-dashboard-member-search]"), "MARKETING@EXAMPLE.COM");
        await expectPoll(async () => await membersModal.locator("[data-dashboard-member-row]").count(), 1);
        expect(await text(membersModal.locator("[data-dashboard-member-row]:not([hidden])"))).toContain(
            "marketing@example.com",
        );
        await lightInput(membersModal.locator("[data-dashboard-member-search]"), "");
        await expectPoll(async () => await membersModal.locator("[data-dashboard-member-row]").count(), 2);

        await membersModal.locator("form[cms-source-method='DELETE'] p9r-button").click();
        await expectPoll(() => Promise.resolve(fixture.assignmentChanges.length), 1);
        expect(fixture.assignmentChanges[0]).toEqual({
            dashboardId: "support",
            subjectId: "operator-1",
            assigned: false,
        });
        await expectPoll(async () => await text(page.locator("[data-dashboard-member-count]")), "0");
        expect(await membersModal.getAttribute("open")).toBe("");
        await membersModal.locator("form[cms-source-method='POST'] p9r-button").first().click();
        await expectPoll(() => Promise.resolve(fixture.assignmentChanges.length), 2);
        expect(fixture.assignmentChanges[1]?.assigned).toBeTrue();
        await expectPoll(async () => await text(page.locator("[data-dashboard-member-count]")), "1");
        await membersModal.locator("[data-dashboard-close-modal]").click();
        expect(await membersModal.getAttribute("open")).toBeNull();

        await shadowClick(editor, "[data-navigation-node] > .dashboard-navigation-row");
        await expectPoll(async () => await shadowAttribute(editor, "[data-navigation-item-dialog]", "open"), "");
        expect(
            await editor.evaluate((node) => {
                const modal = node.shadowRoot?.querySelector("[data-navigation-item-dialog]");
                return modal?.shadowRoot?.querySelector("dialog")?.open;
            }),
        ).toBeTrue();
        expect(await shadowAttribute(editor, "[data-navigation-item-form] [data-navigation-label]", "maxlength")).toBe(
            "16",
        );
        expect(await shadowAttribute(editor, "[data-navigation-item-form] [data-navigation-label]", "max-count")).toBe(
            "16",
        );
        await shadowInput(editor, "[data-navigation-item-form] [data-navigation-label]", "Customer orders");
        expect(
            await editor.evaluate((node) => {
                const control = node.shadowRoot?.querySelector("[data-navigation-item-form] [data-navigation-label]") as
                    | (HTMLElement & { value: unknown })
                    | null;
                return { tag: control?.tagName, value: control?.value };
            }),
        ).toEqual({ tag: "P9R-INPUT", value: "Customer orders" });
        await shadowDispatchClick(editor, "[data-navigation-item-dialog] p9r-button[type='submit']");
        expect(await shadowAttribute(editor, "[data-navigation-item-dialog]", "open")).toBeNull();
        await expectPoll(async () => await shadowText(editor, "[data-navigation-title]"), "Customer orders");

        await shadowClick(editor, "[data-navigation-action='add-root']");
        expect(await shadowCount(editor, "[data-navigation-tree] > [data-navigation-node]")).toBe(2);
        await expectPoll(async () => await shadowAttribute(editor, "[data-navigation-item-dialog]", "open"), "");
        await shadowInput(editor, "[data-navigation-item-form] [data-navigation-label]", "Operations");
        await shadowChangeValue(editor, "[data-navigation-type]", "group");
        await shadowDispatchClick(editor, "[data-navigation-item-dialog] p9r-button[type='submit']");
        expect(await shadowCount(editor, "[data-navigation-tree] > [data-navigation-node]")).toBe(2);
        await shadowDrag(
            editor,
            "[data-navigation-tree] > [data-navigation-node]:first-child [data-navigation-drag-handle]",
            "[data-navigation-tree] > [data-navigation-node]:last-child > .dashboard-navigation-row",
            "inside",
        );
        expect(
            await shadowAttribute(
                editor,
                "[data-navigation-tree] > [data-navigation-node] > [data-navigation-children] > [data-navigation-node]",
                "data-depth",
            ),
        ).toBe("2");
        await shadowClick(
            editor,
            "[data-navigation-tree] > [data-navigation-node] > [data-navigation-children] > [data-navigation-node] [data-navigation-action='add-child']",
        );
        await shadowDispatchClick(editor, "[data-navigation-item-dialog] p9r-button[type='submit']");
        const levelThree =
            "[data-navigation-tree] > [data-navigation-node] > [data-navigation-children] > [data-navigation-node] > [data-navigation-children] > [data-navigation-node]";
        expect(await shadowAttribute(editor, levelThree, "data-depth")).toBe("3");
        await shadowClick(editor, `${levelThree} > .dashboard-navigation-row`);
        expect(await shadowCount(editor, "[data-navigation-type] option[value='group']")).toBe(0);
        await shadowClick(editor, "[data-action='close-navigation-item']");

        const updateCount = countRequests(fixture.requests, "/api/dashboard-management/update");
        const assignmentLoadCount = countRequests(fixture.requests, "/api/dashboard-management/assignments");
        await lightInput(page.locator("#dashboard-settings-form [name='name']"), "Support desk");
        await page.locator("[form='dashboard-settings-form']").click();
        await expectPoll(
            () => Promise.resolve(countRequests(fixture.requests, "/api/dashboard-management/update")),
            updateCount + 1,
        );
        await expectPoll(async () => await shadowText(editor, "[data-navigation-title]"), "Operations");
        await expectPoll(async () => await text(page.locator("[data-dashboard-detail-name]")), "Support desk");
        await expectPoll(async () => await text(nav.locator("[data-dashboard-id='support']")), "Support desk");
        expect(countRequests(fixture.requests, "/api/dashboard-management/assignments")).toBe(assignmentLoadCount);
        expect(await text(page.locator("[data-dashboard-member-count]"))).toBe("1");

        await selectDashboard(page, "commerce");
        await expectPoll(async () => await text(page.locator(".dashboard-detail-title")), "Commerce");
        expect(await page.locator("#dashboard-settings-form").count()).toBe(0);
        expect(await page.locator("cms-dashboard-navigation-editor[readonly]").count()).toBe(1);
        expect(await page.locator("cms-confirm-form").count()).toBe(0);

        await selectDashboard(page, "support");
        await expectPoll(async () => await text(page.locator(".dashboard-detail-title")), "Support desk");
        await nav.locator(".dashboard-new").click();
        const createModal = page.locator("#create-dashboard-modal");
        await expectPoll(async () => await createModal.getAttribute("open"), "");
        expect(await createModal.locator("[name='views']").count()).toBe(0);
        await lightInput(createModal.locator("[name='name']"), "Night operations");
        await expectPoll(async () => await lightValue(createModal.locator("[name='id']")), "night-operations");
        await lightChangeValue(createModal.locator("[name='icon']"), "layout");
        await createModal.locator("p9r-button[type='submit']").click();
        await expectPoll(async () => await text(page.locator(".dashboard-detail-title")), "Night operations");
        expect(new URL(page.url()).searchParams.get("id")).toBe("night-operations");
        expect(fixture.dashboardCreations.at(-1)).toEqual({
            id: "night-operations",
            name: "Night operations",
            icon: "layout",
        });
        expect(
            await shadowCount(
                page.locator("cms-dashboard-navigation-editor:not([readonly])"),
                "[data-navigation-node]",
            ),
        ).toBe(0);

        const deleteCount = countRequests(fixture.requests, "/api/dashboard-management/delete");
        page.once("dialog", (dialog) => void dialog.accept());
        await page.locator("cms-confirm-form p9r-button").click();
        await expectPoll(
            () => Promise.resolve(countRequests(fixture.requests, "/api/dashboard-management/delete")),
            deleteCount + 1,
        );

        const managementRequests = fixture.requests.filter(({ path }) =>
            path.startsWith("/api/dashboard-management"),
        ).length;
        await mount(page, operatorPath, "http://cms.test/dashboards?id=support");
        const operator = page.locator("cms-dashboard-workspace");
        const switcher = page.locator("cms-dashboard-nav[surface='switcher']");
        const primary = page.locator("cms-dashboard-nav[surface='primary']");
        const secondary = page.locator("cms-dashboard-nav[surface='secondary']");
        const profile = page.locator("cms-dashboard-nav[surface='profile']");
        await expectPoll(async () => await shadowValue(switcher, "[data-dashboard-switcher]"), "support");
        expect(await shadowCount(switcher, "[data-dashboard-switcher] option")).toBe(2);
        expect(
            await page.locator("w13c-fixed-admin-layout").evaluate((node) => {
                const root = node.shadowRoot!;
                const adminItem = root.querySelector<HTMLElement>("[data-route='pages']")!;
                const brand = root.querySelector<HTMLElement>("[data-admin-brand]")!;
                const dashboardSwitcher = node.querySelector<HTMLElement>("cms-dashboard-nav[surface='switcher']")!;
                const select = dashboardSwitcher.shadowRoot!.querySelector<HTMLElement>("[data-dashboard-switcher]")!;
                return {
                    adminItemDisplay: getComputedStyle(adminItem).display,
                    selectorGap: Math.round(select.getBoundingClientRect().top - brand.getBoundingClientRect().bottom),
                };
            }),
        ).toEqual({ adminItemDisplay: "none", selectorGap: 10 });
        expect(await shadowText(secondary, "[data-level-heading]")).toBe("");
        expect(
            await secondary.evaluate((node) => {
                const menu = node.shadowRoot!.querySelector("w13c-lateral-menu")!;
                const header = menu.shadowRoot!.querySelector<HTMLElement>(".sidebar-header")!;
                return getComputedStyle(header).display;
            }),
        ).toBe("none");
        await expectPoll(async () => await shadowCount(profile, "[data-operator-profile-link]"), 1);
        expect(await shadowAttribute(profile, "[data-operator-profile-link]", "href")).toBe(
            "/dashboards/profile?id=support&view=operations%2Fsupport%2Forders",
        );
        expect(await shadowCount(primary, "[data-view-path='operations']")).toBe(1);
        expect(await shadowCount(secondary, "[data-view-path='operations/support']")).toBe(1);
        await shadowClick(primary, "[data-view-path='operations']");
        await shadowClick(secondary, "[data-view-path='operations/support']");
        await shadowClick(operator, "[data-view-path='operations/support/orders']");
        expect(new URL(page.url()).searchParams.get("view")).toBe("operations/support/orders");
        expect(await shadowCount(operator, ".tab-row")).toBe(1);

        await shadowChangeValue(switcher, "[data-dashboard-switcher]", "commerce");
        await expectPoll(async () => await shadowText(operator, "[data-name]"), "Commerce");
        expect(new URL(page.url()).searchParams.get("id")).toBe("commerce");
        await expectPoll(async () => await shadowCount(primary, "[data-view-path='orders']"), 1);
        await expectPoll(async () => await secondary.getAttribute("hidden"), "");
        await expectPoll(
            async () =>
                await page.locator("w13c-fixed-admin-layout").evaluate((node) => {
                    const layout = node.shadowRoot!.querySelector("w13c-left-menu-layout")!;
                    return layout.shadowRoot!.querySelector<HTMLElement>(".secondary-sidebar")!.hidden;
                }),
            true,
        );
        await expectPoll(
            async () =>
                await page.locator("w13c-fixed-admin-layout").evaluate((node) => {
                    const layout = node.shadowRoot!.querySelector("w13c-left-menu-layout")!;
                    return layout.shadowRoot!.querySelector<HTMLButtonElement>('[data-mobile-nav="secondary"]')!.hidden;
                }),
            true,
        );
        expect(fixture.requests.filter(({ path }) => path.startsWith("/api/dashboard-management"))).toHaveLength(
            managementRequests,
        );
        expect(fixture.requests.some(({ path }) => path.startsWith("/api/dashboard-session/dashboard"))).toBeTrue();

        await mount(
            page,
            profilePath,
            "http://cms.test/dashboards/profile?id=support&view=operations%2Fsupport%2Forders",
        );
        const profilePage = page.locator("cms-dashboard-workspace[profile]");
        const profilePrimary = page.locator("cms-dashboard-nav[surface='primary']");
        const profileSecondary = page.locator("cms-dashboard-nav[surface='secondary']");
        const profileFooter = page.locator("cms-dashboard-nav[surface='profile']");
        await expectPoll(async () => await text(page.locator("[slot='title']")), "Profile");
        await expectPoll(async () => await text(page.locator(".dashboard-profile-name")), "support@example.com");
        expect(await profilePage.locator("p9r-card").count()).toBe(1);
        expect(await page.locator("[slot='action'] a").getAttribute("href")).toBe(
            "/auth/logout?returnTo=%2Fdashboards",
        );
        expect(await shadowCount(profilePrimary, "[data-view-path='operations']")).toBe(1);
        expect(await shadowCount(profilePrimary, "[data-view-path][active]")).toBe(0);
        expect(await profileSecondary.getAttribute("hidden")).toBe("");
        expect(await shadowAttribute(profileFooter, "[data-operator-profile-link]", "active")).toBe("");
        expect(await shadowAttribute(profilePrimary, "[data-view-path='operations']", "href")).toBe(
            "/dashboards?id=support&view=operations",
        );
        expect(countRequests(fixture.requests, "/api/dashboard-session/profile")).toBeGreaterThanOrEqual(1);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30_000);

async function mount(page: Page, file: string, url: string): Promise<void> {
    await page.goto(url);
    const content = (await readFile(file, "utf8")).replaceAll("{{BASE_PATH}}", "");
    await page.setContent(`<meta name="basePath" content="">`);
    await page.addScriptTag({ path: bundlePath });
    await page.evaluate((html) => {
        document.body.innerHTML = `<cms-binding-core>${html}</cms-binding-core>`;
    }, content);
    await page.waitForTimeout(50);
}

async function selectDashboard(page: Page, id: string): Promise<void> {
    await page.evaluate((dashboardId) => {
        const url = new URL(window.location.href);
        url.searchParams.set("id", dashboardId);
        history.replaceState(null, "", url);
        window.dispatchEvent(new PopStateEvent("popstate"));
    }, id);
}

function countRequests(requests: Array<{ path: string }>, path: string): number {
    return requests.filter((request) => request.path.startsWith(path)).length;
}

async function text(locator: Locator): Promise<string> {
    return (await locator.count()) ? ((await locator.first().textContent())?.trim() ?? "") : "";
}

async function lightValue(locator: Locator): Promise<string> {
    return await locator.evaluate((node) => (node as HTMLElement & { value: string }).value ?? "");
}

async function lightInput(locator: Locator, value: string): Promise<void> {
    await locator.evaluate((node, next) => {
        const control = node as HTMLElement & { value: string };
        control.value = next;
        control.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }, value);
}

async function lightChangeValue(locator: Locator, value: string): Promise<void> {
    await locator.evaluate((node, next) => {
        const control = node as HTMLElement & { value: string };
        control.value = next;
        control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }, value);
}

async function shadowText(host: Locator, selector: string): Promise<string> {
    return await host.evaluate(
        (node, value) => node.shadowRoot?.querySelector(value)?.textContent?.trim() ?? "",
        selector,
    );
}

async function shadowCount(host: Locator, selector: string): Promise<number> {
    return await host.evaluate((node, value) => node.shadowRoot?.querySelectorAll(value).length ?? 0, selector);
}

async function shadowValue(host: Locator, selector: string): Promise<string> {
    return await host.evaluate(
        (node, value) =>
            (node.shadowRoot?.querySelector(value) as (HTMLElement & { value: string }) | null)?.value ?? "",
        selector,
    );
}

async function shadowClick(host: Locator, selector: string): Promise<void> {
    await host.locator(selector).click({ timeout: 5_000 });
}

async function shadowDispatchClick(host: Locator, selector: string): Promise<void> {
    await host.evaluate(
        (node, value) => (node.shadowRoot?.querySelector(value) as HTMLElement | null)?.click(),
        selector,
    );
}

async function shadowInput(host: Locator, selector: string, value: string): Promise<void> {
    await host.evaluate(
        (node, input) => {
            const control = node.shadowRoot?.querySelector(input.selector) as (HTMLElement & { value: string }) | null;
            if (control) {
                control.value = input.value;
                control.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            }
        },
        { selector, value },
    );
}

async function shadowChangeValue(host: Locator, selector: string, value: string): Promise<void> {
    await host.evaluate(
        (node, input) => {
            const control = node.shadowRoot?.querySelector(input.selector) as (HTMLElement & { value: string }) | null;
            if (control) {
                control.value = input.value;
                control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            }
        },
        { selector, value },
    );
}

async function shadowAttribute(host: Locator, selector: string, name: string): Promise<string | null> {
    return await host.evaluate(
        (node, input) => node.shadowRoot?.querySelector(input.selector)?.getAttribute(input.name) ?? null,
        { selector, name },
    );
}

async function shadowDrag(
    host: Locator,
    sourceSelector: string,
    targetSelector: string,
    position: "after" | "before" | "inside" = "after",
): Promise<void> {
    const source = host.locator(sourceSelector);
    const target = host.locator(targetSelector);
    const box = await target.boundingBox();
    if (!box) {
        throw new Error(`Cannot drag to hidden target ${targetSelector}`);
    }
    const x = position === "inside" ? Math.min(box.width - 8, 80) : 12;
    const y = position === "before" ? 2 : position === "inside" ? box.height / 2 : box.height - 2;
    await source.dragTo(target, { targetPosition: { x, y } });
}

async function expectPoll<T>(read: () => Promise<T>, expected: T): Promise<void> {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
        if ((await read()) === expected) {
            return;
        }
        await Bun.sleep(20);
    }
    throw new Error(`Timed out waiting for ${JSON.stringify(expected)}; received ${JSON.stringify(await read())}`);
}
