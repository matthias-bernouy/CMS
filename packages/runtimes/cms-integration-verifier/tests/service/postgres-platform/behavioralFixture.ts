import { SQL } from "bun";
import type { BehavioralRlsProbe } from "../../../src/sandbox/service/postgres/checks/behavioral";

export const BEHAVIORAL_PROBE: BehavioralRlsProbe = Object.freeze({
    probeId: "tenant-records",
    namespace: "verifier_behavioral",
    relation: "tenant_records",
    keyColumn: "id",
    subjectColumn: "owner_id",
    first: fixture("0194df39-2b9e-7d9e-9803-81ca737dda01", "first"),
    second: fixture("0194df39-2b9e-7d9e-9803-81ca737dda02", "second"),
    firstCrossInsert: fixture("0194df39-2b9e-7d9e-9803-81ca737dda03", "first-cross"),
    secondCrossInsert: fixture("0194df39-2b9e-7d9e-9803-81ca737dda04", "second-cross"),
});

export async function installBehavioralRuntime(admin: SQL, candidateRole: string): Promise<void> {
    await admin.unsafe(`create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $$;
      revoke all on function auth.uid() from public;
      revoke all on function auth.jwt() from public;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
      grant usage on schema auth to ${identifier(candidateRole)};
      grant execute on function auth.uid(), auth.jwt() to ${identifier(candidateRole)};
      grant anon, authenticated to ${identifier(candidateRole)}`);
}

export async function installTenantTable(database: SQL): Promise<void> {
    await database.unsafe(`create schema verifier_behavioral;
      create table verifier_behavioral.tenant_records (
        id uuid primary key,
        owner_id uuid not null,
        secret text not null
      );
      alter table verifier_behavioral.tenant_records enable row level security;
      create policy tenant_select on verifier_behavioral.tenant_records
        for select to authenticated using ((select auth.uid()) = owner_id);
      create policy tenant_insert on verifier_behavioral.tenant_records
        for insert to authenticated with check ((select auth.uid()) = owner_id);
      create policy tenant_update on verifier_behavioral.tenant_records
        for update to authenticated using ((select auth.uid()) = owner_id)
        with check ((select auth.uid()) = owner_id);
      create policy tenant_delete on verifier_behavioral.tenant_records
        for delete to authenticated using ((select auth.uid()) = owner_id);
      grant usage on schema verifier_behavioral to anon, authenticated;
      grant select on verifier_behavioral.tenant_records to anon;
      grant select, insert, update, delete on verifier_behavioral.tenant_records to authenticated`);
}

export async function makePoliciesLeaky(database: SQL): Promise<void> {
    await database.unsafe(`drop policy tenant_select on verifier_behavioral.tenant_records;
      drop policy tenant_insert on verifier_behavioral.tenant_records;
      drop policy tenant_update on verifier_behavioral.tenant_records;
      drop policy tenant_delete on verifier_behavioral.tenant_records;
      create policy tenant_select on verifier_behavioral.tenant_records for select to anon, authenticated using (true);
      create policy tenant_insert on verifier_behavioral.tenant_records for insert to authenticated with check (true);
      create policy tenant_update on verifier_behavioral.tenant_records for update to authenticated using (true) with check (true);
      create policy tenant_delete on verifier_behavioral.tenant_records for delete to authenticated using (true)`);
}

function fixture(key: string, secret: string) {
    return Object.freeze({ key, values: Object.freeze({ secret }) });
}

function identifier(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
}
