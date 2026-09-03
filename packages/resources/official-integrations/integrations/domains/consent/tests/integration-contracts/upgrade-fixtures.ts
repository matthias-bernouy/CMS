import { assert, expect } from "@bernouy/cms-integration-verification/sdk/v1";
import {
    defineUpgradeScenario,
    defineUpgradeScenarios,
    UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";

const publishedConsent = defineUpgradeScenario({
    name: "preserves a published policy and its immutable acceptance evidence",
    from: ">=1.0.0 <3.0.0",
    async seedBeforeUpgrade(context) {
        await context.database.query(
            `with page as (
                 select jsonb_build_object(
                     'id', $1::text, 'path', $2::text, 'title', $3::text,
                     'description', $4::text, 'content', $5::text
                 ) as value
             )
             select consent.sync_consent_context(
                 'signup', true, $6,
                 jsonb_build_array(jsonb_build_object(
                     'key', 'terms', 'enabled', true,
                     'label', 'Terms and conditions',
                     'consentText', 'I accept the Terms and conditions.',
                     'publishedSnapshotUrl', $6 || '/.cms/content/published-page-snapshot?id=' || $1,
                     'page', page.value,
                     'contentHash', consent.published_page_hash(page.value)
                 )),
                 'fixture-admin'
             )
             from page`,
            [
                "upgrade-terms",
                "/terms",
                "Terms and conditions",
                "Policy published before the upgrade",
                "<h1>Terms and conditions</h1><p>Persisted policy.</p>",
                "https://legal.example.test",
            ],
        );
        const [policy] = await context.database.query(
            `select document.current_version_id as "versionId",
                    version.content_hash as "contentHash"
             from consent.documents document
             join consent.document_versions version
               on version.context_key = document.context_key
              and version.document_key = document.document_key
              and version.version_id = document.current_version_id
             where document.context_key = 'signup' and document.document_key = 'terms'`,
        );
        const versionId = requiredString(policy?.versionId, "document version");
        const contentHash = requiredString(policy?.contentHash, "content hash");
        const attemptId = "9cfeb52c-860c-4c7e-ae49-8b75f2292026";
        const subjectHash = "d".repeat(64);
        await context.database.query(
            `select consent.stage_consent_acceptance(
                'signup', $1::uuid, $2, array[$3]::text[]
            )`,
            [attemptId, subjectHash, versionId],
        );
        const [committed] = await context.database.query(
            `select consent.commit_consent_acceptance(
                'signup', $1::uuid, $2, array[$3]::text[], $4
            )->>'acceptanceId' as "acceptanceId"`,
            [attemptId, subjectHash, versionId, "fixture-user"],
        );
        return {
            versionId,
            contentHash,
            acceptanceId: requiredString(committed?.acceptanceId, "acceptance"),
        };
    },
    async assertAfterUpgrade(context, state) {
        const rows = await context.database.query(
            `select context.enabled,
                    context.approved_snapshot_origin as "snapshotOrigin",
                    context.configured_by as "configuredBy",
                    document.current_version_id as "versionId",
                    version.content_hash as "contentHash",
                    acceptance.id::text as "acceptanceId",
                    acceptance.cms_user_id as "cmsUserId",
                    evidence.version_id as "acceptedVersionId",
                    evidence.content_hash as "acceptedContentHash"
             from consent.contexts context
             join consent.documents document on document.context_key = context.context_key
             join consent.document_versions version
               on version.context_key = document.context_key
              and version.document_key = document.document_key
              and version.version_id = document.current_version_id
             join consent.acceptances acceptance on acceptance.context_key = context.context_key
             join consent.acceptance_documents evidence on evidence.acceptance_id = acceptance.id
             where context.context_key = 'signup'
               and document.document_key = 'terms'
               and acceptance.id = $1::uuid`,
            [state.acceptanceId],
        );
        expect(rows).toEqual([
            {
                enabled: true,
                snapshotOrigin: "https://legal.example.test",
                configuredBy: "fixture-admin",
                versionId: state.versionId,
                contentHash: state.contentHash,
                acceptanceId: state.acceptanceId,
                cmsUserId: "fixture-user",
                acceptedVersionId: state.versionId,
                acceptedContentHash: state.contentHash,
            },
        ]);

        const response = await context.cms.request("/.cms/sources/consent/getRequirements?context=signup");
        assert(response.status === 200, `CMS consent requirements returned HTTP ${response.status}`);
        assert(response.body && typeof response.body === "object" && !Array.isArray(response.body));
        assert(response.body.enabled === true, "CMS consent requirements disabled the existing policy");
        assert(Array.isArray(response.body.documents), "CMS consent requirements lost its documents");
        assert(
            response.body.documents[0]?.versionId === state.versionId,
            "CMS consent requirements changed the version",
        );
    },
});

export default defineUpgradeScenarios({
    schema: UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
    scenarios: [publishedConsent],
});

function requiredString(value: unknown, resource: string): string {
    if (typeof value !== "string" || !value) {
        throw new Error(`Upgrade fixture did not create its ${resource}`);
    }
    return value;
}
