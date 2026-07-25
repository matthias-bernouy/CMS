import { startProductionRepositoryServer } from "./production";
import { registerRepositoryShutdown } from "./shutdown";

const server = await startProductionRepositoryServer(process.env);
registerRepositoryShutdown(server);
