# @bernouy/ulvia-providers

Ulvia Provider declarations and execution models, independent from administrative
workflows and persistence implementations.

| Export | Responsibility |
| --- | --- |
| `.` | Manifest definitions, parsing, admission and delegation rules. |
| `./compatibility` | Descriptive manifest comparison. |
| `./catalogue` | Manifest metadata and `ProviderManifestReader`. |
| `./installations` | Connection/report models, validation, readiness and `ProviderInstallationReader`. |
| `./selections` | Exact selection models, grants, graph validation and `ContractSelectionReader`. |
| `./validation` | Shared validation primitives for feature-owned workflows and stores. |

Full mutation interfaces extend these read ports in `@bernouy/repository`.
That feature retains `ProviderInstallationLifecycle`, `ProviderManagement`,
connection workflows, `ContractUpgradeService`, persistent catalogues and stores.
Gateway uses only Platform read ports and validation rules.
