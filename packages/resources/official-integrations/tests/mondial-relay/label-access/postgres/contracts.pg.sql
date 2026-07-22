\set ON_ERROR_STOP on

\if :{?run_label_access_install_contract}
    \if :run_label_access_install_contract
        \ir install.pg.sql
    \endif
\endif

\ir fixture.sql
\ir security.sql
\ir behavior.sql
\ir freshness.sql
