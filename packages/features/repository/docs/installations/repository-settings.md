# Site Repository settings

The setup assistant offers a Repository address, the official Repository
(`https://repo.ulvia.fr`), or a new Repository hosted by this instance.
The address is stored per instance and applies to future discovery and imports.
Installed contracts, collections and Pages keep their exact pins.

`initialization.repository.get` reads settings and the Registry creation status.
`initialization.repository.configure` changes the address with one atomic
revision-checked write. It is naturally idempotent and never installs Registry.
It has no background SDK worker or pending-choice journal.

`initialization.repository.create` creates or resumes this instance's Repository.
The HTTP command awaits the durable instance transition. That transition alone
owns its lease, completed steps, failures and recovery; no SDK operation is queued
in parallel. It selects Registry and commits the instance's own URL on completion.
A lost HTTP response can be followed by a status read or an explicit retry.

Registry is chosen from the instance's already approved manifest. A newer image
must retain executable support for that exact pin, but its own bootstrap manifest
is not used to replace the installed system. Missing admitted resources or
unsupported implementations refuse without a network fallback or implicit upgrade.

Only current local administrators can read or change settings. Creation recovery
rechecks that administrator's grant. Delegated and system callers are refused.
Credentials, queries and fragments are forbidden in address settings.

Registry enablement follows installed contracts, never the URL's hostname.
The catalogue starts empty; publication is a separate authenticated action.
An empty site can complete setup without contacting the selected Repository.
