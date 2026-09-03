import { publishedMarketplaceTermsDocument } from "./document.ts";
import { getCurrentMarketplaceTermsConfiguration, publishMarketplaceTermsConfiguration } from "./repository.ts";
import {
    assertAllowedKeys,
    HttpError,
    json,
    type JsonRecord,
    readJsonObject,
    requireDashboardAdmin,
} from "./runtime.ts";
import { fetchPublishedMarketplaceTermsPage } from "./snapshot-fetch.ts";

export async function getMarketplaceTermsManagement(request: Request): Promise<Response> {
    requireDashboardAdmin(request);
    return json(managementProjection(await getCurrentMarketplaceTermsConfiguration()));
}

export async function publishMarketplaceTermsManagement(request: Request): Promise<Response> {
    const { userId } = requireDashboardAdmin(request);
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["expectedVersion", "documentKey", "label", "consentText", "publishedSnapshotUrl"]);
    const expectedVersion = requiredText(body.expectedVersion, "expectedVersion", 200);
    const current = await getCurrentMarketplaceTermsConfiguration();
    if ((current?.version ?? "new") !== expectedVersion) {
        throw new HttpError(409, "MARKETPLACE_TERMS_VERSION_CHANGED");
    }
    const document = await publishedMarketplaceTermsDocument({
        key: body.documentKey,
        label: body.label,
        consentText: body.consentText,
        page: await fetchPublishedMarketplaceTermsPage(body.publishedSnapshotUrl),
    });
    return json(
        managementProjection(
            await publishMarketplaceTermsConfiguration({ document, actorId: userId, expectedVersion }),
        ),
    );
}

function managementProjection(
    configuration: Awaited<ReturnType<typeof getCurrentMarketplaceTermsConfiguration>>,
): JsonRecord {
    if (!configuration) {
        return {
            status: "unconfigured",
            revision: "new",
            documentKey: "seller_terms",
            label: "",
            consentText: "",
            publishedSnapshotUrl: "",
            updatedAt: null,
        };
    }
    return {
        status: configuration.mode === "published_page" ? "published" : "legacy",
        revision: configuration.version,
        documentKey: configuration.documentKey ?? "seller_terms",
        label: configuration.label ?? "",
        consentText: configuration.consentText ?? "",
        publishedSnapshotUrl: configuration.publishedSnapshotUrl ?? "",
        updatedAt: configuration.updatedAt,
    };
}

function requiredText(value: unknown, name: string, maximum: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > maximum) {
        throw new HttpError(422, `${name} is invalid`);
    }
    return value.trim();
}
