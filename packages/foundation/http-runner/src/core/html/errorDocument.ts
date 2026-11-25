import type { ErrorPageLanguage } from "./language";
import { escapeHtml } from "./index";
import { ERROR_DOCUMENT_STYLE } from "./errorStyle";

export type HttpErrorStatus = 404 | 500 | 503;
const ENGLISH_COPY = {
    404: {
        label: "Page not found",
        title: "Nothing at this address.",
        description: "The page you’re looking for may have moved or no longer exists.",
        action: "Back to home",
        href: "/",
        caption: "A different direction",
    },
    500: {
        label: "Internal server error",
        title: "Something went wrong.",
        description: "We couldn’t display this page. Please try again in a little while.",
        action: "Try again",
        href: "",
        caption: "A brief interruption",
    },
    503: {
        label: "Temporarily unavailable",
        title: "Back in a moment.",
        description: "This site is temporarily unavailable. Please try again in a little while.",
        action: "Try again",
        href: "",
        caption: "We’ll be back shortly",
    },
} as const;

const FRENCH_COPY = {
    404: {
        label: "Page introuvable",
        title: "Cette page s’est égarée.",
        description: "La page que vous recherchez a peut-être été déplacée ou n’existe plus.",
        action: "Retour à l’accueil",
        href: "/",
        caption: "Une autre direction",
    },
    500: {
        label: "Erreur du serveur",
        title: "Un petit contretemps.",
        description: "Cette page n’a pas pu être affichée. Veuillez réessayer dans quelques instants.",
        action: "Réessayer",
        href: "",
        caption: "Une brève interruption",
    },
    503: {
        label: "Temporairement indisponible",
        title: "De retour dans un instant.",
        description: "Ce site est temporairement indisponible. Merci de réessayer dans quelques instants.",
        action: "Réessayer",
        href: "",
        caption: "À très bientôt",
    },
} as const;

/** Fixed, bounded documents: hosts provide branding, never request or exception details. */
export function createHttpErrorPages(
    brand: string,
    language: ErrorPageLanguage = "en",
): Readonly<Record<HttpErrorStatus, string>> {
    if (language !== "en" && language !== "fr") {
        throw new TypeError("Unsupported error document language");
    }
    if (!brand.trim() || brand.length > 80) {
        throw new TypeError("Error document branding must contain 1 to 80 characters");
    }
    const name = escapeHtml(brand);
    const page = (status: HttpErrorStatus) => {
        const copy = (language === "fr" ? FRENCH_COPY : ENGLISH_COPY)[status];
        const home = language === "fr" ? "Accueil" : "Home";
        const powered = language === "fr" ? "Propulsé par" : "Powered by";
        return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${status} · ${copy.label} · ${name}</title><style>${ERROR_DOCUMENT_STYLE}</style></head><body>
<header class="shell header"><a class="brand" href="/" aria-label="${name}, ${home}">${name}</a><span class="label">${copy.label}</span></header>
<main class="shell"><section aria-labelledby="error-title"><p class="eyebrow label">${copy.label}</p><h1 id="error-title">${copy.title}</h1><p class="description">${copy.description}</p><a class="action" href="${copy.href}"><span class="action-text">${copy.action}</span><span class="arrow" aria-hidden="true">→</span></a></section><aside class="code-panel" aria-label="${language === "fr" ? "Erreur" : "Error"} ${status}"><span class="code" aria-hidden="true">${status}</span><span class="panel-caption label">${copy.caption}</span></aside></main>
<footer class="shell"><span>${powered} ${name}</span><a href="/">${home}</a></footer></body></html>`;
    };
    return Object.freeze({ 404: page(404), 500: page(500), 503: page(503) });
}
