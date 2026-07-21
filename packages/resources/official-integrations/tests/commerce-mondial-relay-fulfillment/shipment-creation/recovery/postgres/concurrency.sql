create trigger shipment_creation_concurrency_probe
after insert or update on commerce.shipment_creation_operations
for each row execute function
    shipment_creation_concurrency_test.observe_mutation();

\ir reserve.sql
\ir completion.sql

drop trigger shipment_creation_concurrency_probe
    on commerce.shipment_creation_operations;
drop schema shipment_creation_concurrency_test cascade;
