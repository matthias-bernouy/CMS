import { describe, expect, test } from "bun:test";
import type { ThemeSource } from "@bernouy/cms-content";
import { CmsThemeNav } from "cms-control/components/admin/Theme/ThemeNav";
import { THEME_CATEGORY_SELECTED_EVENT, type ThemeSelection } from "cms-control/components/admin/Theme/events";
import { themePageStore } from "cms-control/components/admin/Theme/store";

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
            return Response.json({
                site: { name: "Portfolio" },
                theme: {
                    activeThemeId: "default",
                    sources: sources(),
                    themes: [{ id: "default", name: "Default", values: { light: {}, dark: {} } }],
                },
            });
        }) as typeof fetch;
        themePageStore.invalidate();
        const first = new CmsThemeNav() as unknown as ThemeNavHarness;
        const second = new CmsThemeNav() as unknown as ThemeNavHarness;

        try {
            await Promise.all([first.load(), second.load()]);

            expect(calls).toBe(1);
            expect(first.shadowRoot.querySelector("[data-source='colors']")).not.toBeNull();
            expect(second.shadowRoot.querySelector("[data-source='integration-photo-albums']")).not.toBeNull();
        } finally {
            themePageStore.invalidate();
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
