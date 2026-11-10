-- Exact row count of every table in public, one "table|count" line each (psql -At). Used to compare a
-- restored or moved database with its source; pg_stat estimates are not good enough for that.
select format('select %L || ''|'' || count(*) from public.%I', table_name, table_name)
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name
\gexec
