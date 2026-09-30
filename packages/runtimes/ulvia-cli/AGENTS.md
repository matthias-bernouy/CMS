# @bernouy/ulvia-cli

Local Ulvia CMS development runtime.

## Responsibilities

- Start the local CMS and its MongoDB dependency.
- Keep local runtime data and generated credentials private and persistent.
- Expose lifecycle commands for starting, inspecting, and stopping the stack.

## Rules

- CLI commands, help text, errors, and tests are written in English.
- Bind development-only services to loopback interfaces.
- Never print session secrets, encryption keys, or infrastructure credentials.
- Keep external process invocation behind the runtime process abstraction.
- The local collection repository reads declarative JSON folders and binds only
  to loopback. Do not reintroduce the removed integration repository or Supabase bridge.
