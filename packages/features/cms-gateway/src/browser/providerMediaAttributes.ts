import { PROVIDER_IMAGE_WIDTHS } from "../media/providerImageWidths";

export type ProviderImageAttributes = Readonly<{
    src: string;
    srcset?: string;
    sizes: string;
    width: number;
    height: number;
}>;

export function buildProviderImageAttributes(input: {
    url: string;
    width: number;
    height: number;
    sizes?: string;
    loading?: "lazy" | "eager";
    baseURI?: string;
}): ProviderImageAttributes | null {
    if (!validDimension(input.width) || !validDimension(input.height) || input.sizes?.includes("{{")) {
        return null;
    }
    const route = providerMediaRoute(input.url, input.baseURI ?? globalThis.document?.baseURI);
    if (!route) {
        return null;
    }
    const candidates = PROVIDER_IMAGE_WIDTHS.filter((width) => width <= input.width);
    return {
        src: input.url,
        ...(candidates.length
            ? { srcset: candidates.map((width) => `${route.imagePrefix}/${width}.webp ${width}w`).join(", ") }
            : {}),
        sizes: input.sizes?.trim() || (input.loading === "lazy" ? "auto, 100vw" : "100vw"),
        width: input.width,
        height: input.height,
    };
}

function providerMediaRoute(urlValue: string, baseURI = "https://cms.invalid/"): { imagePrefix: string } | null {
    if (!urlValue.trim() || urlValue.includes("{{")) {
        return null;
    }
    try {
        const base = new URL(baseURI);
        const url = new URL(urlValue, base);
        const match = /^(.*)\/\.cms\/media\/([^/]+)\/([^/]+)\/([^/]+)$/u.exec(url.pathname);
        if (url.origin !== base.origin || !match || url.search || url.hash) {
            return null;
        }
        return { imagePrefix: `${match[1]}/.cms/image/${match[2]}/${match[3]}/${match[4]}` };
    } catch {
        return null;
    }
}

export function isProviderMediaUrl(urlValue: string, baseURI?: string): boolean {
    return providerMediaRoute(urlValue, baseURI) !== null;
}

export function validDimension(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
}
