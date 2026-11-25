import type { ErrorPageLanguage } from "./language";
import { ERROR_DOCUMENT_STYLE } from "./errorStyle";
export type HttpErrorStatus = 404 | 500 | 503;
const COPY = {
    en: {
        404: {
            title: "Page not found",
            description: "This page does not exist or has moved.",
            action: "Back to home",
            href: "/",
        },
        500: { title: "An error occurred", description: "Please try again shortly.", action: "Try again", href: "" },
        503: { title: "Site unavailable", description: "Please try again shortly.", action: "Try again", href: "" },
    },
    fr: {
        404: {
            title: "Page introuvable",
            description: "Cette page n’existe pas ou a été déplacée.",
            action: "Retour à l’accueil",
            href: "/",
        },
        500: {
            title: "Une erreur est survenue",
            description: "Réessayez dans quelques instants.",
            action: "Réessayer",
            href: "",
        },
        503: {
            title: "Site indisponible",
            description: "Réessayez dans quelques instants.",
            action: "Réessayer",
            href: "",
        },
    },
} as const;
/** Fixed documents contain no branding, request details or exception messages. */
export function createHttpErrorPages(language: ErrorPageLanguage = "en"): Readonly<Record<HttpErrorStatus, string>> {
    if (language !== "en" && language !== "fr") {
        throw new TypeError("Unsupported error document language");
    }
    const home = language === "fr" ? "Accueil" : "Home";
    const error = language === "fr" ? "Erreur" : "Error";
    const page = (status: HttpErrorStatus) => {
        const copy = COPY[language][status];
        return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${status} · ${copy.title}</title><style>${ERROR_DOCUMENT_STYLE}</style></head><body>
<header class="shell header"><a class="home-link" href="/">${home}</a><span class="label">${status}</span></header>
<main class="shell"><section aria-labelledby="error-title"><p class="eyebrow label">${error} ${status}</p><h1 id="error-title">${copy.title}</h1><p class="description">${copy.description}</p><a class="action" href="${copy.href}"><span class="action-text">${copy.action}</span><span class="arrow" aria-hidden="true">→</span></a></section><aside class="code-panel" aria-label="${error} ${status}"><span class="code" aria-hidden="true">${status}</span></aside></main></body></html>`;
    };
    return Object.freeze({ 404: page(404), 500: page(500), 503: page(503) });
}
