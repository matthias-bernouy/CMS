import { expect, test } from "bun:test";

const versionRoot = new URL("../", import.meta.url);

test("Forms SQL stays private, versioned, indexed, and batch-safe", async () => {
    const privileges = await Bun.file(
        new URL("connectors/supabase/install/sql/access/privileges.sql", versionRoot),
    ).text();
    const forms = await Bun.file(new URL("connectors/supabase/install/sql/model/forms.sql", versionRoot)).text();
    const submissions = await Bun.file(
        new URL("connectors/supabase/install/sql/model/submissions.sql", versionRoot),
    ).text();
    const retention = await Bun.file(
        new URL("connectors/supabase/install/sql/operations/retention.sql", versionRoot),
    ).text();

    expect(privileges).toContain("force row level security");
    expect(privileges).toContain("revoke all on schema forms from public, anon, authenticated, service_role");
    expect(privileges).not.toContain("grant select, insert");
    expect(privileges).not.toContain("grant usage, select on all sequences");
    expect(forms).toContain("form_versions_form_version_unique unique (form_id, version_number)");
    expect(submissions).toContain("submissions_idempotency_unique unique (form_id, idempotency_key)");
    expect(submissions).toContain("submissions_form_created_idx");
    expect(submissions).toContain("submissions_form_version_idx");
    expect(submissions).toContain("submissions_retention_idx");
    expect(retention).toContain("for update skip locked");
});
