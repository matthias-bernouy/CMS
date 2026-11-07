import type { AdmittedCollectionRelease } from "@bernouy/cms-repository/collections";
import {
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
    resolveCollectionTranslation,
} from "@bernouy/cms-repository/collections";
import { compareSemVer, releaseChannel } from "@bernouy/ulvia-contracts/compatibility";
import type { CmsCollectionDependencies } from "../../../ports/index";

export function verifiedCatalogueEntry(
    repositoryId: string,
    artifact: Pick<AdmittedCollectionRelease, "release" | "digest">,
) {
    const { release, digest } = artifact;
    const browser = collectionBrowserRisk(release);
    return {
        repositoryId,
        publisherId: release.publisherId,
        collectionId: release.collectionId,
        version: release.version,
        channel: releaseChannel(release.version),
        digest,
        name: resolveCollectionTranslation(release, release.name),
        description: release.description ? resolveCollectionTranslation(release, release.description) : "",
        blocCount: release.blocs.length,
        hasTheme: Boolean(release.theme),
        browserRisk: browser.level,
        browserRiskDigest: collectionBrowserRiskDigest(browser),
        javaScriptBlocCount: browser.javaScriptBlocs.length,
        javaScriptBlocs: browser.javaScriptBlocs,
        frameBlocCount: browser.frameBlocs.length,
        frameBlocs: browser.frameBlocs,
        externalFrameOrigins: browser.externalFrameOrigins,
        scriptsWithSameOrigin: browser.scriptsWithSameOrigin,
    };
}

export function releaseAction(
    release: { digest: string; version: string },
    installed:
        | Awaited<ReturnType<CmsCollectionDependencies["collections"]["listInstalled"]>>["items"][number]
        | undefined,
): "install" | "upgrade" | "current" | "older" {
    if (!installed) {
        return "install";
    }
    if (installed.digest === release.digest) {
        return "current";
    }
    return compareSemVer(release.version, installed.version) > 0 ? "upgrade" : "older";
}
