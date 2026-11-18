export type ProfilingClient = {
    db(): {
        databaseName: string;
        createCollection(name: string, options: Readonly<Record<string, unknown>>): Promise<unknown>;
        command(command: Readonly<Record<string, unknown>>): Promise<unknown>;
    };
    close(): Promise<void>;
};

/** Profiling must precede tenant writes without populating the host Control's pristine database. */
export function tenantProfiler(configuring: WeakSet<object>) {
    const profiles = new WeakMap<object, Promise<void>>();
    return async (client: ProfilingClient) => {
        const database = client.db();
        if (!/^ulvia_[a-z0-9_]{1,63}$/u.test(database.databaseName)) {
            return;
        }
        let pending = profiles.get(client);
        if (!pending) {
            pending = (async () => {
                configuring.add(client);
                try {
                    await database
                        .createCollection("system.profile", { capped: true, size: 67108864 })
                        .catch((error: unknown) => {
                            if ((error as { code?: number }).code !== 48) {
                                throw error;
                            }
                        });
                    await database.command({
                        profile: 2,
                        filter: {
                            $or: [
                                { "command.comment.ulviaPerformanceTrace": { $exists: true } },
                                { "originatingCommand.comment.ulviaPerformanceTrace": { $exists: true } },
                            ],
                        },
                    });
                } catch (error) {
                    profiles.delete(client);
                    await client.close().catch(() => {});
                    throw error;
                } finally {
                    configuring.delete(client);
                }
            })();
            profiles.set(client, pending);
        }
        await pending;
    };
}
