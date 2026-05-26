/**
 * @bernouy/cms/repository — the persistence layer in isolation.
 *
 * A lean entry exposing only the `CmsRepository` contract + its Mongo/in-memory
 * implementations + the `TSystem` model. Consumers that need the store WITHOUT
 * the editor / delivery / Playwright weight of the main barrel (e.g. the
 * `cms-control` data-provider) import from here.
 */
export { MongoCmsRepository } from "./src/socle/default-implementation/CmsRepository/mongodb";
export { InMemoryCmsRepository } from "./src/socle/default-implementation/CmsRepository/memory";
export type { CmsRepository } from "./src/socle/interfaces/CmsRepository";
export type { TSystem } from "./src/socle/interfaces/models";
