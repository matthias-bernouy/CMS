import { z } from "zod";
import type { TBloc, TBlocWrite, ThemeSettings } from "@bernouy/content";
import { validateBlocWrite, validateThemeSettings } from "@bernouy/content";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ResourceDocument } from "resources/interfaces/archive";
import { archiveSchema } from "./schemas";
import { validateResourceTextSource } from "resources/artifacts/validation/texts";
import { validateResourceReferences } from "resources/artifacts/validation/references";
import { validateResourceStyles } from "resources/artifacts/styles/artifacts";
import { ResourceArchiveError } from "./errors";

const blocHeader = z.looseObject({
    id: z.string(),
    kind: z.enum(["component", "composition"]),
    name: z.string(),
    group: z.string(),
    description: z.string(),
    viewJS: z.string(),
    markupHTML: z.string(),
    ownership: z.strictObject({ kind: z.literal("code-managed") }),
    root: z.unknown(),
    uses: z.array(z.string()).max(512).optional(),
});

/** Boundary casts feed the existing domain validators; no unvalidated cast escapes. */
export function resourceDocument(input: unknown): ResourceDocument {
    const raw = archiveSchema.parse(input);
    const blocs: TBloc[] = raw.blocs.map((value) => {
        const header = blocHeader.parse(value);
        const validated = validateBlocWrite(header as TBlocWrite);
        // Domain artifacts may carry absent optional values; the archive is strict JSON.
        const bloc = JSON.parse(JSON.stringify(validated)) as TBloc;
        // Parsing checks syntax only and never calls generated code.
        new Function(bloc.viewJS);
        if (canonicalizeIJson(header) !== canonicalizeIJson(bloc)) {
            throw new ResourceArchiveError("Bloc artifacts must already be normalized");
        }
        return bloc;
    });
    const theme = raw.theme === null ? null : validateThemeSettings(raw.theme as ThemeSettings);
    unique(
        blocs.map(({ id }) => id),
        "Bloc",
    );
    unique(
        raw.assets.map(({ namespace, id }) => `${namespace}:${id}`),
        "asset",
    );
    unique(
        raw.assets.map(({ entry }) => entry),
        "asset entry",
    );
    unique(
        raw.texts.map(({ namespace }) => namespace),
        "text namespace",
    );
    unique(
        raw.pages.map(({ path }) => path),
        "Page route",
    );
    if (raw.pages.filter((page) => page.systemRole === "login").length > 1) {
        throw new ResourceArchiveError("Only one Page can own the login role");
    }
    for (const asset of raw.assets) {
        if (asset.profiles?.includes("inline-svg") && asset.mediaType !== "image/svg+xml") {
            throw new ResourceArchiveError("Inline SVG assets require image/svg+xml");
        }
    }
    for (const source of raw.texts) {
        validateResourceTextSource(source);
    }
    const document = { ...raw, blocs, theme };
    validateResourceStyles(document);
    validateResourceReferences(document);
    return document;
}

function unique(values: readonly string[], kind: string): void {
    if (new Set(values).size !== values.length) {
        throw new ResourceArchiveError(`Duplicate ${kind} identity`);
    }
}
