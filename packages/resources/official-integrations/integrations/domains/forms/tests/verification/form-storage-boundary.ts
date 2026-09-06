import { defineSuite, expect, test } from "@bernouy/cms-integration-verification/sdk/v1";

export default defineSuite({
    tests: [
        test("declares operations while denying raw form writes", async ({ query }) => {
            const operations = await query(
                "select to_regprocedure('forms.save_form_draft(text,text,text,text,jsonb,text)') is not null as save_draft, to_regprocedure('forms.submit_form(text,integer,text,uuid,jsonb,text,jsonb)') is not null as submit_form, to_regprocedure('forms.create_media(text,text,text,text,bigint,integer,integer,text,text)') is not null as create_media, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced, media.relrowsecurity and media.relforcerowsecurity as media_rls from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_class media on media.relnamespace = n.oid and media.relname = 'media' where n.nspname = 'forms' and c.relname = 'forms'",
            );
            expect(operations).toEqual([
                {
                    save_draft: true,
                    submit_form: true,
                    create_media: true,
                    rls_enabled: true,
                    rls_forced: true,
                    media_rls: true,
                },
            ]);

            let rawWriteRejected = false;
            try {
                await query(
                    "insert into forms.forms (form_key, title, access_mode, draft_definition) values ('verification-contact', 'Verification contact', 'public', '{\"schemaVersion\":1,\"fields\":[]}'::jsonb)",
                );
            } catch {
                rawWriteRejected = true;
            }
            expect(rawWriteRejected).toBe(true);
        }),
    ],
});
