import { canonicalSiteBaseUrl, projectPublicSiteOrganization, type TSystem } from "@bernouy/cms-content";
import type { ResolvedPageMetadata } from "cms-delivery/core/seo/pageMetadata";

type JsonValue = string | number | boolean | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

export function definePageStructuredData(
    document: Document,
    head: HTMLElement,
    settings: TSystem,
    metadata: ResolvedPageMetadata,
): void {
    const data = pageStructuredData(settings, metadata);
    if (!data) {
        return;
    }
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.textContent = safeJson(data);
    head.appendChild(script);
}

export function pageStructuredData(settings: TSystem, metadata: ResolvedPageMetadata): JsonObject | null {
    const host = canonicalSiteBaseUrl(settings.site.host);
    const canonicalUrl = metadata.canonicalUrl;
    if (!host || !canonicalUrl || metadata.robots?.includes("noindex")) {
        return null;
    }

    const homeUrl = `${host}/`;
    const websiteId = `${homeUrl}#website`;
    const nodes: JsonObject[] = [];
    if (canonicalUrl === homeUrl) {
        const organization = organizationNode(settings, homeUrl);
        if (organization) {
            nodes.push(organization);
        }
        nodes.push(websiteNode(settings, homeUrl, organization !== null));
    }
    nodes.push(webPageNode(metadata, settings, websiteId, canonicalUrl));

    return {
        "@context": "https://schema.org",
        "@graph": nodes,
    };
}

function webPageNode(
    metadata: ResolvedPageMetadata,
    settings: TSystem,
    websiteId: string,
    canonicalUrl: string,
): JsonObject {
    const result: JsonObject = {
        "@type": "WebPage",
        "@id": withFragment(canonicalUrl, "webpage"),
        url: canonicalUrl,
        isPartOf: { "@id": websiteId },
    };
    addText(result, "name", metadata.title);
    addText(result, "description", metadata.description);
    addText(result, "inLanguage", settings.site.language);
    return result;
}

function websiteNode(settings: TSystem, homeUrl: string, hasOrganization: boolean): JsonObject {
    const result: JsonObject = {
        "@type": "WebSite",
        "@id": `${homeUrl}#website`,
        url: homeUrl,
    };
    addText(result, "name", settings.site.name);
    addText(result, "inLanguage", settings.site.language);
    if (hasOrganization) {
        result.publisher = { "@id": `${homeUrl}#organization` };
    }
    return result;
}

function organizationNode(settings: TSystem, homeUrl: string): JsonObject | null {
    const organization = projectPublicSiteOrganization(settings);
    const name = organization.name.trim();
    if (!name) {
        return null;
    }

    const result: JsonObject = {
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

function withFragment(value: string, fragment: string): string {
    const url = new URL(value);
    url.hash = fragment;
    return url.href;
}

function safeJson(value: JsonObject): string {
    return JSON.stringify(value)
        .replaceAll("<", "\\u003c")
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029");
}
