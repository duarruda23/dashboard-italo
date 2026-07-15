# Dashboard de Vendas — Italo

Meta Ads (gasto por campanha) x Hotmart (vendas via webhook) em um dashboard Next.js, com n8n como backend de integração e Supabase como banco.

```
Meta Graph API ──(n8n, a cada 6h)──►┐
                                    ├──► Supabase ──► Dashboard Next.js
Hotmart Webhook ──(n8n, tempo real)─┘
```

## Estrutura

| Pasta/arquivo | O que é |
|---|---|
| `supabase/schema.sql` | Tabelas, views e RLS |
| `n8n/hotmart-webhook.json` | Workflow: recebe TODOS os eventos da Hotmart |
| `n8n/meta-ads-sync.json` | Workflow: puxa insights do Meta a cada 6h |
| `dashboard/` | App Next.js 14 (App Router + recharts) |

## Setup (nesta ordem)

### 1. Supabase
1. Crie um projeto em https://supabase.com
2. SQL Editor → cole e execute `supabase/schema.sql`
3. Anote: **Project URL** e **Service Role Key** (Settings → API)

### 2. Variáveis de ambiente do n8n
Adicione ao ambiente da sua instância n8n (docker-compose, .env etc.):

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
HOTMART_HOTTOK=SEU_HOTTOK_AQUI
META_AD_ACCOUNT_ID=1234567890        # sem o prefixo act_
META_ACCESS_TOKEN=EAAB...            # token longa duração com ads_read
```

Reinicie o n8n após adicionar.

### 3. Workflow do webhook Hotmart
1. n8n → Import from File → `n8n/hotmart-webhook.json`
2. Ative o workflow e copie a **URL de produção** do node Webhook (termina em `/webhook/hotmart`)
3. Na Hotmart: **Ferramentas → Webhook (API e Notificações)** → cadastre a URL, versão **2.0.0**, e marque **todos os eventos** (o workflow é catch-all: eventos de qualquer produto, atual ou futuro, ficam salvos em `hotmart_events`; eventos de compra também viram linhas em `sales`)
4. Copie o **Hottok** mostrado nessa tela para a env `HOTMART_HOTTOK`

### 4. Workflow do Meta Ads
1. Import from File → `n8n/meta-ads-sync.json`
2. Token: em https://developers.facebook.com crie um app → System User no Business Manager → gere token com permissão `ads_read` (sem expiração)
3. **Backfill inicial:** no node "Buscar Insights Meta", troque `date_preset` de `last_7d` para `maximum`, execute manualmente 1x, e volte para `last_7d`
4. Ative o workflow (roda a cada 6h)

### 5. Atribuição (obrigatório para ROAS por campanha)
Nos anúncios do Meta, configure os **parâmetros de URL** apontando para o checkout/página com:

```
src=meta&sck=meta|{{campaign.id}}|{{adset.id}}|{{ad.id}}
```

A Hotmart propaga `src`/`sck` até o webhook, e o workflow extrai campaign/adset/ad. Vendas sem `sck` aparecem como "Sem atribuição" no dashboard.

> Importante: o parâmetro precisa chegar até a URL do checkout da Hotmart (pay.hotmart.com/...). Se houver página intermediária (LP), repasse os parâmetros no botão de compra.

### 6. Dashboard
```bash
cd dashboard
cp .env.example .env.local   # preencha com os dados do Supabase
npm install
npm run dev                  # http://localhost:3000
```

Deploy: Vercel (adicione `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nas env vars do projeto). A página revalida a cada 5 min e tem filtro de período (7/14/30/90 dias).

## O que o dashboard mostra
KPIs do período (investimento, faturamento bruto/líquido, lucro, ROAS, vendas, CPA, reembolsos), gráfico diário de investimento x faturamento com linha de vendas, e tabela por campanha com ROAS e CPA calculados sobre o faturamento líquido (bruto − reembolsos/chargebacks).

## Como os dados fluem
1. **Hotmart** dispara webhook → n8n valida o Hottok → salva o evento bruto em `hotmart_events` (dedup por `event_id`) → se for `PURCHASE_*`, faz upsert em `sales` por `transaction` (campos vazios não sobrescrevem dados já gravados — um `PURCHASE_COMPLETE` não apaga o `sck` capturado no `APPROVED`)
2. **Meta**: a cada 6h o n8n puxa insights por campanha dos últimos 7 dias (`time_increment=1`, com paginação) e faz upsert em `meta_insights` por `(date, campaign_id)`
3. A view `vw_campaign_daily` cruza gasto x vendas por campanha/dia (fuso America/Sao_Paulo) e o Next.js lê direto dela

## Solução de problemas
- **Webhook retorna 200 mas nada aparece no banco**: veja Executions no n8n; se falhou com "Hottok inválido", confira a env `HOTMART_HOTTOK`
- **Vendas todas "sem atribuição"**: o `sck` não está chegando ao checkout — verifique os parâmetros de URL dos anúncios e o repasse na LP
- **Meta sync falha com erro 190**: token expirado — gere um token de System User (não expira)
- **Dashboard vazio**: confira `.env.local` e se o schema foi executado no Supabase
