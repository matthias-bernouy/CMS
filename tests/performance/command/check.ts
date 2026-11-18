import { performancePlan } from "./planning";

const plan = await performancePlan();
console.log(
    `Performance plan: ${plan.inventory.targets.length} executors, ${plan.scenarios.length} scenarios, no missing definitions or budgets.`,
);
