# Workspace tests

Cross-component and image tests live here. Package-owned unit and integration
tests remain in `packages/*/tests`; architecture and CI tooling tests remain in
`quality/`.

- [`performance/repository`](performance/repository): catalogue HTTP and admission work budgets.
- [`images/edge`](images/edge): stateless Edge image boundary checks.
- [`images/provider`](images/provider): stateful Provider image boundary checks.
- [`images/official-repository`](images/official-repository): image boundary,
  real-container restart and owner-authorized CLI publication tests.
- [`integration/instance`](integration/instance/README.md): the complete local
  instance journey, including MCP, collections, files, Provider connections,
  observability, rotation and revocation.

Run from the workspace root:

```sh
bun test ./tests
```

Static image checks run without Docker. Container journeys are opt-in and skip
unless their image variables are supplied. With matching local images built:

```sh
ULVIA_MCP_EDGE_DOCKER_IMAGE=docker.io/cyaxis/ulvia-edge:0.1.0-integration \
ULVIA_MCP_PROVIDER_DOCKER_IMAGE=docker.io/cyaxis/ulvia-provider:0.1.0-integration \
ULVIA_REPOSITORY_DOCKER_IMAGE=docker.io/cyaxis/ulvia-official-repository:0.1.0-integration \
bun test ./tests
```

See the [instance suite guide](integration/instance/README.md) for prerequisites
and image build commands. Dockerfiles and packaging remain under `infra/`.
