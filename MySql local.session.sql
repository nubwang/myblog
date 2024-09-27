
-- show index from staff;
-- create index idx_staff_name on staff(name);
-- show global status like 'Com_______';

-- use product_list;
-- show variables 

-- SHOW VARIABLES LIKE 'slow_query_log';
-- desc select age,sex,place_birth,name from staff where age='23';

-- select @@profiling;
-- set profiling = 1;
-- show profiles;
-- show index from staff;
-- create index idx_age_sex_pla on staff(age,sex,place_birth);

select count(distinct substring(name,1,1))/count(*) from staff;