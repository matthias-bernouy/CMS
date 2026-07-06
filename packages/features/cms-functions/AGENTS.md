# @bernouy/cms-functions

Declarative function feature package. Functions project trusted workflows as
reserved system source endpoints.

## Boundaries

- Root export exposes function contracts, validation, execution, source
  projection, and in-memory repositories.
- This package may depend on `@bernouy/cms-sources` contracts and execution
  helpers.
- Do not import surfaces, runtimes, concrete auth stores, or integration
  registries here.

## Rules

- Keep the DSL declarative. Do not add executable user code or sandboxed
  JavaScript.
- Function execution must call declared source endpoints through injected
  repositories and executor dependencies, never raw URLs.
- System functions are privileged endpoints. Validation must keep v1 bounded:
  JSON calls only, no function-to-function calls, no side-effecting calls inside
  GET functions, and small call-count/body budgets.
