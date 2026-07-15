-- ============================================================
-- MIGRAÇÃO 2 - Funil Hotmart + métricas de clique/pageview do Meta
-- Execute no SQL Editor do Supabase (depois do schema.sql)
-- ============================================================

-- 1. Novas métricas do Meta (cliques no link e visualizações da LP)
alter table public.meta_insights
  add column if not exists link_clicks bigint not null default 0,
  add column if not exists landing_page_views bigint not null default 0;

-- 2. vw_campaign_daily ganha as novas colunas (no final, para o
--    create or replace funcionar)
create or replace view public.vw_campaign_daily as
select
  coalesce(m.date, s.date, r.date)                              as date,
  coalesce(m.campaign_id, s.campaign_id, r.campaign_id)         as campaign_id,
  m.campaign_name,
  coalesce(m.spend, 0)            as spend,
  coalesce(m.impressions, 0)      as impressions,
  coalesce(m.clicks, 0)           as clicks,
  coalesce(s.sales, 0)            as sales,
  coalesce(s.revenue, 0)          as revenue,
  coalesce(r.refunds, 0)          as refunds,
  coalesce(r.refunded_amount, 0)  as refunded_amount,
  coalesce(s.revenue, 0) - coalesce(r.refunded_amount, 0) as net_revenue,
  case when coalesce(m.spend, 0) > 0
       then round((coalesce(s.revenue, 0) - coalesce(r.refunded_amount, 0)) / m.spend, 2)
       else null end as roas,
  case when coalesce(s.sales, 0) > 0
       then round(coalesce(m.spend, 0) / s.sales, 2)
       else null end as cpa,
  coalesce(m.link_clicks, 0)         as link_clicks,
  coalesce(m.landing_page_views, 0)  as landing_page_views
from public.meta_insights m
full outer join public.vw_sales_daily s
  on s.date = m.date and s.campaign_id = m.campaign_id
full outer join public.vw_refunds_daily r
  on r.date = coalesce(m.date, s.date)
 and r.campaign_id = coalesce(m.campaign_id, s.campaign_id);

-- 3. Vendas por produto por dia (lado Hotmart, independente do Meta)
create or replace view public.vw_product_daily as
select
  (coalesce(approved_at, ordered_at, created_at) at time zone 'America/Sao_Paulo')::date as date,
  product_id,
  coalesce(product_name, '(sem nome)') as product_name,
  count(*) filter (where status in ('APPROVED','COMPLETE'))                   as sales,
  coalesce(sum(price) filter (where status in ('APPROVED','COMPLETE')), 0)    as revenue,
  count(*) filter (where status in ('REFUNDED','CHARGEBACK'))                 as refunds,
  coalesce(sum(price) filter (where status in ('REFUNDED','CHARGEBACK')), 0)  as refunded_amount,
  count(*) filter (where status = 'BILLET_PRINTED')                           as billets_pending
from public.sales
group by 1, 2, 3;

-- 4. Contagem de TODOS os eventos Hotmart por dia/produto/tipo
--    (carrinho abandonado, boleto gerado, compra aprovada, etc.)
create or replace view public.vw_hotmart_events_daily as
select
  (received_at at time zone 'America/Sao_Paulo')::date as date,
  product_id,
  coalesce(product_name, '(sem nome)') as product_name,
  event,
  count(*) as events
from public.hotmart_events
group by 1, 2, 3, 4;
