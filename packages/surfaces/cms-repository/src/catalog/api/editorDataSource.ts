import type { DataField, DataFieldType } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "@bernouy/cms-editor-system-v2";

const facetFields = [field("value"), field("label")];
const providerFields = [field("value"), field("name"), field("label")];
const technicalProviderFields = [field("name"), field("label")];
const artifactFields = [field("type"), field("label"), field("count", "number")];

const versionItemFields = [
    field("version"),
    field("isStable", "boolean"),
    field("isLatest", "boolean"),
    field("compatibilityOutcome"),
    field("compatibilityLabel"),
    field("compatibilityWarning", "boolean"),
    field("packageDigest"),
    field("packageBytes", "number"),
    field("packageSize"),
    field("detailsUrl"),
    field("downloadUrl"),
    field("releaseStatus"),
    field("installable", "boolean"),
    field("freshInstallOnly", "boolean"),
    field("verificationOrigin"),
    field("verificationOutcome"),
];

const integrationFields = [
    field("kind"),
    field("label"),
    field("description"),
    field("category"),
    field("stable"),
    field("latest"),
    field("detailsUrl"),
    field("compatibilityOutcome"),
    field("compatibilityLabel"),
    field("compatibilityWarning", "boolean"),
    array("technicalProviders", technicalProviderFields),
    array("artifacts", artifactFields),
    array("versions", versionItemFields),
];

const compatibilityFields = [
    field("currentReportId"),
    field("warning", "boolean"),
    object("current", [
        field("reportId"),
        field("outcome"),
        field("releaseLevel"),
        field("requiredReleaseLevel"),
        field("contractAdmissible", "boolean"),
        array("findings", [field("code"), field("message"), field("classification"), field("surface")]),
    ]),
];

const releaseFields = [
    field("status"),
    field("installable", "boolean"),
    field("freshInstallOnly", "boolean"),
    object("verification", [
        field("origin"),
        field("outcome"),
        object("runner", [field("name"), field("version"), field("imageDigest")]),
        array("results", [
            field("suiteId"),
            field("outcome"),
            field("durationMs", "number"),
            field("attempts", "number"),
            field("cacheHit", "boolean"),
        ]),
    ]),
    array("migrations", [
        object("source", [field("kind"), field("version"), field("packageDigest")]),
        field("supportedSourceRange"),
        field("outcome"),
        array("checks", [field("name"), field("outcome"), field("evidenceDigest")]),
    ]),
];

const versionDetailFields = [
    ...versionItemFields,
    field("integrationUrl"),
    field("releaseNotesDownloadUrl"),
    array("providers", providerFields),
    array("artifacts", artifactFields),
    array("dependencies", [
        field("name"),
        field("kind"),
        field("versionRange"),
        field("optional", "boolean"),
        field("integrationUrl"),
    ]),
    array("instructions", [field("title"), field("html")]),
    field("releaseNotesHtml"),
    object("compatibility", compatibilityFields),
    object("release", releaseFields),
];

export const REPOSITORY_CATALOG_EDITOR_DATA_SOURCE: EditorDataSource = {
    label: "Integration repository catalog",
    description: "Browse public integration metadata, versions, packages, and release evidence.",
    provider: "repository",
    providerLabel: "Integration repository",
    method: "GET",
    url: "/.cms/repository/api/integrations/catalog",
    params: [
        queryParam("q", "Search labels, kinds, and descriptions."),
        queryParam("category", "Filter integrations by category."),
        queryParam("provider", "Filter integrations by technical provider."),
        queryParam("compatibility", "Filter integrations by compatibility outcome."),
        queryParam("kind", "Select one integration kind."),
        queryParam("version", "Select one exact version; requires kind."),
    ],
    fields: [
        field("schema"),
        field("view"),
        field("revision"),
        field("q"),
        field("provider"),
        field("count", "number"),
        field("total", "number"),
        array("categories", facetFields),
        array("compatibilityOutcomes", facetFields),
        array("integrations", integrationFields),
        ...integrationFields,
        object("featuredVersion", versionDetailFields),
        ...versionDetailFields.filter(({ path }) => !integrationFields.some((field) => field.path === path)),
    ],
};

function queryParam(name: string, description: string): NonNullable<EditorDataSource["params"]>[number] {
    return { name, description, in: "query", type: "string" };
}

function field(path: string, type: DataFieldType = "string"): DataField {
    return { path, type };
}

function array(path: string, children: DataField[]): DataField {
    return { path, type: "array", children };
}

function object(path: string, children: DataField[]): DataField {
    return { path, type: "object", children };
}
