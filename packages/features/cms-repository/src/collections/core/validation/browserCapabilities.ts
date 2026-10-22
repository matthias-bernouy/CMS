import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type { CollectionRelease } from "cms-repository/collections/interfaces/CollectionRelease";

export type CollectionBrowserRiskLevel = "none" | "review" | "high";

export type CollectionBrowserRiskReport = Readonly<{
    level: CollectionBrowserRiskLevel;
    javaScriptBlocs: readonly string[];
    frameBlocs: readonly {
        id: string;
        origins: readonly string[];
        sandbox: readonly string[];
    }[];
    externalFrameOrigins: readonly string[];
    scriptsWithSameOrigin: boolean;
}>;

/** Produces the deterministic browser-authority report reviewed at installation. */
export function collectionBrowserRisk(release: CollectionRelease): CollectionBrowserRiskReport {
    const javaScriptBlocs = release.blocs
        .filter((bloc) => bloc.kind === "component" && Boolean(bloc.runtime?.viewJS))
        .map(({ id }) => id)
        .sort();
    const frameBlocs = release.blocs
        .filter((bloc) => bloc.browser !== undefined)
        .map((bloc) => ({
            id: bloc.id,
            origins: [...bloc.browser!.frames.origins].sort(),
            sandbox: [...bloc.browser!.frames.sandbox].sort(),
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
    const externalFrameOrigins = unique(
        frameBlocs.flatMap(({ origins }) => origins.filter((origin) => origin !== "self")),
    );
    const scriptsWithSameOrigin = frameBlocs.some(
        ({ sandbox }) => sandbox.includes("allow-scripts") && sandbox.includes("allow-same-origin"),
    );
    return Object.freeze({
        level: javaScriptBlocs.length > 0 || scriptsWithSameOrigin ? "high" : frameBlocs.length > 0 ? "review" : "none",
        javaScriptBlocs: Object.freeze(javaScriptBlocs),
        frameBlocs: Object.freeze(frameBlocs.map((entry) => Object.freeze(entry))),
        externalFrameOrigins: Object.freeze(externalFrameOrigins),
        scriptsWithSameOrigin,
    });
}

export function collectionBrowserRiskDigest(report: CollectionBrowserRiskReport): `sha256:${string}` {
    return `sha256:${createHash("sha256").update(canonicalizeIJson(report)).digest("hex")}`;
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values)].sort();
}
