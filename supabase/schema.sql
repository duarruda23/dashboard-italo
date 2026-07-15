-- ============================================================
-- DASHBOARD DE VENDAS - ITALO
-- Schema Supabase: eventos Hotmart + insights Meta Ads
-- Execute no SQL Editor do Supabase (uma vez)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Eventos brutos da Hotmart (catch-all: todos os eventos,
--    de todos os produtos, atuais e futuros)
-- ------------------------------------------------------------
create table if not exists public.hotmart_events (
  id            bigint generated always as identity primary key,
  event_id      text unique,                 -- id do evento enviado pela Hotmart (dedup em retries)
  event         text not null,               -- ex: PURCHASE_APPROVED, SUBSCRIPTION_CANCELLATION...
  version       text,
  product_id    bigint,
  product_name  text,
  transaction   text,
  payload       jsonb not null,              -- payload completo, nada se perde
  received_at   timestamptz not null default now()
);

create index if not exists idx_hotmart_events_event on public.hotmart_events (event);
create index if not exists idx_hotmart_events_transaction on public.hotmart_events (transaction);
create index if not exists idx_hotmart_events_received_at on public.hotmart_events (received_at);

-- ------------------------------------------------------------
-- 2. Vendas (estado atual por transação, alimentado pelo webhook)
-- ------------------------------------------------------------
create table if not exists public.sales (
  transaction      text primary key,          -- ex: HP17264788381258
  product_id       bigint,
  product_name     text,
  buyer_email      text,
  buyer_name       text,
  status           text not null,             -- APPROVED | COMPLETE | REFUNDED | CHARGEBACK | CANCELED | BILLET_PRINTED | EXPIRED | DELAYED | PROTEST
  price            numeric(12,2),
  currency         text default 'BRL',
  payment_type     text,                      -- CREDIT_CARD, BILLET, PIX...
  src              text,                      -- ?src= do checkout (xcod no webhook)
  sck              text,                      -- ?sck= do checkout (ex: meta|123|456|789)
  utm_campaign_id  text,                      -- extraído do sck
  utm_adset_id     text,
  utm_ad_id        text,
  ordered_at       timestamptz,
  approved_at      timestamptz,
  refunded_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_sales_status on public.sales (status);
create index if not exists idx_sales_product on public.sales (product_id);
create index if not exists idx_sales_campaign on public.sales (utm_campaign_id);
create index if not exists idx_sales_approved_at on public.sales (approved_at);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_sales_updated_at on public.sales;
create trigger trg_sales_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. Insights do Meta Ads (1 linha por campanha por dia)
-- ------------------------------------------------------------
create table if not exists public.meta_insights (
  date           date not null,
  campaign_id    text not null,
  campaign_name  text,
  spend          numeric(12,2) not null default 0,
  impressions    bigint not null default 0,
  clicks         bigint not null default 0,
  ctr            numeric(8,4),
  cpm            numeric(12,4),
  cpc            numeric(12,4),
  synced_at      timestamptz not null default now(),
  primary key (date, campaign_id)
);

create index if not exists idx_meta_insights_date on public.meta_insights (date);

-- ------------------------------------------------------------
-- 4. Views para o dashboard
-- ------------------------------------------------------------

-- Vendas agregadas por dia e campanha (receita pela data de aprovação,
-- reembolso pela data do reembolso)
create or replace view public.vw_sales_daily as
select
  (approved_at at time zone 'America/Sao_Paulo')::date as date,
  coalesce(utm_campaign_id, 'sem_atribuicao')          as campaign_id,
  count(*) filter (where status in ('APPROVED','COMPLETE'))      as sales,
  coalesce(sum(price) filter (where status in ('APPROVED','COMPLETE')), 0) as revenue
from public.sales
where approved_at is not null
group by 1, 2;

create or replace view public.vw_refunds_daily as
select
  (refunded_at at time zone 'America/Sao_Paulo')::date as date,
  coalesce(utm_campaign_id, 'sem_atribuicao')          as campaign_id,
  count(*)                as refunds,
  coalesce(sum(price), 0) as refunded_amount
from public.sales
where refunded_at is not null
  and status in ('REFUNDED','CHARGEBACK')
group by 1, 2;

-- Performance consolidada por campanha e dia: gasto Meta x vendas Hotmart
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
       else null end as cpa
from public.meta_insights m
full outer join public.vw_sales_daily s
  on s.date = m.date and s.campaign_id = m.campaign_id
full outer join public.vw_refunds_daily r
  on r.date = coalesce(m.date, s.date)
 and r.campaign_id = coalesce(m.campaign_id, s.campaign_id);

-- ------------------------------------------------------------
-- 5. Segurança: RLS ligado, sem policy pública.
--    n8n e o dashboard usam a SERVICE ROLE KEY (server-side).
-- ------------------------------------------------------------
alter table public.hotmart_events enable row level security;
alter table public.sales          enable row level security;
alter table public.meta_insights  enable row level security;
