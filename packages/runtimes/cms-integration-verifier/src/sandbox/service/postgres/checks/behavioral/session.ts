import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import type { PlatformVerificationFindingV1 } from "@bernouy/cms-integration-verification";
import { finding } from "../../evidence";
import type { BehavioralRlsActor, BehavioralRlsActors, BehavioralRlsAuthenticatedActor } from "./types";

export type SupabaseActorResult<T> =
    | Readonly<{ status: "success"; value: T }>
    | Readonly<{ status: "denied" | "error"; code: string }>;

type ActorContext =
    | Readonly<{ actor: "anon"; role: "anon"; subject: null }>
    | (Readonly<{ actor: "first" | "second"; role: "authenticated" }> & BehavioralRlsAuthenticatedActor);

export function createBehavioralRlsActors(): BehavioralRlsActors {
    return Object.freeze({ first: authenticatedActor(), second: authenticatedActor() });
}

export async function inspectSupabaseActorSessions(database: SQL, actors: BehavioralRlsActors, signal: AbortSignal) {
    const observations = [];
    const findings: PlatformVerificationFindingV1[] = [];
    for (const actor of [actorContext("anon", actors), actorContext("first", actors), actorContext("second", actors)]) {
        const result = await executeAsSupabaseActor(database, actors, actor.actor, signal, async () => {
            const rows = (await database.unsafe(`select current_user::text as role,
              nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' as "claimsSub",
              auth.uid()::text as "authUid", auth.jwt() ->> 'sub' as "jwtSub",
              auth.jwt() ->> 'role' as "jwtRole"`)) as Array<{
                role: string;
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
    actors: BehavioralRlsActors,
    actor: BehavioralRlsActor,
    signal: AbortSignal,
    operation: () => Promise<T>,
    options: Readonly<{ preserveSuccess?: boolean }> = {},
): Promise<SupabaseActorResult<T>> {
    signal.throwIfAborted();
    const context = actorContext(actor, actors);
    await database.unsafe("savepoint cms_behavioral_actor");
    let result: SupabaseActorResult<T>;
    let preserve = false;
    try {
        await database.unsafe(`set local role ${context.role}`);
        await installClaims(database, context);
        signal.throwIfAborted();
        result = { status: "success", value: await operation() };
        preserve = options.preserveSuccess === true;
    } catch (error) {
        if (signal.aborted) {
            throw signal.reason;
        }
        const code = postgresErrorCode(error);
        result = { status: code === "42501" ? "denied" : "error", code };
    } finally {
        if (!preserve) {
            await database.unsafe("rollback to savepoint cms_behavioral_actor");
        }
        await database.unsafe("release savepoint cms_behavioral_actor");
    }
    return result;
}

function actorContext(actor: BehavioralRlsActor, actors: BehavioralRlsActors): ActorContext {
    if (actor === "anon") {
        return { actor, role: "anon", subject: null };
    }
    return { actor, role: "authenticated", ...actors[actor] };
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
            : authenticatedClaims(context);
    await database.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
}

function authenticatedClaims(context: Extract<ActorContext, { role: "authenticated" }>) {
    return {
        iss: "https://cms-verifier.invalid/auth/v1",
        aud: "authenticated",
        exp: 2_100_000_000,
        iat: 2_000_000_000,
        sub: context.subject,
        role: "authenticated",
        aal: "aal1",
        session_id: context.sessionId,
        email: context.email,
        phone: "",
        is_anonymous: false,
        app_metadata: { provider: "email", providers: ["email"] },
    };
}

function authenticatedActor(): BehavioralRlsAuthenticatedActor {
    return Object.freeze({
        subject: randomUUID(),
        sessionId: randomUUID(),
        email: `${randomUUID()}@cms-verifier.invalid`,
    });
}

function postgresErrorCode(error: unknown): string {
    const postgres = error as { errno?: unknown; code?: unknown };
    if (typeof postgres.errno === "string") {
        return postgres.errno;
    }
    return typeof postgres.code === "string" ? postgres.code : "unknown";
}
