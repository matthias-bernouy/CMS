import type { TPageRef } from "cms-content/interfaces/pages";
import type { ThemeSettings } from "cms-content/interfaces/theme";

export type TEmailTemplate = {
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
        /** Raw CSS served at `/style` and linked by every rendered public page. */
        theme: string;
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

    editor: {
        /**
         * Name of the template category used as "layouts". When set, opening
         * the editor for a brand-new page auto-opens the BlocLibrary locked
         * on the Templates tab, filtered to this category.
         */
        layoutCategory: string;
    };

    /** Structured design tokens. `site.theme` remains the free-form CSS layer. */
    theme: ThemeSettings;

    /**
     * Page-level Content-Security-Policy whitelist extras. Origins listed
     * here are merged with the auto-derived data-provider origins in the
     * meta CSP emitted by `delivery/core/html/renderPage`.
     *
     * Use these for resources blocs need to reach that aren't modeled as
     * data providers — third-party analytics, error trackers, font CDNs,
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

    // Roles are NOT stored here — they live in their own `RolesRepository`
    // (@bernouy/cms-permissions), a dedicated collection independent of the
    // content aggregate.
};

export function wrapBindingCore(content: string): string {
    return `<cms-binding-core>${content}</cms-binding-core>`;
}
