import { readSystemSnapshot, validateCapabilityRequirements } from "@bernouy/content";
import { assertResourceRequirements } from "./lifecycle/requirements";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { resourceDigest } from "resources/storage/records";
import type { ResourceInitializationOptions, ResourcePreparedInitialization } from "./interfaces";
import type { ResourceBrowserRisk } from "./schemas";
import { resourceInitializationError, readResourceInitialization, parseResourceReview } from "./state";
import type { ResourceDocument } from "resources/interfaces/archive";

export function resourceBrowserRisk(document: ResourceDocument | null): ResourceBrowserRisk {
    const javaScriptBlocs = (document?.blocs ?? [])
        .filter((bloc) => Boolean(bloc.viewJS))
        .map((bloc) => bloc.id)
        .sort();
    const frames = (document?.blocs ?? [])
        .filter((bloc) => bloc.browser !== undefined)
        .map((bloc) => ({
            id: bloc.id,
            origins: [...bloc.browser!.frames.origins].sort(),
            sandbox: [...bloc.browser!.frames.sandbox].sort(),
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return {
        level:
            javaScriptBlocs.length ||
            frames.some(
                (frame) => frame.sandbox.includes("allow-scripts") && frame.sandbox.includes("allow-same-origin"),
            )
                ? "high"
                : frames.length
                  ? "review"
                  : "none",
        javaScriptBlocs,
        frames,
    };
}
export async function assertResourceTargetEmpty(options: ResourceInitializationOptions) {
    const [pages, blocs, empty] = await Promise.all([
        options.content.scanPages(undefined, 1),
        options.content.getBlocsList({ includeHidden: true, projection: "rendering" }),
        options.metadata.isEmpty(),
    ]);
    if (pages.pages.length || blocs.length || !empty) {
        throw resourceInitializationError("Initialization requires an empty content and resource target", 409);
    }
}
export async function prepareResourceInitialization(
    options: ResourceInitializationOptions,
    actorId: string,
    choice: "empty" | "base",
    locale: string,
    callerSignal?: AbortSignal,
): Promise<ResourcePreparedInitialization> {
    await options.authorize(actorId);
    const signal = callerSignal
        ? AbortSignal.any([callerSignal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000);
    signal.throwIfAborted();
    if (Intl.getCanonicalLocales(locale)[0] !== locale || locale.length > 64) {
        throw resourceInitializationError("Invalid initialization locale");
    }
    const state = await readResourceInitialization(options);
    if (state.status !== "pending") {
        throw resourceInitializationError("Initialization was already started", 409);
    }
    await assertResourceTargetEmpty(options);
    const system = await readSystemSnapshot(options.content);
    const execution = await options.execution();
    const source = choice === "base" ? await options.source(locale, signal) : null;
    if (choice === "base" && !source) {
        throw resourceInitializationError("Base resource archive is unavailable", 404);
    }
    const archive = source ? await options.verify(source.bytes, source.digest, signal) : null;
    const preview = await options.preview(archive, execution, system.system, signal);
    const requirements = [
        ...new Map(
            [
                ...preview.requirements,
                ...(archive?.document.blocs.flatMap((bloc) => bloc.requires ?? []) ?? []),
                ...(archive?.document.pages.flatMap((page) => page.requires ?? []) ?? []),
            ].map((item) => {
                validateCapabilityRequirements([item]);
                return [JSON.stringify([item.contractId, item.capabilityId, item.versionRange]), { ...item }] as const;
            }),
        ).values(),
    ];
    assertResourceRequirements(requirements, execution);
    const paths = archive?.document.pages.map((page) => page.path) ?? [];
    if (preview.pages.length !== paths.length || preview.pages.some((page) => !paths.includes(page.path))) {
        throw resourceInitializationError("Candidate preview did not cover every Page");
    }
    const browserRisk = resourceBrowserRisk(archive?.document ?? null);
    const body = {
        protocol: "ulvia-resource-review/v1" as const,
        instanceId: options.instanceId,
        siteId: options.siteId,
        actorId,
        choice,
        locale,
        stateRevision: state.revision,
        systemRevision: system.revision,
        executionFingerprint: resourceDigest(execution.fingerprint),
        archiveDigest: archive?.digest ?? null,
        counts: {
            blocs: archive?.document.blocs.length ?? 0,
            assets: archive?.assets.length ?? 0,
            texts: archive?.document.texts.length ?? 0,
            pages: paths.length,
        },
        keys: {
            assets: archive?.document.assets.map((asset) => `${asset.namespace}:${asset.id}`) ?? [],
            texts: archive?.document.texts.map((source) => source.namespace) ?? [],
            blocs: archive?.document.blocs.map((bloc) => bloc.id) ?? [],
        },
        browserRisk,
        browserRiskDigest: resourceDigest(browserRisk),
        requirements,
        pages: [...preview.pages],
        themeDigest: preview.themeDigest,
    };
    signal.throwIfAborted();
    await assertResourceTargetEmpty(options);
    if (
        (await options.content.getSystemRevision()) !== system.revision ||
        resourceDigest((await options.execution()).fingerprint) !== body.executionFingerprint ||
        (await readResourceInitialization(options)).revision !== state.revision
    ) {
        throw resourceInitializationError("Initialization changed during candidate review", 409);
    }
    return { review: deepFreeze(parseResourceReview({ ...body, digest: resourceDigest(body) })), archive };
}
