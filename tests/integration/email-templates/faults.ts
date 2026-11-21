import type { Db } from "mongodb";
export type PublicationFault = {
    stage?: "after-reserve" | "before-insert" | "after-insert" | "before-commit" | "after-commit";
};

/** Real Mongo operations with one process failure injected before or after an acknowledged write. */
export function interruptedDatabase(db: Db, fault: PublicationFault): Db {
    return new Proxy(db, {
        get(target, key) {
            if (key !== "collection") {
                const value = Reflect.get(target, key, target);
                return typeof value === "function" ? value.bind(target) : value;
            }
            return (name: string) => {
                const collection = target.collection(name);
                return new Proxy(collection, {
                    get(target, key) {
                        const method = Reflect.get(target, key, target);
                        if (typeof method !== "function") {
                            return method;
                        }
                        if (!["findOneAndUpdate", "insertOne", "updateOne"].includes(String(key))) {
                            return method.bind(target);
                        }
                        return async (...args: unknown[]) => {
                            const operation = args[1] as { $unset?: { pendingPublication?: unknown } } | undefined;
                            const reserve = name === "email_templates_v1" && key === "findOneAndUpdate";
                            const insert = name === "email_template_publications_v1" && key === "insertOne";
                            const commit =
                                name === "email_templates_v1" &&
                                key === "updateOne" &&
                                operation?.$unset?.pendingPublication !== undefined;
                            const stage = fault.stage;
                            const before =
                                (insert && stage === "before-insert") || (commit && stage === "before-commit");
                            const after =
                                (reserve && stage === "after-reserve") ||
                                (insert && stage === "after-insert") ||
                                (commit && stage === "after-commit");
                            if (before || after) {
                                fault.stage = undefined;
                            }
                            if (before) {
                                throw new Error("Injected process failure");
                            }
                            const result = await Reflect.apply(method, target, args);
                            if (after) {
                                throw new Error("Injected process failure");
                            }
                            return result;
                        };
                    },
                });
            };
        },
    });
}
