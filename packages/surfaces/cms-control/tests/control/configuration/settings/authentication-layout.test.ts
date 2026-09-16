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

        const links = Array.from(tabs.shadowRoot!.querySelectorAll<HTMLElement>("[data-authentication-tab]"));
        const sessions = links.find((link) => link.dataset.authenticationTab === "sessions")!;
        expect(sessions.getAttribute("href")).toBe("/cms/admin/settings/authentication/sessions");
        expect(sessions.hasAttribute("active")).toBeTrue();
        expect(links.filter((link) => link.hasAttribute("active"))).toEqual([sessions]);
        expect(authenticationTabPath("sso")).toBe("/cms/admin/settings/authentication/sso");
        expect(authenticationTabFromPath("/cms/admin/settings/authentication/policies")).toBe("policies");
    });

    test("uses the shared navigation tabs", () => {
        const tabs = document.createElement("cms-authentication-tabs");
        const navigation = tabs.shadowRoot!.querySelector("p9r-nav-tabs")!;

        expect(navigation.getAttribute("aria-label")).toBe("Authentication settings");
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
