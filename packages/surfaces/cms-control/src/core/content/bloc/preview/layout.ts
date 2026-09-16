export type PreviewLayout = "compact" | "section" | "page";

export type PreviewLayoutMetrics = {
    viewportWidth: number;
    viewportHeight: number;
    paintedWidth: number;
    contentHeight: number;
    scrollHeight: number;
};

export function classifyPreviewLayout(metrics: PreviewLayoutMetrics): PreviewLayout {
    if (metrics.scrollHeight > metrics.viewportHeight + 2 || metrics.contentHeight > 520) {
        return "page";
    }
    if (metrics.paintedWidth >= metrics.viewportWidth * 0.72 || metrics.contentHeight >= 220) {
        return "section";
    }
    return "compact";
}

export function previewLayoutHeight(layout: PreviewLayout, contentHeight: number): number {
    const withMinimum = (value: number, minimum: number): number => Math.round(Math.max(minimum, value));
    if (layout === "compact") {
        return withMinimum(contentHeight + 128, 220);
    }
    if (layout === "section") {
        return withMinimum(contentHeight + 64, 280);
    }
    return withMinimum(contentHeight, 360);
}

export function previewCompactScale(paintedWidth: number, paintedHeight: number): number {
    if (paintedWidth <= 0 || paintedHeight <= 0) {
        return 1;
    }
    return Math.max(1, Math.min(2.5, 180 / paintedWidth, 110 / paintedHeight));
}

export function previewLayoutScript(): string {
    return `(${previewLayoutRuntime.toString()})(${classifyPreviewLayout.toString()}, ${previewLayoutHeight.toString()}, ${previewCompactScale.toString()})`;
}

function previewLayoutRuntime(
    classify: (metrics: PreviewLayoutMetrics) => PreviewLayout,
    layoutHeight: (layout: PreviewLayout, contentHeight: number) => number,
    compactScale: (paintedWidth: number, paintedHeight: number) => number,
): void {
    const paintsBox = (element: Element, style: CSSStyleDeclaration): boolean => {
        const replaced = ["button", "canvas", "img", "input", "select", "svg", "textarea", "video"].includes(
            element.localName,
        );
        const bordered = [
            style.borderTopStyle,
            style.borderRightStyle,
            style.borderBottomStyle,
            style.borderLeftStyle,
        ].some((value) => value !== "none" && value !== "hidden");
        return (
            replaced ||
            bordered ||
            style.backgroundImage !== "none" ||
            !["rgba(0, 0, 0, 0)", "transparent"].includes(style.backgroundColor) ||
            style.boxShadow !== "none"
        );
    };
    const paintedBounds = (root: Element): DOMRect | undefined => {
        let bounds: { left: number; top: number; right: number; bottom: number } | undefined;
        const include = (rect: DOMRect): void => {
            if (!rect.width || !rect.height) {
                return;
            }
            bounds = bounds
                ? {
                      left: Math.min(bounds.left, rect.left),
                      top: Math.min(bounds.top, rect.top),
                      right: Math.max(bounds.right, rect.right),
                      bottom: Math.max(bounds.bottom, rect.bottom),
                  }
                : { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        };
        const visit = (element: Element): void => {
            const style = getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
                return;
            }
            if (paintsBox(element, style)) {
                include(element.getBoundingClientRect());
            }
            for (const node of Array.from(element.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    include(range.getBoundingClientRect());
                } else if (node instanceof Element) {
                    visit(node);
                }
            }
            for (const child of Array.from(element.shadowRoot?.children ?? [])) {
                visit(child);
            }
        };
        visit(root);
        return bounds
            ? new DOMRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top)
            : undefined;
    };
    const wrapper = document.querySelector<HTMLElement>("[data-cms-bloc-preview]");
    if (!wrapper) {
        return;
    }
    let scheduled = 0;
    let previous = "";
    const schedule = (): void => {
        cancelAnimationFrame(scheduled);
        scheduled = requestAnimationFrame(measure);
    };
    const measure = (): void => {
        const previousScale = Number(wrapper.dataset.cmsPreviewScale) || 1;
        const root = wrapper.firstElementChild ?? wrapper;
        const rootBounds = root.getBoundingClientRect();
        const painted = paintedBounds(root) ?? rootBounds;
        const metrics = {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            paintedWidth: painted.width / previousScale,
            contentHeight: Math.max(rootBounds.height / previousScale, wrapper.scrollHeight),
            scrollHeight: document.documentElement.scrollHeight,
        };
        const layout = classify(metrics);
        document.documentElement.dataset.cmsPreviewLayout = layout;
        const scale = layout === "compact" ? compactScale(metrics.paintedWidth, painted.height / previousScale) : 1;
        wrapper.dataset.cmsPreviewScale = String(scale);
        wrapper.style.setProperty("--cms-preview-scale", String(scale));
        const height = layoutHeight(layout, metrics.contentHeight);
        const signature = `${layout}:${height}`;
        if (signature !== previous) {
            previous = signature;
            parent.postMessage({ type: "cms:bloc-preview-layout", layout, height }, "*");
        }
    };
    new ResizeObserver(schedule).observe(wrapper);
    document.fonts?.ready.then(schedule);
    addEventListener("load", schedule, { once: true });
    schedule();
}
