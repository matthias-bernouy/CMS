import { describe, expect, test } from "bun:test";
import type { ThemeSource } from "@bernouy/cms-content";
import { adminSystemSettingsStore } from "cms-control/components/admin/Common/SystemSettings/store";
import { CmsThemeEditor } from "cms-control/components/admin/Theme/ThemeEditor";
import { CmsThemeNav } from "cms-control/components/admin/Theme/ThemeNav";
import {
    THEME_CATEGORY_SELECTED_EVENT,
    THEME_SETTINGS_REFRESHED_EVENT,
    type ThemeSelection,
} from "cms-control/components/admin/Theme/events";

describe("theme navigation interaction", () => {
    test("selects the first integration group from its parent and an exact group from its child", () => {
        const nav = new CmsThemeNav() as unknown as ThemeNavHarness;
        nav.sources = sources();
        nav.selection = { sourceId: "colors", categoryId: "brand" };
        nav.render();
        const initialUrl = window.location.href;
        const selections: ThemeSelection[] = [];
        const onSelection = (event: Event) => {
            selections.push((event as CustomEvent<ThemeSelection>).detail);
        };
        window.addEventListener(THEME_CATEGORY_SELECTED_EVENT, onSelection);
        nav.shadowRoot.addEventListener("click", nav.onClick);

        try {
            click(nav, "[data-source='integration-photo-albums']");
            expect(selections.at(-1)).toEqual({
                sourceId: "integration-photo-albums",
                categoryId: "gallery",
            });

            click(nav, "[data-source='integration-photo-albums'][data-category='viewer']");
            expect(selections.at(-1)).toEqual({
                sourceId: "integration-photo-albums",
                categoryId: "viewer",
            });
            expect(
                nav.shadowRoot.querySelector(
                    "[data-source='integration-photo-albums'][data-category='viewer'][active]",
                ),
            ).not.toBeNull();
            expect(
                nav.shadowRoot.querySelector("[data-source='integration-photo-albums']:not([data-category])[active]"),
            ).toBeNull();
        } finally {
            nav.shadowRoot.removeEventListener("click", nav.onClick);
            window.removeEventListener(THEME_CATEGORY_SELECTED_EVENT, onSelection);
            window.history.replaceState(null, "", initialUrl);
        }
    });

    test("shares one settings request between navigation instances", async () => {
        const originalFetch = globalThis.fetch;
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return settingsResponse("Portfolio");
        }) as unknown as typeof fetch;
        adminSystemSettingsStore.invalidate();
        const first = new CmsThemeNav() as unknown as ThemeNavHarness;
        const second = new CmsThemeNav() as unknown as ThemeNavHarness;

        try {
            await Promise.all([first.load(), second.load()]);

            expect(calls).toBe(1);
            expect(first.shadowRoot.querySelector("[data-source='colors']")).not.toBeNull();
            expect(second.shadowRoot.querySelector("[data-source='integration-photo-albums']")).not.toBeNull();
        } finally {
            adminSystemSettingsStore.invalidate();
            globalThis.fetch = originalFetch;
        }
    });

    test("keeps editor and navigation on the URL selection after an authoritative refresh", async () => {
        const originalFetch = globalThis.fetch;
        const initialUrl = window.location.href;
        globalThis.fetch = (async () => settingsResponse("Portfolio")) as unknown as typeof fetch;
        adminSystemSettingsStore.invalidate();
        const editor = new CmsThemeEditor() as unknown as ThemeEditorHarness;
        const nav = new CmsThemeNav() as unknown as ThemeNavHarness;
        await Promise.all([editor.load(), nav.load()]);
        window.addEventListener(THEME_SETTINGS_REFRESHED_EVENT, nav.onSettingsRefreshed);
        let release: ((response: Response) => void) | undefined;
        let calls = 0;
        globalThis.fetch = (() => {
            calls += 1;
            return new Promise<Response>((resolve) => {
                release = resolve;
            });
        }) as unknown as typeof fetch;

        try {
            const refreshing = editor.refreshAfterSave();
            const url = new URL(window.location.href);
            url.searchParams.set("type", "integration-photo-albums");
            url.searchParams.set("category", "viewer");
            window.history.replaceState(null, "", url);
            release?.(settingsResponse("Portfolio"));
            await refreshing;
            await Promise.resolve();

            expect(calls).toBe(1);
            expect(editor.shadowRoot.querySelector("[data-category-section]")?.getAttribute("heading")).toBe("Viewer");
            expect(
                nav.shadowRoot.querySelector(
                    "[data-source='integration-photo-albums'][data-category='viewer'][active]",
                ),
            ).not.toBeNull();
        } finally {
            window.removeEventListener(THEME_SETTINGS_REFRESHED_EVENT, nav.onSettingsRefreshed);
            window.history.replaceState(null, "", initialUrl);
            adminSystemSettingsStore.invalidate();
            globalThis.fetch = originalFetch;
        }
    });
});

type ThemeNavHarness = {
    shadowRoot: ShadowRoot;
    sources: ThemeSource[];
    selection: ThemeSelection;
    load: () => Promise<void>;
    render: () => void;
    onClick: (event: Event) => void;
    onSettingsRefreshed: () => void;
};

type ThemeEditorHarness = {
    shadowRoot: ShadowRoot;
    load: () => Promise<void>;
    refreshAfterSave: () => Promise<void>;
};

function click(nav: ThemeNavHarness, selector: string): void {
    nav.shadowRoot.querySelector<HTMLElement>(selector)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function sources(): ThemeSource[] {
    return [
        {
            id: "colors",
            label: "Colors",
            supportsModes: true,
            categories: [category("brand", "Brand")],
        },
        {
            id: "integration-photo-albums",
            label: "Photo Albums",
            supportsModes: true,
            owner: { kind: "integration", integrationId: "photo-albums" },
            categories: [category("gallery", "Gallery"), category("viewer", "Viewer")],
        },
    ];
}

function category(id: string, label: string): ThemeSource["categories"][number] {
    return { id, label, description: `${label} tokens.`, tokens: [] };
}

function settingsResponse(siteName: string): Response {
    return Response.json({
        site: { name: siteName },
        theme: {
            activeThemeId: "default",
            sources: sources(),
            themes: [{ id: "default", name: "Default", values: { light: {}, dark: {} } }],
        },
    });
}
