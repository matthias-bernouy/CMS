import type { TPage } from "content/pages/interfaces/pages";
import { ContentValidationError } from "content/application/core/validation/errors";
import { validateLabel, validateOptionalText } from "content/application/core/validation/fields";

export function validatePageSeo(value: unknown): NonNullable<TPage["seo"]> {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 32) {
        throw new ContentValidationError("seo", "expected up to 32 language entries", {
            code: "seo.shape",
            parameters: { max: 32 },
        });
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
            throw new ContentValidationError("seo", `invalid language tag ${rawLanguage}`, {
                code: "language.invalid",
                parameters: { language: rawLanguage },
            });
        }
        if (Object.hasOwn(seo, language)) {
            throw new ContentValidationError("seo", `duplicate language ${language}`, {
                code: "language.duplicate",
                parameters: { language },
            });
        }
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            throw new ContentValidationError(`seo.${language}`, "expected title and description fields", {
                code: "seo.entry",
                parameters: { language },
            });
        }
        const fields = candidate as Record<string, unknown>;
        if (Object.keys(fields).some((field) => field !== "title" && field !== "description")) {
            throw new ContentValidationError(`seo.${language}`, "unknown field", {
                code: "seo.entry",
                parameters: { language },
            });
        }
        if (fields.title !== undefined && typeof fields.title !== "string") {
            throw new ContentValidationError(`seo.${language}.title`, "string expected", {
                code: "field.text",
                parameters: { field: `seo.${language}.title` },
            });
        }
        if (fields.description !== undefined && typeof fields.description !== "string") {
            throw new ContentValidationError(`seo.${language}.description`, "string expected", {
                code: "field.text",
                parameters: { field: `seo.${language}.description` },
            });
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
