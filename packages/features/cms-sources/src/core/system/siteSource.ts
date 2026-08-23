import type { DataShape } from "cms-sources/interfaces/DataShape";
import type { Source } from "cms-sources/interfaces/Source";
import { makeEndpointUrn, makeSourceUrn } from "./urn";

export const SYSTEM_SITE_SOURCE_ID = "system-site";
export const SYSTEM_SITE_SOURCE_URN = makeSourceUrn(SYSTEM_SITE_SOURCE_ID);
export const SYSTEM_SITE_ORGANIZATION_ENDPOINT_URN = makeEndpointUrn(SYSTEM_SITE_SOURCE_ID, "organization");

const stringShape = (title: string): DataShape => ({ type: "string", title });

const addressShape: DataShape = {
    type: "object",
    title: "Address",
    properties: {
        streetAddress: stringShape("Street address"),
        postalCode: stringShape("Postal code"),
        addressLocality: stringShape("City"),
        addressRegion: stringShape("Region"),
        addressCountry: stringShape("Country code"),
    },
    required: ["streetAddress", "postalCode", "addressLocality", "addressRegion", "addressCountry"],
};

const organizationShape: DataShape = {
    type: "object",
    properties: {
        name: stringShape("Name"),
        legalName: stringShape("Legal name"),
        description: stringShape("Description"),
        logo: stringShape("Logo"),
        email: stringShape("Email"),
        telephone: stringShape("Telephone"),
        address: addressShape,
        sameAs: {
            type: "array",
            title: "Public profiles",
            items: { type: "string" },
        },
    },
    required: ["name", "legalName", "description", "logo", "email", "telephone", "address", "sameAs"],
};

export const SYSTEM_SITE_SOURCE: Source = {
    urn: SYSTEM_SITE_SOURCE_URN,
    meta: {
        name: "Site",
        description: "Built-in public information about this site.",
    },
    endpoints: [
        {
            urn: SYSTEM_SITE_ORGANIZATION_ENDPOINT_URN,
            method: "GET",
            access: { mode: "public" },
            targetUrl: "cms-system://site/organization",
            meta: {
                name: "Organization",
                description: "Public information about the organization behind this site.",
            },
            output: [{ status: "200", body: organizationShape }],
        },
    ],
};
