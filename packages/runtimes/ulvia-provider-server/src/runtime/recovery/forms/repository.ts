import { MongoFormsRepository } from "@bernouy/forms/mongo";
import type { FormsRepository } from "@bernouy/forms";
import type { Db } from "mongodb";

/** Offering Forms does not initialize its collections before actual use or retained work. */
export function formsRepository(db: Db) {
    let pending: Promise<MongoFormsRepository> | undefined;
    const load = () =>
        (pending ??= MongoFormsRepository.open(db).catch((error) => {
            pending = undefined;
            throw error;
        }));
    const repository: FormsRepository = {
        create: async (...args) => (await load()).create(...args),
        get: async (...args) => (await load()).get(...args),
        list: async (...args) => (await load()).list(...args),
        change: async (...args) => (await load()).change(...args),
        publish: async (...args) => (await load()).publish(...args),
        version: async (...args) => (await load()).version(...args),
        admit: async (...args) => (await load()).admit(...args),
        replay: async (...args) => (await load()).replay(...args),
        insert: async (...args) => (await load()).insert(...args),
        submission: async (...args) => (await load()).submission(...args),
        submissions: async (...args) => (await load()).submissions(...args),
        replace: async (...args) => (await load()).replace(...args),
        due: async (...args) => (await load()).due(...args),
    };
    return { repository, hasWork: async () => Boolean(pending) || MongoFormsRepository.hasWork(db) };
}
