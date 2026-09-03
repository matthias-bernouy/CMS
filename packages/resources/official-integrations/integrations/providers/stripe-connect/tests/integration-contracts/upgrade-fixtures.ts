import { expect } from "@bernouy/cms-integration-verification/sdk/v1";
import {
    defineUpgradeScenario,
    defineUpgradeScenarios,
    UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";

const publishedMarketplaceTerms = defineUpgradeScenario({
    name: "preserves published marketplace terms and their acceptance evidence",
    from: ">=1.0.0 <3.0.0",
    async seedBeforeUpgrade(context) {
        const sellerId = "upgrade-fixture-seller";
        const contentHash = "c".repeat(64);
        const revisionHash = "d".repeat(64);
        const version = `cms-page:${revisionHash}`;
        await context.database.query(
            `select stripe_connect.sync_marketplace_terms_configuration(
                jsonb_build_object(
                    'documentKey', 'seller-terms',
                    'label', 'Seller terms and conditions',
                    'consentText', 'I accept the Seller terms and conditions.',
                    'publishedSnapshotUrl', 'https://legal.example.test/.cms/content/published-page-snapshot?id=seller-terms',
                    'page', jsonb_build_object(
                        'id', 'seller-terms',
                        'path', '/seller-terms',
                        'title', 'Seller terms and conditions',
                        'description', 'Published before the upgrade',
                        'content', '<h1>Seller terms</h1><p>Persisted marketplace policy.</p>'
                    ),
                    'contentHash', $1::text,
                    'revisionHash', $2::text
                ), null, null, 'fixture-admin'
            )`,
            [contentHash, revisionHash],
        );
        await context.database.query(
            `insert into stripe_connect.accounts (cms_user_id)
             values ($1)`,
            [sellerId],
        );
        await context.database.query(`select stripe_connect.record_marketplace_terms_acceptance($1, $2, $3)`, [
            sellerId,
            version,
            contentHash,
        ]);
        return { sellerId, version, contentHash };
    },
    async assertAfterUpgrade(context, state) {
        const rows = await context.database.query(
            `select configuration.current_terms_version_id is not null as "publishedMode",
                    version.terms_version as version,
                    version.content_hash as "contentHash",
                    version.created_by as "createdBy",
                    account.marketplace_terms_version as "acceptedVersion",
                    account.marketplace_terms_hash as "acceptedHash",
                    acceptance.terms_version as "evidenceVersion",
                    acceptance.terms_hash as "evidenceHash"
             from stripe_connect.marketplace_terms_configuration configuration
             join stripe_connect.marketplace_terms_versions version
               on version.id = configuration.current_terms_version_id
             join stripe_connect.accounts account on account.cms_user_id = $1
             join stripe_connect.marketplace_terms_acceptances acceptance
               on acceptance.cms_user_id = account.cms_user_id
              and acceptance.terms_version = version.terms_version
             where configuration.singleton`,
            [state.sellerId],
        );
        expect(rows).toEqual([
            {
                publishedMode: true,
                version: state.version,
                contentHash: state.contentHash,
                createdBy: "fixture-admin",
                acceptedVersion: state.version,
                acceptedHash: state.contentHash,
                evidenceVersion: state.version,
                evidenceHash: state.contentHash,
            },
        ]);
    },
});

export default defineUpgradeScenarios({
    schema: UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
    scenarios: [publishedMarketplaceTerms],
});
