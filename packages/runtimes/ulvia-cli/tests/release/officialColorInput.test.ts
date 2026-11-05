import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { mount } from "../../../../official-repository/collections/mossa/blocs/forms/fields/ulvia--mossa--color-input/bloc";
import { mount as mountPresets } from "../../../../official-repository/collections/mossa/blocs/forms/fields/advanced/ulvia--mossa--color-presets/bloc";

afterEach(() => {
    document.body.replaceChildren();
    mock.restore();
});

test.each([
    ["ulvia--mossa--color-input", mount],
    ["ulvia--mossa--color-presets", mountPresets],
] as const)("%s paints color data only into preview canvases", (tag, mountControl) => {
    const painted: string[] = [];
    const context = {
        fillStyle: "",
        fillRect() {
            painted.push(this.fillStyle);
        },
    };
    spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    document.body.innerHTML = `<div cms-bloc="${tag}"><span part="trigger-shell"></span>
        <input type="color" value="#086c55"><span part="popover" hidden></span></div>`;
    const root = document.body.firstElementChild as HTMLElement;
    const cleanup = mountControl(root);
    const input = root.querySelector("input")!;
    input.value = "#ff0033";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(painted).toContain("#ff0033");
    expect(root.querySelectorAll("canvas").length).toBeGreaterThan(0);
    expect(root.querySelector("[style]")).toBeNull();
    expect(root.hasAttribute("style")).toBe(false);
    cleanup?.();
});

test("official color input closes on Escape and restores focus", async () => {
    document.body.innerHTML = `
        <div cms-bloc="ulvia--mossa--color-input">
            <span part="trigger-shell"></span>
            <input type="color" aria-label="Brand colour" value="#086c55">
            <span part="popover" hidden></span>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[cms-bloc="ulvia--mossa--color-input"]');
    if (!root) {
        throw new Error("Missing color input fixture");
    }

    const cleanup = mount(root);
    const trigger = root.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]');
    const popover = root.querySelector<HTMLElement>('[part="popover"]');
    trigger?.click();
    await Promise.resolve();
    expect(popover?.hasAttribute("hidden")).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(popover?.hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(trigger);

    cleanup?.();
});
