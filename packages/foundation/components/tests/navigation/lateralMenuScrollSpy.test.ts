import { afterEach, expect, test } from "bun:test";

import { LateralMenu } from "../../src/ui/Navigation/Menu/LateralMenu/LateralMenu";
import { LateralMenuItem } from "../../src/ui/Navigation/Menu/LateralMenu/LateralMenuItem/LateralMenuItem";
import { LATERAL_MENU_SCROLLSPY_CHANGE_EVENT } from "../../src/ui/Navigation/Menu/LateralMenu/ScrollSpy/ScrollSpy";

if (!customElements.get("w13c-lateral-menu")) {
    customElements.define("w13c-lateral-menu", LateralMenu);
}
if (!customElements.get("w13c-lateral-menu-item")) {
    customElements.define("w13c-lateral-menu-item", LateralMenuItem);
}

const nativeObserver = globalThis.IntersectionObserver;

afterEach(() => {
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
    Object.defineProperty(globalThis, "IntersectionObserver", {
        configurable: true,
        writable: true,
        value: nativeObserver,
    });
    FakeIntersectionObserver.instances = [];
});

test("a scrollspy lateral menu follows visible same-document sections", async () => {
    Object.defineProperty(globalThis, "IntersectionObserver", {
        configurable: true,
        writable: true,
        value: FakeIntersectionObserver,
    });
    history.replaceState(null, "", "/theme");

    const brandSection = section("theme-brand", 8, 200);
    const feedbackSection = section("theme-feedback", 220, 420);
    const menu = document.createElement("w13c-lateral-menu");
    menu.setAttribute("scrollspy", "");
    menu.setAttribute("compact-label", "Theme groups");
    const brand = item("#theme-brand", "Brand");
    const feedback = item("#theme-feedback", "Feedback");
    menu.append(brand, feedback);
    document.body.append(menu, brandSection, feedbackSection);

    const changes: string[] = [];
    menu.addEventListener(LATERAL_MENU_SCROLLSPY_CHANGE_EVENT, (event) => {
        changes.push((event as CustomEvent<{ hash: string }>).detail.hash);
    });
    await nextFrame();

    expect(brand.hasAttribute("active")).toBe(true);
    expect(feedback.hasAttribute("active")).toBe(false);
    expect(location.hash).toBe("");
    expect(toggleLabel(menu)).toBe("Brand");
    expect(toggle(menu).getAttribute("aria-label")).toBe("Theme groups: Brand");
    expect(FakeIntersectionObserver.instances[0]?.options.rootMargin).toBe("-16px 0px 0px 0px");

    FakeIntersectionObserver.instances[0]!.emit([
        [brandSection, false],
        [feedbackSection, true],
    ]);

    expect(brand.hasAttribute("active")).toBe(false);
    expect(feedback.hasAttribute("active")).toBe(true);
    expect(feedback.getAttribute("aria-current")).toBe("location");
    expect(location.hash).toBe("#theme-feedback");
    expect(toggleLabel(menu)).toBe("Feedback");
    expect(changes.at(-1)).toBe("#theme-feedback");

    menu.setAttribute("scrollspy-offset", "48");
    await nextFrame();
    expect(FakeIntersectionObserver.instances.at(-1)?.options.rootMargin).toBe("-48px 0px 0px 0px");

    menu.remove();
    expect(feedback.hasAttribute("manual-active")).toBe(false);
    expect(feedback.hasAttribute("match")).toBe(false);
});

test("a scrollspy restores an initial fragment after its targets connect", async () => {
    Object.defineProperty(globalThis, "IntersectionObserver", {
        configurable: true,
        writable: true,
        value: FakeIntersectionObserver,
    });
    history.replaceState(null, "", "/theme#theme-feedback");
    const brandSection = section("theme-brand", 8, 200);
    const feedbackSection = section("theme-feedback", 220, 420);
    let scrolled = false;
    feedbackSection.scrollIntoView = () => {
        scrolled = true;
    };
    const menu = document.createElement("w13c-lateral-menu");
    menu.setAttribute("scrollspy", "");
    const brand = item("#theme-brand", "Brand");
    const feedback = item("#theme-feedback", "Feedback");
    menu.append(brand, feedback);
    document.body.append(menu, brandSection, feedbackSection);

    await nextFrame();

    expect(brand.hasAttribute("active")).toBe(false);
    expect(feedback.hasAttribute("active")).toBe(true);
    expect(toggleLabel(menu)).toBe("Feedback");
    expect(scrolled).toBe(true);
});

function item(href: string, label: string): HTMLElement {
    const element = document.createElement("w13c-lateral-menu-item");
    element.setAttribute("href", href);
    element.textContent = label;
    return element;
}

function section(id: string, top: number, bottom: number): HTMLElement {
    const element = document.createElement("section");
    element.id = id;
    element.getBoundingClientRect = () =>
        ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top }) as DOMRect;
    return element;
}

function toggle(menu: HTMLElement): HTMLButtonElement {
    return menu.shadowRoot!.querySelector(".embedded-toggle")!;
}

function toggleLabel(menu: HTMLElement): string {
    return toggle(menu).querySelector("span")!.textContent!;
}

function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

class FakeIntersectionObserver {
    static instances: FakeIntersectionObserver[] = [];
    readonly observed: Element[] = [];

    constructor(
        private readonly callback: IntersectionObserverCallback,
        readonly options: IntersectionObserverInit = {},
    ) {
        FakeIntersectionObserver.instances.push(this);
    }

    observe(target: Element): void {
        this.observed.push(target);
    }

    disconnect(): void {
        this.observed.length = 0;
    }

    emit(entries: Array<[Element, boolean]>): void {
        this.callback(
            entries.map(([target, isIntersecting]) => ({ target, isIntersecting }) as IntersectionObserverEntry),
            this as unknown as IntersectionObserver,
        );
    }
}
