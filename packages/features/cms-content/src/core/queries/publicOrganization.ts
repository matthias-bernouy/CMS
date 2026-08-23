import type { SiteOrganizationSettings, TSystem } from "cms-content/interfaces/settings";

/** Explicit public projection. New system settings never become public by accident. */
export function projectPublicSiteOrganization(settings: TSystem): SiteOrganizationSettings {
    const organization = settings.site.organization;
    const address = organization?.address;
    return {
        name: organization?.name ?? "",
        legalName: organization?.legalName ?? "",
        description: organization?.description ?? "",
        logo: organization?.logo ?? "",
        email: organization?.email ?? "",
        telephone: organization?.telephone ?? "",
        address: {
            streetAddress: address?.streetAddress ?? "",
            postalCode: address?.postalCode ?? "",
            addressLocality: address?.addressLocality ?? "",
            addressRegion: address?.addressRegion ?? "",
            addressCountry: address?.addressCountry ?? "",
        },
        sameAs: Array.isArray(organization?.sameAs) ? [...organization.sameAs] : [],
    };
}
