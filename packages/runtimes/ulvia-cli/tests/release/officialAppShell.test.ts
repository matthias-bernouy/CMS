import { afterEach, expect, test } from "bun:test";
import { mount as mountAppShell } from "../../../../official-repository/collections/ulvia-official/blocs/layout/shells/ulvia-official-app-shell/bloc";
import { mount as mountPageShell } from "../../../../official-repository/collections/ulvia-official/blocs/layout/shells/ulvia-official-page-shell/bloc";

afterEach(() => {
    document.body.replaceChildren();
});

test("official app shell lets native navigation activate before closing its mobile panel", async () => {
    document.body.innerHTML = `
        <div cms-bloc="ulvia-official-app-shell" layout="dual-sidebar">
            <div part="shell">
                <button type="button" data-mobile-toggle="navigation">Navigation</button>
                <button type="button" data-mobile-toggle="contextual">Context</button>
                <button type="button" data-mobile-toggle-close>Close</button>
                <nav part="secondary-navigation"><a href="#navigation-target">Navigation target</a></nav>
                <nav part="secondary-sidebar"><a href="#contextual-target">Contextual target</a></nav>
                <main part="content" tabindex="-1"></main>
                <footer part="footer"></footer>
            </div>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-app-shell"]');
    const toggle = root?.querySelector<HTMLButtonElement>('[data-mobile-toggle="contextual"]');
    const link = root?.querySelector<HTMLAnchorElement>('[part="secondary-sidebar"] a');
    if (!root || !toggle || !link) {
        throw new Error("Missing app shell fixture");
    }

    const cleanup = mountAppShell(root);
    toggle.click();
    expect(root.getAttribute("mobile-panel")).toBe("contextual");

    link.click();
    expect(root.getAttribute("mobile-panel")).toBe("contextual");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.hasAttribute("mobile-panel")).toBe(false);
    expect(document.activeElement).toBe(root.querySelector('[part="content"]'));

    cleanup?.();
});

test("official Page shell reveals optional regions populated after query hydration", async () => {
    document.body.innerHTML = `
        <article cms-bloc="ulvia-official-page-shell">
            <div part="actions"></div>
            <div part="description"></div>
        </article>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-page-shell"]');
    const actions = root?.querySelector<HTMLElement>('[part="actions"]');
    if (!root || !actions) {
        throw new Error("Missing Page shell fixture");
    }

    const cleanup = mountPageShell(root);
    expect(actions.hidden).toBe(true);

    const link = document.createElement("a");
    link.href = "/admin/pages/edit";
    link.textContent = "Edit content";
    actions.append(link);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actions.hidden).toBe(false);
    cleanup?.();
});
