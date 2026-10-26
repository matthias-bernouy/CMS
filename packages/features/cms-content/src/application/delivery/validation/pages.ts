import { validatePageIndexingConfiguration } from "cms-content/pages/core/validation/indexing";
import { array, fields, integer, literal, nullable, optional, record, text, variant } from "./values";

const contribution = { sourceId: text, contributionId: text, pageId: text };
export const pageReference = variant("kind", {
    site: fields({ kind: literal("site"), pageId: text }),
    contribution: fields({ kind: literal("contribution"), ...contribution }),
});
const provenance = { ...contribution, version: text, digest: text };
export const page = fields({
    id: text,
    revision: integer,
    path: text,
    paths: optional(record(text)),
    content: text,
    title: text,
    description: text,
    visible: (value) => {
        if (typeof value !== "boolean") {
            throw new TypeError("Invalid Page visibility");
        }
    },
    tags: array(text),
    origin: optional(fields(provenance)),
    seo: optional(record(fields({ title: optional(text), description: optional(text) }))),
    indexing: optional((value) => {
        validatePageIndexingConfiguration(value);
    }),
});
const requirement = fields({ contractId: text, capabilityId: text, versionRange: text });
const source = variant("kind", {
    site: fields({ kind: literal("site"), pageId: text, revision: integer }),
    contribution: fields({ kind: literal("contribution"), ...provenance, defaultPath: text }),
});
export const renderablePage = fields({
    reference: pageReference,
    page,
    language: optional(text),
    source,
    requirements: array(requirement),
});
const otherRoutes = {
    redirect: fields({ kind: literal("redirect"), path: text }),
    gone: fields({ kind: literal("gone"), language: text }),
    updating: fields({ kind: literal("updating") }),
    unavailable: fields({ kind: literal("unavailable") }),
};
export const publishedRoute = nullable(
    variant("kind", {
        ...otherRoutes,
        current: fields({ kind: literal("current"), page, language: text }),
    }),
);
export const renderableRoute = nullable(
    variant("kind", {
        ...otherRoutes,
        current: fields({ kind: literal("current"), page: renderablePage, language: text }),
    }),
);
