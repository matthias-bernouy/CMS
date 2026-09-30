# @bernouy/ulvia-cli

Local development launcher for CmsCore.

```bash
bun run ulvia -- dev
bun run ulvia -- dev status
bun run ulvia -- dev credentials
bun run ulvia -- dev stop
```

The runtime stores generated credentials, CMS files, and MongoDB data below
`ULVIA_DATA_DIR` or the platform data directory. `dev` starts a loopback
repository on port 5102 and loads declarative folders from
`packages/resources/collections/`. The collection catalogue is read at startup;
restart `dev` after editing a resource. The CLI does not publish to a remote
registry or run the removed integration repository/Supabase bridge.
