import { createHash } from "node:crypto";
import { jsonResponse, type JsonRecord } from "../../harness";

export const versionId = "3d341928-b30d-4af5-b918-eab9df624706";
export const nextVersionId = "d4593559-25c8-42ec-87f4-83c496b8bde8";
export const correlationId = "23484f33-28d7-4b47-a0bf-48870a4d80ba";
export const deliveryOrigin = "https://delivery.example.test";
export const snapshotUrl = `${deliveryOrigin}/tenant/.cms/content/published-page-snapshot?id=page-1`;

export const legalPage = {
    id: "page-1",
    path: "/terms",
    title: "Terms",
    description: "",
    content: "<main>Terms revision one</main>",
};

export function contentHash(page: typeof legalPage): string {
    return createHash("sha256")
        .update(
            JSON.stringify({
                id: page.id,
                path: page.path,
                title: page.title,
                description: page.description,
                content: page.content,
            }),
        )
        .digest("hex");
}

export function verificationContext(overrides: Partial<JsonRecord> = {}): JsonRecord {
    return {
        enabled: true,
        paymentAlreadyCreated: false,
        approvedSnapshotOrigin: deliveryOrigin,
        documents: [
            {
                key: "terms",
                versionId,
                pageId: legalPage.id,
                publishedSnapshotUrl: snapshotUrl,
            },
        ],
        ...overrides,
    };
}

export function snapshotResponse(
    page = legalPage,
    hash = contentHash(page),
    status = 200,
    headers: HeadersInit = {},
): Response {
    return jsonResponse(
        {
            schema: "cms-published-page-snapshot-v1",
            page,
            contentHash: hash,
        },
        status,
        headers,
    );
}

export function rpcName(request: Request): string {
    const marker = "/rest/v1/rpc/";
    return request.url.includes(marker) ? request.url.slice(request.url.indexOf(marker) + marker.length) : "";
}
