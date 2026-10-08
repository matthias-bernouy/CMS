import type { TPageRef } from "cms-content/pages/interfaces/pages";
import type { ThemeSettings } from "cms-content/theme/interfaces/theme";

type TEmailTemplate = {
    subject: string;
    html: string;
};

export type SiteOrganizationAddress = {
    streetAddress: string;
    postalCode: string;
    addressLocality: string;
    addressRegion: string;
    addressCountry: string;
};

export type SiteOrganizationSettings = {
    name: string;
    legalName: string;
    description: string;
    logo: string;
    email: string;
    telephone: string;
    address: SiteOrganizationAddress;
    /** Public profiles that identify the same organization. */
    sameAs: string[];
};

export type TSystem = {
    initializationStep: number;

    /** Read-only signal while page routes are being migrated to new language settings. */
    pageRoutesUpdating?: boolean;

    site: {
        name: string;
        favicon: string;
        visible: boolean;
        /**
         * Canonical base URL of the public site (e.g. `https://example.com`).
         * Owns all public SEO URLs: canonical links, sitemap documents, and
         * the sitemap declaration in robots.txt. Empty string disables them.
         */
        host: string;
        /**
         * Default site language as a BCP-47 tag (e.g. `en`, `fr`, `fr-FR`).
         * Emitted as `<html lang="...">` on every rendered page. Empty string
         * means "do not set a lang attribute".
         */
        language: string;
        /** Other languages enabled for authoring. Absent on older site records. */
        additionalLanguages?: string[];
        /** Active additional languages. Others remain drafts; the default is always active. */
        activeLanguages?: string[];
        /** Organization that owns or publishes this site. */
        organization: SiteOrganizationSettings;
        /** Page rendered when a dynamic route matches but the page is missing. */
        notFound: TPageRef;
        /** Page rendered when an authenticated visitor cannot access a page dependency. */
        forbidden: TPageRef;
        /** Page rendered when `renderPage` throws. */
        serverError: TPageRef;
        /** Public page used to authenticate anonymous visitors before returning to their destination. */
        login: TPageRef;
    };

    /** Structured design tokens emitted as CSS custom properties. */
    theme: ThemeSettings;

    /**
     * Page-level Content-Security-Policy whitelist extras. Origins listed
     * here are merged with the auto-derived data-provider origins in the
     * meta CSP emitted by `delivery/core/html/renderPage`.
     *
     * Use these for resources blocs need to reach that aren't modeled as
     * data providers — external measurement tools, error trackers, font CDNs,
     * embed hosts, etc. Each entry is an origin (`scheme://host[:port]`),
     * normalised on save. The DTO parser accepts a newline-separated
     * textarea payload from the admin form.
     */
    security: {
        /** Extra origins for `connect-src` (fetch / xhr / websocket). */
        connectExtras: string[];
        /** Extra origins for `media-src` (`<video>` / `<audio>`). */
        mediaExtras: string[];
    };

    /**
     * Runtime outbound email configuration. The password is deliberately a
     * secret reference, never a raw value stored in the system settings.
     */
    email: {
        enabled: boolean;
        fromEmail: string;
        fromName: string;
        replyTo: string;
        transport: "smtp";
        smtp: {
            host: string;
            port: number;
            secure: boolean;
            username: string;
            passwordSecretRef: string;
        };
        templates: {
            emailVerification: TEmailTemplate;
            passwordReset: TEmailTemplate;
        };
    };
};

export type RenderingSiteSettings = Pick<
    TSystem["site"],
    | "name"
    | "favicon"
    | "visible"
    | "host"
    | "language"
    | "activeLanguages"
    | "organization"
    | "notFound"
    | "forbidden"
    | "serverError"
    | "login"
>;

/** Settings deliberately projected for public rendering and public helpers. */
export type RenderingSettings = {
    site: RenderingSiteSettings;
    theme: ThemeSettings;
    security: TSystem["security"];
};
