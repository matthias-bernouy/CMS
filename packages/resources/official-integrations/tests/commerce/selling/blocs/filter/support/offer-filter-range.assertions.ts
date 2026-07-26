import { expect } from "bun:test";

export async function exerciseNumericRange(range: Element, settleLifecycle: () => Promise<void>): Promise<void> {
    const minimumSlider = range.querySelector('[data-range-slider="minimum"]') as HTMLInputElement;
    const maximumSlider = range.querySelector('[data-range-slider="maximum"]') as HTMLInputElement;
    const minimumControl = range.querySelector('[data-range-control="minimum"]') as HTMLInputElement;
    const maximumControl = range.querySelector('[data-range-control="maximum"]') as HTMLInputElement;
    const minimumProxy = range.querySelector('[data-range-proxy="minimum"]') as HTMLInputElement;
    const maximumProxy = range.querySelector('[data-range-proxy="maximum"]') as HTMLInputElement;

    expect([minimumSlider.min, minimumSlider.max, minimumSlider.step]).toEqual(["2020", "2024", "1"]);
    expect([minimumControl.placeholder, maximumControl.placeholder]).toEqual(["2020", "2024"]);
    expect([minimumControl.name, maximumControl.name]).toEqual(["", ""]);

    minimumSlider.value = "2022";
    minimumSlider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(minimumControl.value).toBe("2022");
    expect(minimumProxy.value).toBe("2022");
    expect(range.querySelector("[data-range-output]")?.textContent).toBe("2022 – 2024");

    maximumControl.value = "2023";
    maximumControl.dispatchEvent(new Event("input", { bubbles: true }));
    expect(maximumSlider.value).toBe("2023");
    expect(maximumProxy.value).toBe("2023");

    minimumControl.value = "2022.5";
    minimumControl.dispatchEvent(new Event("input", { bubbles: true }));
    expect(minimumControl.getAttribute("aria-invalid")).toBe("true");
    expect(minimumProxy.value).toBe("2022");
    minimumControl.dispatchEvent(new Event("change", { bubbles: true }));
    expect(minimumControl.value).toBe("2023");
    expect(minimumSlider.value).toBe("2023");
    expect(minimumProxy.value).toBe("2023");

    minimumControl.value = "9999";
    minimumControl.dispatchEvent(new Event("input", { bubbles: true }));
    expect(minimumControl.getAttribute("aria-invalid")).toBe("true");
    expect(minimumProxy.value).toBe("2023");
    minimumControl.dispatchEvent(new Event("change", { bubbles: true }));
    expect(minimumControl.value).toBe("2023");
    expect(minimumProxy.value).toBe("2023");
    expect(range.querySelector("[data-range-output]")?.textContent).toBe("2023");

    minimumSlider.dispatchEvent(new Event("focus"));
    minimumProxy.value = "9999";
    maximumProxy.value = "2021";
    minimumProxy.dispatchEvent(new Event("change", { bubbles: true }));
    maximumProxy.dispatchEvent(new Event("change", { bubbles: true }));
    await settleLifecycle();
    expect([minimumProxy.value, maximumProxy.value]).toEqual(["2021", "2021"]);
    expect([minimumControl.value, maximumControl.value]).toEqual(["2021", "2021"]);
    expect([minimumSlider.max, maximumSlider.min]).toEqual(["2021", "2021"]);
    expect(range.querySelector("[data-range-output]")?.textContent).toBe("2021");
    expect(Number(maximumSlider.style.zIndex)).toBeGreaterThan(Number(minimumSlider.style.zIndex));

    maximumSlider.dispatchEvent(new Event("focus"));
    minimumProxy.value = "2024";
    maximumProxy.value = "2024";
    minimumProxy.dispatchEvent(new Event("change", { bubbles: true }));
    maximumProxy.dispatchEvent(new Event("change", { bubbles: true }));
    await settleLifecycle();
    expect([minimumSlider.max, maximumSlider.min]).toEqual(["2024", "2024"]);
    expect(Number(minimumSlider.style.zIndex)).toBeGreaterThan(Number(maximumSlider.style.zIndex));

    maximumSlider.dispatchEvent(new Event("focus"));
    expect(Number(maximumSlider.style.zIndex)).toBeGreaterThan(Number(minimumSlider.style.zIndex));
}
