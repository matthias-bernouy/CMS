declare global {
    interface Window {
        __imageFixtureReady?: boolean;
        __activationOrder?: Record<string, string[]>;
        __cls?: number;
        __domProbes?: {
            empty: { src: string | null; srcset: string | null };
            unresolved: Record<"source" | "width" | "height" | "sizes", { src: string | null; srcset: string | null }>;
            recycled: {
                firstSizes: string | null;
                secondSizes: string | null;
                secondSrc: string | null;
                clearedSizes: string | null;
                clearedSrc: string | null;
                clearedSrcset: string | null;
                clearedWidth: string | null;
                clearedHeight: string | null;
            };
        };
        p9r: {
            clearResponsiveSourceImageElement(image: HTMLImageElement): void;
            syncResponsiveSourceImageElement(image: HTMLImageElement): boolean;
        };
    }
}

export {};

const loading = new URL(location.href).searchParams.get("loading") === "eager" ? "eager" : "lazy";
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
    image.setAttribute("loading", loading);
    image.setAttribute("data-src", `/image/original.png?slot=${slot}`);
    image.setAttribute("data-source-width", "1600");
    image.setAttribute("data-source-height", "1200");
    window.p9r.syncResponsiveSourceImageElement(image);
}

const empty = document.querySelector<HTMLImageElement>('img[data-probe="empty"]')!;
empty.setAttribute("data-src", "");
empty.setAttribute("data-source-width", "1600");
empty.setAttribute("data-source-height", "1200");
window.p9r.syncResponsiveSourceImageElement(empty);

const unresolved = {
    source: unresolvedProbe("source", {
        src: "/image/original.png?slot=unresolved-source&id={{offer.id}}",
    }),
    width: unresolvedProbe("width", { width: "{{media.width}}" }),
    height: unresolvedProbe("height", { height: "{{media.height}}" }),
    sizes: unresolvedProbe("sizes", { sizes: "{{layout.sizes}}" }),
};

const detachedDocument = document.implementation.createHTMLDocument("recycle probe");
const recycled = detachedDocument.createElement("img");
const firstAuthoredSizes = "(max-width: 640px) 100vw, 30vw";
const secondAuthoredSizes = "50vw";
recycled.setAttribute("loading", "lazy");
recycled.setAttribute("data-source-image-access", "public");
recycled.setAttribute("sizes", firstAuthoredSizes);
recycled.setAttribute("data-src", "/image/original.png?slot=recycle-first");
recycled.setAttribute("data-source-width", "1600");
recycled.setAttribute("data-source-height", "1200");
window.p9r.syncResponsiveSourceImageElement(recycled);
const firstSizes = recycled.getAttribute("sizes");
recycled.setAttribute("sizes", secondAuthoredSizes);
recycled.setAttribute("data-src", "/image/original.png?slot=recycle-second");
recycled.setAttribute("data-source-width", "1200");
recycled.setAttribute("data-source-height", "900");
window.p9r.syncResponsiveSourceImageElement(recycled);
const secondSizes = recycled.getAttribute("sizes");
const secondSrc = recycled.getAttribute("src");
recycled.setAttribute("sizes", "25vw");
recycled.setAttribute("src", "/image/other-owner.png?slot=recycle-owned-src");
recycled.setAttribute("srcset", "/image/other-owner-640.png?slot=recycle-owned-srcset 640w");
recycled.setAttribute("width", "321");
recycled.setAttribute("height", "123");
window.p9r.clearResponsiveSourceImageElement(recycled);
window.__domProbes = {
    empty: { src: empty.getAttribute("src"), srcset: empty.getAttribute("srcset") },
    unresolved,
    recycled: {
        firstSizes,
        secondSizes,
        secondSrc,
        clearedSizes: recycled.getAttribute("sizes"),
        clearedSrc: recycled.getAttribute("src"),
        clearedSrcset: recycled.getAttribute("srcset"),
        clearedWidth: recycled.getAttribute("width"),
        clearedHeight: recycled.getAttribute("height"),
    },
};

requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        window.__imageFixtureReady = true;
    });
});

function unresolvedProbe(
    name: "source" | "width" | "height" | "sizes",
    overrides: { src?: string; width?: string; height?: string; sizes?: string },
): { src: string | null; srcset: string | null } {
    const image = document.querySelector<HTMLImageElement>(`img[data-probe="unresolved-${name}"]`)!;
    image.setAttribute("loading", "lazy");
    image.setAttribute("data-src", overrides.src ?? `/image/original.png?slot=unresolved-${name}`);
    image.setAttribute("data-source-width", overrides.width ?? "1600");
    image.setAttribute("data-source-height", overrides.height ?? "1200");
    if (overrides.sizes) {
        image.setAttribute("sizes", overrides.sizes);
    }
    window.p9r.syncResponsiveSourceImageElement(image);
    return { src: image.getAttribute("src"), srcset: image.getAttribute("srcset") };
}

type LayoutShift = PerformanceEntry & {
    hadRecentInput: boolean;
    value: number;
};
