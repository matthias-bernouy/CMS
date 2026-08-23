import { canonicalSiteBaseUrl, projectPublicSiteOrganization, type TPage, type TSystem } from "@bernouy/cms-content";
import type { ResolvedPageMetadata } from "cms-delivery/core/seo/pageMetadata";

type JsonObject = { [key: string]: string | string[] | JsonObject };

export function defineOrganizationStructuredData(
    document: Document,
    head: HTMLElement,
    page: TPage,
    settings: TSystem,
    metadata: ResolvedPageMetadata,
): void {
    const data = organizationStructuredData(page, settings, metadata);
    if (!data) {
        return;
    }
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.textContent = safeJson(data);
    head.appendChild(script);
}

export function organizationStructuredData(
    page: TPage,
    settings: TSystem,
    metadata: ResolvedPageMetadata,
): JsonObject | null {
    const host = canonicalSiteBaseUrl(settings.site.host);
    const organization = projectPublicSiteOrganization(settings);
    const name = organization.name.trim();
    if (page.path !== "/" || !host || !name || metadata.robots?.includes("noindex")) {
        return null;
    }

    const homeUrl = `${host}/`;
    const result: JsonObject = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${homeUrl}#organization`,
        name,
        url: homeUrl,
    };
    addText(result, "legalName", organization.legalName);
    addText(result, "description", organization.description);
    addText(result, "logo", absoluteUrl(organization.logo, homeUrl));
    addText(result, "email", organization.email);
    addText(result, "telephone", organization.telephone);
    if (organization.sameAs.length > 0) {
        result.sameAs = organization.sameAs;
    }

    const address: JsonObject = { "@type": "PostalAddress" };
    addText(address, "streetAddress", organization.address.streetAddress);
    addText(address, "postalCode", organization.address.postalCode);
    addText(address, "addressLocality", organization.address.addressLocality);
    addText(address, "addressRegion", organization.address.addressRegion);
    addText(address, "addressCountry", organization.address.addressCountry);
    if (Object.keys(address).length > 1) {
        result.address = address;
    }
    return result;
}

function addText(target: JsonObject, key: string, value: string): void {
    const normalized = value.trim();
    if (normalized) {
        target[key] = normalized;
    }
}

function absoluteUrl(value: string, baseUrl: string): string {
    if (!value.trim()) {
        return "";
    }
    try {
        return new URL(value, baseUrl).href;
    } catch {
        return "";
    }
}

function safeJson(value: JsonObject): string {
    return JSON.stringify(value)
        .replaceAll("<", "\\u003c")
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029");
}
