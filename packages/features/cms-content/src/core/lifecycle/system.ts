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
            notFound: null,
            forbidden: null,
            serverError: null,
            login: null,
        },
        editor: { layoutCategory: "" },
        auth: { signupLegalDocuments: [] },
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

export function mergeSystemUpdate(current: TSystem, update: Partial<TSystem>): TSystem {
    const merged = { ...current };
    for (const [section, value] of Object.entries(update) as [keyof TSystem, unknown][]) {
        if (section === "initializationStep") {
            merged.initializationStep = value as number;
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
