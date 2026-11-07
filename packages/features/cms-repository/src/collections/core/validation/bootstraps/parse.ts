import { isValidRegisteredPagePath } from "@bernouy/cms-content/page-path";
import { resourcePublisher } from "cms-repository/exports/contracts/protocol";
import { isCanonicalSemVer } from "cms-repository/exports/contracts/compatibility";
import type {
    CollectionBootstrap,
    CollectionBootstrapPage,
    CollectionBootstrapReference,
} from "../../../interfaces/CollectionRelease";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, identifier, keys, ordinal, record, string, unique } from "../../values";
import { parseCollectionNamespace } from "../../namespace";
import { parseRequirements } from "../../parsing/requirements";

export function parseCollectionBootstraps(
    value: unknown,
    collectionId: string,
    limits: Readonly<CollectionLimits>,
): readonly CollectionBootstrap[] {
    const result = array(value, limits.maxBootstraps, "$.bootstraps").map((entry, index) => {
        const at = `$.bootstraps[${index}]`;
        const source = record(entry, at);
        keys(source, ["id", "label", "description", "requires", "includes", "pages"], at);
        const includes = array(source.includes, limits.maxBootstrapIncludes, `${at}.includes`).map((entry, i) =>
            parseReference(entry, collectionId, `${at}.includes[${i}]`, limits),
        );
        unique(
            includes.map((pin) => `${pin.collectionId}\0${pin.version}\0${pin.bootstrapId}`),
            `${at}.includes`,
        );
        const pages = array(source.pages, limits.maxBootstrapPages, `${at}.pages`).map((entry, i) =>
            parsePage(entry, `${at}.pages[${i}]`),
        );
        unique(
            pages.map(({ id }) => id),
            `${at}.pages`,
        );
        unique(
            pages.map(({ path }) => path),
            `${at}.pages`,
        );
        if (pages.filter(({ systemRole }) => systemRole === "login").length > 1) {
            invalid("must propose at most one login Page", `${at}.pages`);
        }
        return {
            id: identifier(source.id, `${at}.id`),
            label: string(source.label, 160, `${at}.label`),
            description: string(source.description, 160, `${at}.description`),
            requires: parseRequirements(source.requires, `${at}.requires`, limits),
            includes,
            pages,
        };
    });
    unique(
        result.map(({ id }) => id),
        "$.bootstraps",
    );
    if (
        result.reduce((count, recipe) => count + recipe.pages.length, 0) > limits.maxBootstrapPages ||
        result.reduce((count, recipe) => count + recipe.includes.length, 0) > limits.maxBootstrapIncludes
    ) {
        invalid("aggregate bootstrap resources exceed collection limits", "$.bootstraps");
    }
    return result.sort((a, b) => ordinal(a.id, b.id));
}

function parseReference(
    value: unknown,
    owner: string,
    at: string,
    limits: Readonly<CollectionLimits>,
): CollectionBootstrapReference {
    const source = record(value, at);
    keys(source, ["publisherId", "collectionId", "version", "digest", "bootstrapId", "omitPages"], at);
    const collectionId = parseCollectionNamespace(source.collectionId, `${at}.collectionId`);
    const publisherId = string(source.publisherId, 96, `${at}.publisherId`);
    const version = string(source.version, 128, `${at}.version`);
    const digest = string(source.digest, 71, `${at}.digest`);
    if (collectionId === owner || resourcePublisher(collectionId) !== publisherId) {
        invalid("must pin another collection in its owning namespace", at);
    }
    if (!isCanonicalSemVer(version) || !/^sha256:[0-9a-f]{64}$/u.test(digest)) {
        invalid("must use an exact version and SHA-256 digest", at);
    }
    const omitPages =
        source.omitPages === undefined
            ? undefined
            : array(source.omitPages, limits.maxBootstrapPages, `${at}.omitPages`).map((id, i) =>
                  identifier(id, `${at}.omitPages[${i}]`),
              );
    if (omitPages) {
        unique(omitPages, `${at}.omitPages`);
    }
    return {
        publisherId,
        collectionId,
        version,
        digest: digest as `sha256:${string}`,
        bootstrapId: identifier(source.bootstrapId, `${at}.bootstrapId`),
        ...(omitPages === undefined ? {} : { omitPages: omitPages.sort(ordinal) }),
    };
}

function parsePage(value: unknown, at: string): CollectionBootstrapPage {
    const source = record(value, at);
    keys(source, ["id", "exampleId", "path", "title", "description", "indexing", "visible", "systemRole"], at);
    const path = string(source.path, 2048, `${at}.path`);
    if (!isValidRegisteredPagePath(path)) {
        invalid("must propose a valid ordinary Page path outside reserved CMS routes", `${at}.path`);
    }
    for (const field of ["indexing", "visible"] as const) {
        if (typeof source[field] !== "boolean") {
            invalid("must be a boolean", `${at}.${field}`);
        }
    }
    if (source.systemRole !== undefined && source.systemRole !== "login") {
        invalid("unsupported system role", `${at}.systemRole`);
    }
    return {
        id: identifier(source.id, `${at}.id`),
        exampleId: identifier(source.exampleId, `${at}.exampleId`),
        path,
        title: string(source.title, 160, `${at}.title`),
        description: string(source.description, 160, `${at}.description`),
        indexing: source.indexing as boolean,
        visible: source.visible as boolean,
        ...(source.systemRole === undefined ? {} : { systemRole: source.systemRole as "login" }),
    };
}
