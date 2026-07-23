import type { UsersRepository } from "@bernouy/cms-auth";
import type { FunctionRepository } from "@bernouy/cms-functions";
import type { IntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { createNotificationScheduledTask, NOTIFICATION_SCHEDULED_TASK_ID } from "@bernouy/cms-notifications";
import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";
import { startScheduledTriggers, type ScheduledTriggerRunner, type TriggerRepository } from "@bernouy/cms-triggers";

export function startDevScheduledTriggers(options: {
    functions: FunctionRepository;
    sources: SourceRepository;
    deps: ExecutorDeps;
    users: UsersRepository<string>;
    installations: IntegrationInstallationRepository;
    triggers: TriggerRepository;
}): ScheduledTriggerRunner {
    const notificationTask = createNotificationScheduledTask(options);
    return startScheduledTriggers({
        ...options,
        workerId: `p9r-dev:${process.pid}:${crypto.randomUUID()}`,
        tasks: new Map([[NOTIFICATION_SCHEDULED_TASK_ID, notificationTask]]),
    });
}
