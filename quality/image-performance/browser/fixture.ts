import { applyResponsiveSourceImageAttributes } from "@bernouy/cms-source-images/browser";

declare global {
    interface Window {
        __imageFixtureReady?: boolean;
        __activationOrder?: Record<string, string[]>;
        __cls?: number;
    }
}

const mode = new URL(location.href).searchParams.get("mode") === "fallback" ? "fallback" : "auto";
window.__activationOrder = {};
window.__cls = 0;
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LayoutShift[]) {
        if (!entry.hadRecentInput) {
            window.__cls = (window.__cls ?? 0) + entry.value;
        }
    }
});
observer.observe({ type: "layout-shift", buffered: true });

for (const image of document.querySelectorAll<HTMLImageElement>("img[data-slot]")) {
    const slot = image.dataset.slot!;
    const order: string[] = [];
    window.__activationOrder[slot] = order;
    const mutations = new MutationObserver((records) => {
        for (const record of records) {
            if (record.attributeName) {
                order.push(record.attributeName);
            }
        }
    });
    mutations.observe(image, { attributes: true });
    image.setAttribute("loading", mode === "auto" ? "lazy" : "eager");
    applyResponsiveSourceImageAttributes(image, {
        baseUrl: `/image/original.png?slot=${slot}`,
        sourceWidth: 1_600,
        sourceHeight: 1_200,
        loading: mode === "auto" ? "lazy" : "eager",
    });
}

requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        window.__imageFixtureReady = true;
    });
});

type LayoutShift = PerformanceEntry & {
    hadRecentInput: boolean;
    value: number;
};
