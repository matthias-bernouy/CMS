import type { Db } from "mongodb";
import { isSha256Digest } from "@bernouy/binary-media";
import { isCanonicalSemVer, isRepositoryIdentifier } from "cms-repository/exports/contracts/compatibility";
import { isCollectionNamespace } from "../../../core/namespace";
import type { CollectionReleaseSummary } from "../../interfaces/store";

/** Server-side projection avoids transferring Blocs, markup, examples, translations and asset declarations. */
export async function readReleaseSummaries(db: Db, digests: readonly string[]): Promise<CollectionReleaseSummary[]> {
    if (digests.length === 0) {
        return [];
    }
    const rows = await db
        .collection("collection_releases")
        .aggregate<CollectionReleaseSummary & { _id: string }>([
            {
                $match: {
                    _id: { $in: [...new Set(digests)] },
                    state: { $ne: "pending" },
                    "release.kind": "collection",
                    "release.protocol": "ulvia-collection/v1",
                    "release.schemaDialect": "ulvia-schema/v1",
                },
            },
            {
                $project: {
                    _id: 1,
                    digest: 1,
                    publisherId: "$release.publisherId",
                    collectionId: "$release.collectionId",
                    version: "$release.version",
                    blocCount: { $size: "$release.blocs" },
                    assetCount: { $size: "$release.assets" },
                    exampleCount: { $size: { $ifNull: ["$release.examples", []] } },
                    textCount: { $size: { $ifNull: ["$release.texts", []] } },
                    configurable: { $ne: [{ $type: "$release.configuration" }, "missing"] },
                    themeTokenCount: {
                        $sum: {
                            $map: {
                                input: { $ifNull: ["$release.theme.categories", []] },
                                as: "category",
                                in: {
                                    $size: {
                                        $filter: {
                                            input: "$$category.entries",
                                            as: "entry",
                                            cond: { $ne: ["$$entry.type", "font-face"] },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        ])
        .toArray();
    return rows.map(({ _id, ...summary }) => {
        if (
            _id !== summary.digest ||
            !isSha256Digest(summary.digest) ||
            !isRepositoryIdentifier(summary.publisherId) ||
            !isCollectionNamespace(summary.collectionId) ||
            !isCanonicalSemVer(summary.version) ||
            typeof summary.configurable !== "boolean" ||
            [
                summary.blocCount,
                summary.assetCount,
                summary.exampleCount,
                summary.textCount,
                summary.themeTokenCount,
            ].some((count) => !Number.isSafeInteger(count) || count < 0)
        ) {
            throw new TypeError("Stored collection release summary is inconsistent");
        }
        return summary;
    });
}
