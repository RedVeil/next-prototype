-- Repayment history closes a fraction of the remaining gap instead of subtracting a flat amount.
-- A stored seller weight of 100 is the old flat default, so it becomes a 10 percent step.

update public.risk_parameters
set label = 'Percent of the remaining gap closed per repaid invoice as seller'
where key = 'repaid_seller_points';

update public.risk_parameters
set weight = 10
where key = 'repaid_seller_points' and weight = 100;

update public.risk_parameters
set label = 'Percent of the remaining gap closed per repaid invoice as obligor'
where key = 'repaid_obligor_points';

insert into public.risk_parameters (key, label, weight, sort)
values ('score_floor', 'Lowest score repayment history can reach', 0, 5)
on conflict (key) do nothing;
