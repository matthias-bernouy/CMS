import { SQL } from "bun";
import type { PlatformVerificationFindingV1 } from "@bernouy/cms-integration-verification";
import { finding } from "../../evidence";
import { BEHAVIORAL_RLS_IDENTITIES } from "./constants";
import type { BehavioralRlsActor } from "./types";

export type SupabaseActorResult<T> =
    | Readonly<{ status: "success"; value: T }>
    | Readonly<{ status: "denied" | "error"; code: string }>;

type ActorContext =
    | Readonly<{ actor: "anon"; role: "anon"; subject: null }>
    | Readonly<{ actor: "first" | "second"; role: "authenticated"; subject: string }>;

export async function inspectSupabaseActorSessions(database: SQL, signal: AbortSignal) {
    const observations = [];
    const findings: PlatformVerificationFindingV1[] = [];
    for (const actor of [actorContext("anon"), actorContext("first"), actorContext("second")]) {
        const result = await executeAsSupabaseActor(database, actor.actor, signal, async () => {
            const rows = (await database.unsafe(`select current_user::text as role,
              nullif(current_setting('request.jwt.claim.sub', true), '')::text as "legacySub",
              nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' as "claimsSub",
              auth.uid()::text as "authUid", auth.jwt() ->> 'sub' as "jwtSub",
              auth.jwt() ->> 'role' as "jwtRole"`)) as Array<{
                role: string;
                legacySub: string | null;
                claimsSub: string | null;
                authUid: string | null;
                jwtSub: string | null;
                jwtRole: string | null;
            }>;
            return rows[0];
        });
        const expectedSubject = actor.subject;
        const row = result.status === "success" ? result.value : undefined;
        const observation = {
            actor: actor.actor,
            roleMatched: row?.role === actor.role,
            legacySubjectMatched: (row?.legacySub ?? null) === expectedSubject,
            claimsSubjectMatched: (row?.claimsSub ?? null) === expectedSubject,
            authUidMatched: (row?.authUid ?? null) === expectedSubject,
            jwtSubjectMatched: (row?.jwtSub ?? null) === expectedSubject,
            jwtRoleMatched: row?.jwtRole === actor.role,
        };
        observations.push(observation);
        if (Object.values(observation).some((value) => value === false)) {
            findings.push(finding("postgres-rls-behavior-jwt-context-invalid", `actors.${actor.actor}`));
        }
    }
    return { observations, findings };
}

export async function executeAsSupabaseActor<T>(
    database: SQL,
    actor: BehavioralRlsActor,
    signal: AbortSignal,
    operation: () => Promise<T>,
): Promise<SupabaseActorResult<T>> {
    signal.throwIfAborted();
    const context = actorContext(actor);
    await database.unsafe("savepoint cms_behavioral_actor");
    let result: SupabaseActorResult<T>;
    try {
        await database.unsafe(`set local role ${context.role}`);
        await installClaims(database, context);
        signal.throwIfAborted();
        result = { status: "success", value: await operation() };
    } catch (error) {
        if (signal.aborted) {
            throw signal.reason;
        }
        const code = postgresErrorCode(error);
        result = { status: code === "42501" ? "denied" : "error", code };
    } finally {
        await database.unsafe("rollback to savepoint cms_behavioral_actor");
        await database.unsafe("release savepoint cms_behavioral_actor");
    }
    return result;
}

function actorContext(actor: BehavioralRlsActor): ActorContext {
    if (actor === "anon") {
        return { actor, role: "anon", subject: null };
    }
    return { actor, role: "authenticated", subject: BEHAVIORAL_RLS_IDENTITIES[actor] };
}

async function installClaims(database: SQL, context: ActorContext): Promise<void> {
    const claims =
        context.role === "anon"
            ? {
                  iss: "https://cms-verifier.invalid/auth/v1",
                  ref: "cms-verifier",
                  aud: "anon",
                  role: "anon",
                  iat: 2_000_000_000,
                  exp: 2_100_000_000,
              }
            : authenticatedClaims(context.actor, context.subject);
    await database.unsafe(
        `select set_config('request.jwt.claims', $1, true),
          set_config('request.jwt.claim.sub', $2, true),
          set_config('request.jwt.claim.role', $3, true)`,
        [JSON.stringify(claims), context.subject ?? "", context.role],
    );
}

function authenticatedClaims(actor: "first" | "second", subject: string) {
    return {
        iss: "https://cms-verifier.invalid/auth/v1",
        aud: "authenticated",
        exp: 2_100_000_000,
        iat: 2_000_000_000,
        sub: subject,
        role: "authenticated",
        aal: "aal1",
        session_id: actor === "first" ? "0194df39-2b9e-7d9e-9803-81ca737dd9e1" : "0194df39-2b9e-7d9e-9803-81ca737dd9e2",
        email: `${actor}@cms-verifier.invalid`,
        phone: "",
        is_anonymous: false,
        app_metadata: { provider: "email", providers: ["email"] },
    };
}

function postgresErrorCode(error: unknown): string {
    const postgres = error as { errno?: unknown; code?: unknown };
    if (typeof postgres.errno === "string") {
        return postgres.errno;
    }
    return typeof postgres.code === "string" ? postgres.code : "unknown";
}
