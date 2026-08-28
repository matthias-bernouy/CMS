import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components/admin/Layout/AdminLayout/AdminLayout";
import {
    authenticationTabFromPath,
    authenticationTabPath,
} from "cms-control/components/admin/Layout/SettingsSections/AuthenticationTabs";
import "cms-control/components/admin/Layout/SettingsSections/SettingsSections";
import "cms-control/components/admin/Layout/ShellDetail/ShellDetail";

afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
});

describe("authentication settings layout", () => {
    test("only exposes the page-level tabs area when content is assigned", async () => {
        document.head.innerHTML = '<meta name="basePath" content="">';
        const layout = document.createElement("w13c-fixed-admin-layout");
        layout.innerHTML = '<span slot="title">Authentication</span>';
        document.body.append(layout);
        await settleSlots();

        const tabArea = layout.shadowRoot!.querySelector<HTMLElement>(".admin-page-tabs")!;
        const header = layout.shadowRoot!.querySelector<HTMLElement>(".admin-page-header")!;
        expect(tabArea.hidden).toBeTrue();
        expect(header.hasAttribute("data-has-tabs")).toBeFalse();

        const tabs = document.createElement("cms-authentication-tabs");
        tabs.slot = "tabs";
        layout.append(tabs);
        await settleSlots();

        expect(tabArea.hidden).toBeFalse();
        expect(header.hasAttribute("data-has-tabs")).toBeTrue();

        tabs.remove();
        await settleSlots();
        expect(tabArea.hidden).toBeTrue();
        expect(header.hasAttribute("data-has-tabs")).toBeFalse();
    });

    test("builds base-path aware tab routes and marks the current route", () => {
        document.head.innerHTML = '<meta name="basePath" content="/cms">';
        window.history.replaceState(null, "", "/cms/admin/settings/authentication/sessions");
        const tabs = document.createElement("cms-authentication-tabs");
        document.body.append(tabs);

        const links = Array.from(tabs.shadowRoot!.querySelectorAll<HTMLAnchorElement>("[data-authentication-tab]"));
        const sessions = links.find((link) => link.dataset.authenticationTab === "sessions")!;
        expect(sessions.getAttribute("href")).toBe("/cms/admin/settings/authentication/sessions");
        expect(sessions.getAttribute("aria-current")).toBe("page");
        expect(links.filter((link) => link.hasAttribute("aria-current"))).toEqual([sessions]);
        expect(authenticationTabPath("sso")).toBe("/cms/admin/settings/authentication/sso");
        expect(authenticationTabFromPath("/cms/admin/settings/authentication/policies")).toBe("policies");
    });

    test("reveals the active tab when the tab row overflows", async () => {
        window.history.replaceState(null, "", "/admin/settings/authentication/recovery");
        const tabs = document.createElement("cms-authentication-tabs");
        const tabRow = tabs.shadowRoot!.querySelector<HTMLElement>(".tabs")!;
        const recovery = tabs.shadowRoot!.querySelector<HTMLAnchorElement>('[data-authentication-tab="recovery"]')!;
        Object.defineProperties(tabRow, {
            clientWidth: { value: 300 },
            scrollLeft: { value: 0, writable: true },
        });
        Object.defineProperties(recovery, {
            offsetLeft: { value: 400 },
            offsetWidth: { value: 80 },
        });

        document.body.append(tabs);
        await nextFrame();

        expect(tabRow.scrollLeft).toBe(180);

        tabRow.scrollLeft = 0;
        window.dispatchEvent(new Event("resize"));
        await nextFrame();
        expect(tabRow.scrollLeft).toBe(180);
    });

    test("keeps Authentication active in the Settings sidebar for nested tabs", () => {
        document.head.innerHTML = '<meta name="basePath" content="/cms">';
        window.history.replaceState(null, "", "/cms/admin/settings/authentication/recovery");
        const navigation = document.createElement("cms-settings-nav");
        document.body.append(navigation);

        const authentication = navigation.shadowRoot!.querySelector<HTMLElement>(
            '[data-settings-section="authentication"]',
        )!;
        expect(authentication.getAttribute("href")).toBe("/cms/admin/settings/authentication/methods");
        expect(authentication.hasAttribute("active")).toBeTrue();
    });

    test("collapses an empty detail header while preserving action-only headers", async () => {
        const detail = document.createElement("cms-shell-detail");
        document.body.append(detail);
        await settleSlots();

        const header = detail.shadowRoot!.querySelector<HTMLElement>(".shell-detail-header")!;
        const identity = detail.shadowRoot!.querySelector<HTMLElement>(".shell-detail-identity")!;
        const actions = detail.shadowRoot!.querySelector<HTMLElement>(".shell-detail-actions")!;
        expect(header.hidden).toBeTrue();

        const action = document.createElement("button");
        action.slot = "actions";
        action.textContent = "Save";
        detail.append(action);
        await settleSlots();

        expect(header.hidden).toBeFalse();
        expect(identity.hidden).toBeTrue();
        expect(actions.hidden).toBeFalse();

        action.remove();
        await settleSlots();
        expect(header.hidden).toBeTrue();
    });
});

async function settleSlots(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

async function nextFrame(): Promise<void> {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
}
