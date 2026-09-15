import type { ReviewedSchemaBaselineImportApproval } from "@bernouy/cms-integration-registry";
import type { ReviewedSchemaBaselineImportTarget } from "@bernouy/cms-integration-registry/fs";

const approval = Object.freeze({
    generator: {
        name: "cms-schema-generator",
        version: "1.0.0",
        imageDigest: "sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0",
    },
    environments: [
        {
            digest: "2484fadd22636f1a7183b21b14177b180b9e0c350a93c641ad2d772483e409c3",
            postgresVersion: "160014",
        },
    ],
    policy: { name: "legacy-schema-baseline", version: "1.0.0" },
    provenanceActors: ["official-integrations-ci"],
} satisfies ReviewedSchemaBaselineImportApproval);

const approvedTargets = Object.freeze([
    {
        kind: "commerce",
        version: "1.0.0",
        packageDigest: "e9617220d9f0bf9cf9a8e7be0e8b7d85f45b0a0c76b591d23d2eca1a51b27f89",
        connectorKey: "commerce",
        lineageId: "commerce-supabase-v1",
    },
] satisfies readonly ReviewedSchemaBaselineImportTarget[]);

export const productionReviewedSchemaBaselineImports = Object.freeze({ approval, approvedTargets });
