import type { TPage } from "cms-content/interfaces/pages";
import { ContentValidationError } from "cms-content/core/validation/errors";
import { validateLabel, validateOptionalText } from "cms-content/core/validation/fields";

export function validatePageSeo(value: unknown): NonNullable<TPage["seo"]> {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 32) {
        throw new ContentValidationError("seo", "expected up to 32 language entries");
    }
    const seo: NonNullable<TPage["seo"]> = {};
    for (const [rawLanguage, candidate] of Object.entries(value)) {
        let language: string;
        try {
            language = Intl.getCanonicalLocales(rawLanguage)[0]!;
            if (!language) {
                throw new Error("Missing language tag");
            }
        } catch {
            throw new ContentValidationError("seo", `invalid language tag ${rawLanguage}`);
        }
        if (Object.hasOwn(seo, language)) {
            throw new ContentValidationError("seo", `duplicate language ${language}`);
        }
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            throw new ContentValidationError(`seo.${language}`, "expected title and description fields");
        }
        const fields = candidate as Record<string, unknown>;
        if (Object.keys(fields).some((field) => field !== "title" && field !== "description")) {
            throw new ContentValidationError(`seo.${language}`, "unknown field");
        }
        if (fields.title !== undefined && typeof fields.title !== "string") {
            throw new ContentValidationError(`seo.${language}.title`, "string expected");
        }
        if (fields.description !== undefined && typeof fields.description !== "string") {
            throw new ContentValidationError(`seo.${language}.description`, "string expected");
        }
        const title = (fields.title as string | undefined)?.trim();
        const description = (fields.description as string | undefined)?.trim();
        if (title || description) {
            seo[language] = {
                ...(title ? { title: validateLabel(`seo.${language}.title`, title, 70) } : {}),
                ...(description
                    ? { description: validateOptionalText(`seo.${language}.description`, description, 200) }
                    : {}),
            };
        }
    }
    return seo;
}
