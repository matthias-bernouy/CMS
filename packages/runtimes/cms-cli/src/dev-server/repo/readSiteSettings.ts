import { coercePageRef, type TSystem } from "@bernouy/cms-content";

export function readSiteSettings(raw: any, base: TSystem["site"], theme: string): TSystem["site"] {
    return {
        name: stringValue(raw?.name, base.name),
        favicon: stringValue(raw?.favicon, base.favicon),
        visible: typeof raw?.visible === "boolean" ? raw.visible : base.visible,
        host: stringValue(raw?.host, base.host),
        language: stringValue(raw?.language, base.language),
        theme,
        organization: readOrganization(raw?.organization, base.organization),
        notFound: coercePageRef(raw?.notFound),
        forbidden: coercePageRef(raw?.forbidden),
        serverError: coercePageRef(raw?.serverError),
        login: coercePageRef(raw?.login),
    };
}

function readOrganization(raw: any, base: TSystem["site"]["organization"]): TSystem["site"]["organization"] {
    return {
        name: stringValue(raw?.name, base.name),
        legalName: stringValue(raw?.legalName, base.legalName),
        description: stringValue(raw?.description, base.description),
        logo: stringValue(raw?.logo, base.logo),
        email: stringValue(raw?.email, base.email),
        telephone: stringValue(raw?.telephone, base.telephone),
        address: {
            streetAddress: stringValue(raw?.address?.streetAddress, base.address.streetAddress),
            postalCode: stringValue(raw?.address?.postalCode, base.address.postalCode),
            addressLocality: stringValue(raw?.address?.addressLocality, base.address.addressLocality),
            addressRegion: stringValue(raw?.address?.addressRegion, base.address.addressRegion),
            addressCountry: stringValue(raw?.address?.addressCountry, base.address.addressCountry),
        },
        sameAs: Array.isArray(raw?.sameAs)
            ? raw.sameAs.filter((value: unknown) => typeof value === "string")
            : base.sameAs,
    };
}

function stringValue(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
}
