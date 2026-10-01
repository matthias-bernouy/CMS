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
        cmsRuntime: { syncProviderMediaImage(image: HTMLImageElement): void };
    }
}

export {};

const params = new URL(location.href).searchParams;
const candidate = params.get("rollout") === "candidate";
const loading = params.get("loading") === "eager" ? "eager" : "lazy";
const mediaPath = (slot: string) => `/.cms/media/performance/image/${slot}`;
window.__activationOrder = {};
window.__cls = 0;
new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LayoutShift[]) {
        if (!entry.hadRecentInput) {
            window.__cls = (window.__cls ?? 0) + entry.value;
        }
    }
}).observe({ type: "layout-shift", buffered: true });

for (const image of document.querySelectorAll<HTMLImageElement>("img[data-slot]")) {
    const slot = image.dataset.slot!;
    const order: string[] = [];
    window.__activationOrder[slot] = order;
    new MutationObserver((records) => {
        for (const record of records) {
            if (record.attributeName) {
                order.push(record.attributeName);
            }
        }
    }).observe(image, { attributes: true });
    image.setAttribute("loading", loading);
    if (candidate) {
        image.setAttribute("data-cms-src", mediaPath(slot));
        image.setAttribute("data-cms-width", "1600");
        image.setAttribute("data-cms-height", "1200");
        window.cmsRuntime.syncProviderMediaImage(image);
    } else {
        image.setAttribute("src", `/image/${slot}`);
    }
}

const empty = document.querySelector<HTMLImageElement>('img[data-probe="empty"]')!;
empty.setAttribute("data-cms-src", "");
empty.setAttribute("data-cms-width", "1600");
empty.setAttribute("data-cms-height", "1200");
window.cmsRuntime.syncProviderMediaImage(empty);

const unresolved = {
    source: unresolvedProbe("source", { src: "{{ offer.image }}" }),
    width: unresolvedProbe("width", { width: "{{ media.width }}" }),
    height: unresolvedProbe("height", { height: "{{ media.height }}" }),
    sizes: unresolvedProbe("sizes", { sizes: "{{ layout.sizes }}" }),
};

const detached = document.implementation.createHTMLDocument("recycle probe");
const base = detached.createElement("base");
base.href = location.origin;
detached.head.append(base);
const recycled = detached.createElement("img");
recycled.setAttribute("loading", "lazy");
recycled.setAttribute("data-cms-sizes", "(max-width: 640px) 100vw, 30vw");
recycled.setAttribute("data-cms-src", mediaPath("recycle-first"));
recycled.setAttribute("data-cms-width", "1600");
recycled.setAttribute("data-cms-height", "1200");
window.cmsRuntime.syncProviderMediaImage(recycled);
const firstSizes = recycled.getAttribute("sizes");
recycled.setAttribute("data-cms-sizes", "50vw");
recycled.setAttribute("data-cms-src", mediaPath("recycle-second"));
recycled.setAttribute("data-cms-width", "1200");
recycled.setAttribute("data-cms-height", "900");
window.cmsRuntime.syncProviderMediaImage(recycled);
const secondSizes = recycled.getAttribute("sizes");
const secondSrc = recycled.getAttribute("src");
recycled.setAttribute("sizes", "25vw");
recycled.setAttribute("src", "/image/other-owner");
recycled.setAttribute("srcset", "/image/other-owner-640 640w");
recycled.setAttribute("width", "321");
recycled.setAttribute("height", "123");
recycled.removeAttribute("data-cms-src");
window.cmsRuntime.syncProviderMediaImage(recycled);
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

requestAnimationFrame(() =>
    requestAnimationFrame(() => {
        window.__imageFixtureReady = true;
    }),
);

function unresolvedProbe(
    name: "source" | "width" | "height" | "sizes",
    overrides: { src?: string; width?: string; height?: string; sizes?: string },
): { src: string | null; srcset: string | null } {
    const image = document.querySelector<HTMLImageElement>(`img[data-probe="unresolved-${name}"]`)!;
    image.setAttribute("loading", "lazy");
    image.setAttribute("data-cms-src", overrides.src ?? mediaPath(`unresolved-${name}`));
    image.setAttribute("data-cms-width", overrides.width ?? "1600");
    image.setAttribute("data-cms-height", overrides.height ?? "1200");
    if (overrides.sizes) {
        image.setAttribute("data-cms-sizes", overrides.sizes);
    }
    window.cmsRuntime.syncProviderMediaImage(image);
    return { src: image.getAttribute("src"), srcset: image.getAttribute("srcset") };
}

type LayoutShift = PerformanceEntry & { hadRecentInput: boolean; value: number };
