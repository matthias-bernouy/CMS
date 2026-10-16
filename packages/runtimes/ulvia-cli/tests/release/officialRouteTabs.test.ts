import { afterEach, expect, test } from "bun:test";
import { mount } from "../../../../official-repository/collections/ulvia-official/blocs/navigation/tabs/ulvia-official-route-tabs/bloc";

afterEach(() => {
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

test("official route tabs control only declared tabpanels inside their workspace Bloc", async () => {
    document.body.innerHTML = `
        <div cms-bloc="test-workspace">
            <div cms-bloc="ulvia-official-route-tabs">
                <a cms-bloc="ulvia-official-route-tab" href="#inside"><span>Inside</span></a>
                <a cms-bloc="ulvia-official-route-tab" href="#outside"><span>Outside</span></a>
                <a cms-bloc="ulvia-official-route-tab" href="#not-a-panel"><span>Not a panel</span></a>
            </div>
            <section id="inside" role="tabpanel"></section>
            <section id="not-a-panel"></section>
        </div>
        <section id="outside" role="tabpanel"></section>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-route-tabs"]');
    if (!root) {
        throw new Error("Missing route tabs fixture");
    }

    const cleanup = mount(root);
    await Promise.resolve();

    const links = root.querySelectorAll<HTMLAnchorElement>("a");
    expect(document.querySelector<HTMLElement>("#inside")?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>("#outside")?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>("#not-a-panel")?.hidden).toBe(false);
    expect(links[0]?.closest('[cms-bloc="ulvia-official-route-tab"]')?.hasAttribute("hidden")).toBe(false);
    expect(links[1]?.closest('[cms-bloc="ulvia-official-route-tab"]')?.hasAttribute("hidden")).toBe(true);
    expect(links[2]?.closest('[cms-bloc="ulvia-official-route-tab"]')?.hasAttribute("hidden")).toBe(true);

    cleanup?.();
});
