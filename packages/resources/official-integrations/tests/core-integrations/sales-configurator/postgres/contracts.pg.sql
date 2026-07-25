\set ON_ERROR_STOP on
set statement_timeout = '20s';

\ir install.pg.sql
\ir cases/fixture.pg.sql
\ir cases/security.pg.sql
\ir cases/catalog.pg.sql
\ir cases/ownership.pg.sql
\ir cases/draft-lifecycle.pg.sql
\ir cases/sharing.pg.sql
\ir :cms_integration_schema_bundle
\ir reinstall.pg.sql
\ir cleanup.pg.sql
