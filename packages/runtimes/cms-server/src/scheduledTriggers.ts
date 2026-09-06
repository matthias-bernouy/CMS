import type { UsersRepository } from "@bernouy/cms-auth";
import type { FunctionRepository } from "@bernouy/cms-functions";
import type { IntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { createNotificationScheduledTask, NOTIFICATION_SCHEDULED_TASK_ID } from "@bernouy/cms-notifications";
import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";
import { startScheduledTriggers, type ScheduledTriggerRunner, type TriggerRepository } from "@bernouy/cms-triggers";

export function startProductionScheduledTriggers(options: {
    enabled?: boolean;
    functions: FunctionRepository;
    sources: SourceRepository;
    deps: ExecutorDeps;
    users: UsersRepository<string>;
    installations: IntegrationInstallationRepository;
    triggers: TriggerRepository;
}): ScheduledTriggerRunner {
    if (options.enabled === false) {
        return {
            ready: Promise.resolve(),
            async runNow(triggerId) {
                return { triggerId, runId: "", status: "disabled", durationMs: 0 };
            },
            async stop() {},
        };
    }
    const notificationTask = createNotificationScheduledTask(options);
    return startScheduledTriggers({
        ...options,
        workerId: `cms-production:${crypto.randomUUID()}`,
        tasks: new Map([[NOTIFICATION_SCHEDULED_TASK_ID, notificationTask]]),
    });
}
