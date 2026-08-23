import type { TSystem } from "cms-content/interfaces/settings";
import { defaultThemeSettings } from "cms-content/core/theme";

export function defaultSystem(): TSystem {
    return {
        initializationStep: 0,
        site: {
            name: "",
            favicon: "",
            visible: true,
            host: "",
            language: "",
            theme: "",
            organization: emptySiteOrganization(),
            notFound: null,
            forbidden: null,
            serverError: null,
            login: null,
        },
        editor: { layoutCategory: "" },
        theme: defaultThemeSettings(),
        security: { connectExtras: [], mediaExtras: [] },
        email: {
            enabled: false,
            fromEmail: "",
            fromName: "",
            replyTo: "",
            transport: "smtp",
            smtp: {
                host: "",
                port: 587,
                secure: false,
                username: "",
                passwordSecretRef: "",
            },
            templates: {
                emailVerification: emptyEmailTemplate(),
                passwordReset: emptyEmailTemplate(),
            },
        },
    };
}

function emptyEmailTemplate() {
    return { subject: "", html: "" };
}

function emptySiteOrganization(): TSystem["site"]["organization"] {
    return {
        name: "",
        legalName: "",
        description: "",
        logo: "",
        email: "",
        telephone: "",
        address: {
            streetAddress: "",
            postalCode: "",
            addressLocality: "",
            addressRegion: "",
            addressCountry: "",
        },
        sameAs: [],
    };
}

export function mergeSystemUpdate(current: TSystem, update: Partial<TSystem>): TSystem {
    const merged = { ...current };
    for (const [section, value] of Object.entries(update) as [keyof TSystem, unknown][]) {
        if (section === "initializationStep") {
            merged.initializationStep = value as number;
        } else if (section === "site" && typeof value === "object" && value !== null) {
            const site = value as Partial<TSystem["site"]>;
            const currentOrganization = current.site.organization ?? emptySiteOrganization();
            const organization = site.organization;
            merged.site = {
                ...current.site,
                ...site,
                organization: organization
                    ? {
                          ...currentOrganization,
                          ...organization,
                          address: {
                              ...currentOrganization.address,
                              ...(organization.address ?? {}),
                          },
                      }
                    : currentOrganization,
            };
        } else if (section === "email" && typeof value === "object" && value !== null) {
            const email = value as Partial<TSystem["email"]>;
            const currentEmail = current.email ?? defaultSystem().email;
            const currentTemplates = currentEmail.templates ?? defaultSystem().email.templates;
            merged.email = {
                ...currentEmail,
                ...email,
                smtp: {
                    ...currentEmail.smtp,
                    ...(email.smtp ?? {}),
                },
                templates: {
                    emailVerification: {
                        ...currentTemplates.emailVerification,
                        ...(email.templates?.emailVerification ?? {}),
                    },
                    passwordReset: {
                        ...currentTemplates.passwordReset,
                        ...(email.templates?.passwordReset ?? {}),
                    },
                },
            };
        } else if (typeof value === "object" && value !== null) {
            (merged as any)[section] = {
                ...(current as any)[section],
                ...value,
            };
        }
    }
    return merged;
}
