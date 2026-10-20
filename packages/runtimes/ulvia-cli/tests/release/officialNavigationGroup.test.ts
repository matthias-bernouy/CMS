import { afterEach, expect, test } from "bun:test";
import { mount } from "../../../../official-repository/collections/ulvia-official/blocs/navigation/menu/ulvia-official-navigation-group/bloc";

afterEach(() => {
    document.body.replaceChildren();
});

test("official navigation groups remain synchronized after their label changes", async () => {
    document.body.innerHTML = `
        <div cms-bloc="ulvia-official-navigation-group">
            <button type="button">Pages</button>
            <div part="region"></div>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia-official-navigation-group"]');
    const button = root?.querySelector("button");
    if (!root || !button) {
        throw new Error("Missing navigation group fixture");
    }

    const cleanup = mount(root);
    button.textContent = "Updated pages";
    await Promise.resolve();

    expect(button.getAttribute("aria-label")).toBe("Updated pages");
    cleanup?.();
});
