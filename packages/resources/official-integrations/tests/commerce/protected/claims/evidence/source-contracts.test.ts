import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { attachedEvidence } from "./raw";

type Endpoint = {
    endpointId: string;
    method: string;
    access: unknown;
    targetUrl: string;
    params?: Array<{ name: string; required?: boolean }>;
    responseKind?: string;
    mediaType?: string;
    output?: Array<{ status?: string; body?: DataShape }>;
};

const definitionPath = resolve(
    import.meta.dir,
    "../../../../../integrations/commerce/versions/1.0.0/definition.json",
);

describe("commerce claim evidence strict Source contracts", () => {
    test("keeps endpoint access and file response declarations", async () => {
        const endpoints = await evidenceEndpoints();

        expect(endpoints.map(endpoint => ({
            endpointId: endpoint.endpointId,
            method: endpoint.method,
            access: endpoint.access,
            target: endpoint.targetUrl.split("/cms-commerce").at(-1),
            params: endpoint.params?.map(param => [param.name, param.required === true]),
            response: [endpoint.responseKind ?? "json", endpoint.mediaType ?? null],
            statuses: endpoint.output?.map(output => output.status),
        }))).toEqual([
            {
                endpointId: "uploadMyOrderClaimEvidence",
                method: "POST", access: "auth", target: "/me/order/claim/evidence",
                params: [["claimId", true]], response: ["json", null], statuses: ["201"],
            },
            {
                endpointId: "myOrderClaimEvidenceFile",
                method: "GET", access: "auth", target: "/me/order/claim/evidence",
                params: [["evidenceId", true]],
                response: ["file", "application/octet-stream"], statuses: ["200"],
            },
            {
                endpointId: "uploadMySaleClaimEvidence",
                method: "POST", access: "auth", target: "/me/sale/claim/evidence",
                params: [["claimId", true]], response: ["json", null], statuses: ["201"],
            },
            {
                endpointId: "mySaleClaimEvidenceFile",
                method: "GET", access: "auth", target: "/me/sale/claim/evidence",
                params: [["evidenceId", true]],
                response: ["file", "application/octet-stream"], statuses: ["200"],
            },
            {
                endpointId: "claimEvidenceFile",
                method: "GET", access: { mode: "admin" }, target: "/admin/claim/evidence",
                params: [["evidenceId", true]],
                response: ["file", "application/octet-stream"], statuses: ["200", "404"],
            },
            {
                endpointId: "claimEvidenceItems",
                method: "GET", access: { mode: "admin" },
                target: "/admin/claim/evidence-items",
                params: [["claimId", true], ["limit", false], ["offset", false]],
                response: ["json", null], statuses: ["200"],
            },
            {
                endpointId: "claimEvidenceItem",
                method: "GET", access: { mode: "admin" },
                target: "/admin/claim/evidence-item", params: [["id", true]],
                response: ["json", null], statuses: ["200"],
            },
        ]);
    });

    test("preserves the distinct buyer and seller upload projections", async () => {
        const endpoints = await evidenceEndpoints();
        const raw = {
            ...attachedEvidence,
            storageBucket: "must-not-leak",
            storagePath: "must-not-leak",
            submittedBy: "must-not-leak",
        };

        expect(projectStrictDataShape(
            raw,
            outputShape(endpoints, "uploadMyOrderClaimEvidence", "201"),
            "response",
            { enforceRequired: false },
        )).toEqual({
            id: attachedEvidence.id,
            claimId: attachedEvidence.claimId,
            submittedByKind: "buyer",
            mimeType: "application/pdf",
            fileSize: 34,
            originalFilename: "folder_proof.pdf",
            sha256: attachedEvidence.sha256,
            description: "Opening proof",
            createdAt: attachedEvidence.createdAt,
        });
        expect(projectStrictDataShape(
            { ...raw, submittedByKind: "seller", description: null },
            outputShape(endpoints, "uploadMySaleClaimEvidence", "201"),
            "response",
            { enforceRequired: false },
        )).toEqual({
            id: attachedEvidence.id,
            claimId: attachedEvidence.claimId,
            submittedByKind: "seller",
            mimeType: "application/pdf",
            fileSize: 34,
            originalFilename: "folder_proof.pdf",
            sha256: attachedEvidence.sha256,
            description: null,
            metadata: { upload: "edge_multipart_v1" },
            createdAt: attachedEvidence.createdAt,
        });
    });

    test("records the existing buyer nullable-description mismatch separately", async () => {
        const endpoints = await evidenceEndpoints();

        expect(() => projectStrictDataShape(
            { ...attachedEvidence, description: null },
            outputShape(endpoints, "uploadMyOrderClaimEvidence", "201"),
            "response",
            { enforceRequired: false },
        )).toThrow();
    });
});

async function evidenceEndpoints(): Promise<Endpoint[]> {
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    return definition.artifacts
        .find((artifact: any) => artifact.source)?.source?.endpoints
        .filter((endpoint: Endpoint) => [
            "uploadMyOrderClaimEvidence", "myOrderClaimEvidenceFile",
            "uploadMySaleClaimEvidence", "mySaleClaimEvidenceFile",
            "claimEvidenceFile", "claimEvidenceItems", "claimEvidenceItem",
        ].includes(endpoint.endpointId));
}

function outputShape(
    endpoints: Endpoint[],
    endpointId: string,
    status: string,
): DataShape {
    const shape = endpoints.find(endpoint => endpoint.endpointId === endpointId)
        ?.output?.find(output => output.status === status)?.body;
    if (!shape) throw new Error(`Missing ${endpointId} ${status} output shape`);
    return shape;
}
