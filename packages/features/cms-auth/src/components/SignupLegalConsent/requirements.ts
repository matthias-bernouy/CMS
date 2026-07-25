import { signupLegalRequirementsUrl } from "./configuration";

export type SignupLegalRequirementView = {
    documentKey: string;
    versionId: string;
    label: string;
    consentText: string;
    href: string;
};

const MAX_DOCUMENTS = 16;

export async function fetchSignupLegalRequirements(
    element: HTMLElement,
    signal: AbortSignal,
): Promise<SignupLegalRequirementView[]> {
    const response = await fetch(signupLegalRequirementsUrl(element), {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal,
    });
    if (!response.ok) {
        throw new Error("Unable to load signup legal requirements.");
    }
    return parseSignupLegalRequirements(await response.json(), location.origin);
}

export function parseSignupLegalRequirements(value: unknown, origin: string): SignupLegalRequirementView[] {
    if (!isRecord(value) || !Array.isArray(value.documents) || value.documents.length > MAX_DOCUMENTS) {
        throw new Error("Invalid signup legal requirements.");
    }

    const documentKeys = new Set<string>();
    const versionIds = new Set<string>();
    return value.documents.map((document, index) => {
        if (!isRecord(document) || !isRecord(document.page)) {
            throw new Error(`Invalid signup legal requirement at index ${index}.`);
        }
        const documentKey = requiredString(document.documentKey);
        const versionId = requiredString(document.versionId);
        if (documentKeys.has(documentKey) || versionIds.has(versionId)) {
            throw new Error("Duplicate signup legal requirement.");
        }
        documentKeys.add(documentKey);
        versionIds.add(versionId);

        requiredString(document.contentHash);
        requiredString(document.page.id);
        requiredString(document.page.title);
        return {
            documentKey,
            versionId,
            label: requiredString(document.label),
            consentText: requiredString(document.consentText),
            href: safePageHref(requiredString(document.page.path), origin),
        };
    });
}

function safePageHref(path: string, origin: string): string {
    if (!path.startsWith("/") || path.startsWith("//")) {
        throw new Error("Signup legal page must use a same-origin path.");
    }
    const url = new URL(path, origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
        throw new Error("Signup legal page must use a same-origin path.");
    }
    return `${url.pathname}${url.search}${url.hash}`;
}

function requiredString(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error("Invalid signup legal requirement string.");
    }
    return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
