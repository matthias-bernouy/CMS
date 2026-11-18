import { repositoryApi } from "../../../integration/instance/repository/client";
import { isolatedOrigin } from "../transport/http";
import { ClientFailure } from "./failure";
import type { ScenarioSession } from "./session";

type Administrator = Readonly<{ email: string; password: string }>;
type Login = (origin: string, administrator: Administrator) => Promise<Readonly<{ cookie: string; accountId: string }>>;

/** The pre-provisioned secondary CMS has its own administrator session, never the Registry publisher's cookie. */
export function isolationSession(
    mainOrigin: string,
    origin: string,
    administrator: Administrator,
    login: Login = (target, actor) => repositoryApi(target).session(actor.email, actor.password),
) {
    if (isolatedOrigin(mainOrigin) === isolatedOrigin(origin)) {
        throw new ClientFailure("isolation-site-must-be-distinct");
    }
    let pending: Promise<ScenarioSession> | undefined;
    return () =>
        (pending ??= Promise.resolve().then(async () => {
            try {
                const session = await login(origin, administrator);
                if (!session.cookie || !session.accountId) {
                    throw new Error("Invalid test administrator session");
                }
                return { origin, cookie: session.cookie, token: "", tools: [] };
            } catch {
                throw new ClientFailure("isolation-administrator-login-failed");
            }
        }));
}
