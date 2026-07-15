'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  buildDailySeries,
  buildCampaignSummaries,
  buildKpis,
  buildProductSummaries,
  buildHotmartDailySeries,
  countEvents,
  ABANDONED_EVENTS,
} from '@/lib/aggregate';
import type {
  CampaignDailyRow,
  CampaignSummary,
  HotmartEventDailyRow,
  ProductDailyRow,
} from '@/lib/types';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: v >= 1000 ? 0 : 2,
  });

const num = (v: number) => v.toLocaleString('pt-BR');

const fmtDate = (d: string) => {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
};

const displayName = (name: string) =>
  name === 'sem_atribuicao' ? 'Sem atribuição (orgânico/outros)' : name;

// Extrai a sigla de nomenclatura do nome da campanha, ex: "[L43] Desafio - CBO" -> "[L43]"
const extractTag = (name: string): string => {
  const match = name.match(/\[([^\]]+)\]/);
  return match ? `[${match[1].toUpperCase()}]` : 'Sem padrão';
};

const chartTooltipStyle = {
  background: '#121826',
  border: '1px solid #232d42',
  borderRadius: 8,
  color: '#e6eaf2',
};

interface Group {
  tag: string;
  campaignIds: string[];
  campaigns: number;
  sales: number;
  spend: number;
  netRevenue: number;
  roas: number | null;
  cpa: number | null;
}

type Tab = 'geral' | 'meta' | 'hotmart';

interface Props {
  days: number;
  periods: number[];
  rows: CampaignDailyRow[];
  products: ProductDailyRow[];
  events: HotmartEventDailyRow[];
}

export default function Dashboard({
  days,
  periods,
  rows,
  products,
  events,
}: Props) {
  const [tab, setTab] = useState<Tab>('geral');
  // Seleção múltipla de campanhas (abas Geral e Meta). Vazio = todas.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allCampaigns = useMemo(() => buildCampaignSummaries(rows), [rows]);

  const groups = useMemo<Group[]>(() => {
    const byTag = new Map<string, CampaignSummary[]>();
    for (const c of allCampaigns) {
      const tag =
        c.campaignId === 'sem_atribuicao'
          ? 'Sem atribuição'
          : extractTag(c.campaignName);
      const list = byTag.get(tag) ?? [];
      list.push(c);
      byTag.set(tag, list);
    }
    const result: Group[] = [];
    for (const [tag, list] of byTag) {
      const sales = list.reduce((s, c) => s + c.sales, 0);
      const spend = list.reduce((s, c) => s + c.spend, 0);
      const netRevenue = list.reduce((s, c) => s + c.netRevenue, 0);
      result.push({
        tag,
        campaignIds: list.map((c) => c.campaignId),
        campaigns: list.length,
        sales,
        spend,
        netRevenue,
        roas: spend > 0 ? netRevenue / spend : null,
        cpa: sales > 0 ? spend / sales : null,
      });
    }
    return result.sort((a, b) => b.sales - a.sales);
  }, [allCampaigns]);

  const filteredRows = useMemo(
    () =>
      selected.size === 0
        ? rows
        : rows.filter((r) => selected.has(r.campaign_id)),
    [rows, selected]
  );

  const filteredCampaigns = useMemo(
    () => buildCampaignSummaries(filteredRows),
    [filteredRows]
  );

  const kpis = useMemo(() => buildKpis(filteredRows), [filteredRows]);
  const dailySeries = useMemo(
    () => buildDailySeries(filteredRows),
    [filteredRows]
  );

  // ---- Métricas Meta (sobre a seleção) ----
  const meta = useMemo(() => {
    let spend = 0;
    let impressions = 0;
    let clicks = 0;
    let linkClicks = 0;
    let lpv = 0;
    for (const c of filteredCampaigns) {
      spend += c.spend;
      impressions += c.impressions;
      clicks += c.clicks;
      linkClicks += c.linkClicks;
      lpv += c.landingPageViews;
    }
    return {
      spend,
      impressions,
      clicks,
      linkClicks,
      lpv,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    };
  }, [filteredCampaigns]);

  // ---- Lado Hotmart (independente do Meta) ----
  const productSummaries = useMemo(
    () => buildProductSummaries(products, events),
    [products, events]
  );
  const hotmartSeries = useMemo(
    () => buildHotmartDailySeries(products, events),
    [products, events]
  );
  const hotmart = useMemo(() => {
    const sales = productSummaries.reduce((s, p) => s + p.sales, 0);
    const revenue = productSummaries.reduce((s, p) => s + p.revenue, 0);
    const refunds = productSummaries.reduce((s, p) => s + p.refunds, 0);
    const refundedAmount = productSummaries.reduce(
      (s, p) => s + p.refundedAmount,
      0
    );
    return {
      sales,
      revenue,
      refunds,
      refundedAmount,
      abandonedCarts: countEvents(events, ABANDONED_EVENTS),
      billets: countEvents(events, ['PURCHASE_BILLET_PRINTED']),
    };
  }, [productSummaries, events]);

  const profit = kpis.netRevenue - kpis.spend;
  const hasData = rows.length > 0;
  const hasHotmartData = products.length > 0 || events.length > 0;

  const isGroupSelected = (g: Group) =>
    g.campaignIds.length > 0 && g.campaignIds.every((id) => selected.has(id));

  const toggleGroup = (g: Group) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (isGroupSelected(g)) {
        g.campaignIds.forEach((id) => next.delete(id));
      } else {
        g.campaignIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleCampaign = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filterLabel =
    selected.size === 0
      ? 'Todas as campanhas'
      : `${selected.size} ${
          selected.size === 1 ? 'campanha selecionada' : 'campanhas selecionadas'
        }`;

  const groupCards = (
    <div className="group-section">
      <div className="group-header">
        <h2>Padrões de campanha</h2>
        {selected.size > 0 && (
          <button
            type="button"
            className="clear-filter"
            onClick={() => setSelected(new Set())}
          >
            Limpar seleção ({selected.size}) ✕
          </button>
        )}
      </div>
      <div className="group-grid">
        {groups.map((g) => (
          <button
            type="button"
            key={g.tag}
            className={`group-card ${
              isGroupSelected(g) ? 'group-selected' : ''
            }`}
            onClick={() => toggleGroup(g)}
          >
            <div className="group-tag">{g.tag}</div>
            <div className="group-sales">
              {num(g.sales)} <span>{g.sales === 1 ? 'venda' : 'vendas'}</span>
            </div>
            <div className="group-meta">
              <span>{brl(g.spend)} investido</span>
              <span>{brl(g.netRevenue)} faturado</span>
            </div>
            <div className="group-meta">
              <span>
                ROAS{' '}
                <b
                  className={
                    g.roas == null ? '' : g.roas >= 1 ? 'roas-good' : 'roas-bad'
                  }
                >
                  {g.roas != null ? g.roas.toFixed(2) : '—'}
                </b>
              </span>
              <span>
                {g.campaigns} {g.campaigns === 1 ? 'campanha' : 'campanhas'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const campaignTable = (columns: 'geral' | 'meta') => (
    <div className="card">
      <h2>
        {columns === 'geral'
          ? 'Vendas e performance por campanha'
          : 'Métricas Meta por campanha'}{' '}
        <span className="hint">(clique nas linhas para somar campanhas ao filtro)</span>
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            {columns === 'geral' ? (
              <tr>
                <th className="check-col"></th>
                <th>Campanha</th>
                <th>Vendas</th>
                <th>Investimento</th>
                <th>Faturamento líq.</th>
                <th>CPA</th>
                <th>ROAS</th>
                <th>Reemb.</th>
              </tr>
            ) : (
              <tr>
                <th className="check-col"></th>
                <th>Campanha</th>
                <th>Investimento</th>
                <th>Impressões</th>
                <th>Cliques</th>
                <th>Cliques no link</th>
                <th>Pageviews (LP)</th>
                <th>CTR</th>
                <th>CPC</th>
              </tr>
            )}
          </thead>
          <tbody>
            {allCampaigns.map((c) => {
              const isSel = selected.has(c.campaignId);
              const ctr =
                c.impressions > 0 ? (c.clicks / c.impressions) * 100 : null;
              const cpc = c.clicks > 0 ? c.spend / c.clicks : null;
              return (
                <tr
                  key={c.campaignId}
                  className={isSel ? 'row-selected' : 'row-clickable'}
                  onClick={() => toggleCampaign(c.campaignId)}
                >
                  <td className="check-col">
                    <input type="checkbox" checked={isSel} readOnly tabIndex={-1} />
                  </td>
                  <td className="campaign-name" title={c.campaignName}>
                    {displayName(c.campaignName)}
                  </td>
                  {columns === 'geral' ? (
                    <>
                      <td className="sales-count">{num(c.sales)}</td>
                      <td>{brl(c.spend)}</td>
                      <td>{brl(c.netRevenue)}</td>
                      <td>{c.cpa != null ? brl(c.cpa) : '—'}</td>
                      <td
                        className={
                          c.roas == null
                            ? 'dim'
                            : c.roas >= 1
                            ? 'roas-good'
                            : 'roas-bad'
                        }
                      >
                        {c.roas != null ? c.roas.toFixed(2) : '—'}
                      </td>
                      <td className="dim">{num(c.refunds)}</td>
                    </>
                  ) : (
                    <>
                      <td>{brl(c.spend)}</td>
                      <td className="dim">{num(c.impressions)}</td>
                      <td>{num(c.clicks)}</td>
                      <td>{num(c.linkClicks)}</td>
                      <td>{num(c.landingPageViews)}</td>
                      <td className="dim">
                        {ctr != null ? `${ctr.toFixed(2)}%` : '—'}
                      </td>
                      <td className="dim">{cpc != null ? brl(cpc) : '—'}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>Dashboard de Vendas — Italo</h1>
          <p>
            Meta Ads x Hotmart · últimos {days} dias
            {tab !== 'hotmart' ? ` · ${filterLabel}` : ''}
          </p>
        </div>
        <nav className="period-selector">
          {periods.map((p) => (
            <a
              key={p}
              href={`/?periodo=${p}`}
              className={p === days ? 'active' : ''}
            >
              {p}d
            </a>
          ))}
        </nav>
      </div>

      <nav className="tabs">
        <button
          type="button"
          className={tab === 'geral' ? 'active' : ''}
          onClick={() => setTab('geral')}
        >
          Visão Geral
        </button>
        <button
          type="button"
          className={tab === 'meta' ? 'active' : ''}
          onClick={() => setTab('meta')}
        >
          Meta Ads
        </button>
        <button
          type="button"
          className={tab === 'hotmart' ? 'active' : ''}
          onClick={() => setTab('hotmart')}
        >
          Hotmart
        </button>
      </nav>

      {/* ============ ABA VISÃO GERAL (cruzamento Meta x Hotmart) ============ */}
      {tab === 'geral' && (
        <>
          {hasData && groupCards}

          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="label">Vendas</div>
              <div className="value">{num(kpis.sales)}</div>
              <div className="sub">CPA {kpis.cpa != null ? brl(kpis.cpa) : '—'}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Investimento (Meta)</div>
              <div className="value">{brl(kpis.spend)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Faturamento Líquido</div>
              <div className="value">{brl(kpis.netRevenue)}</div>
              <div className="sub">bruto {brl(kpis.revenue)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Lucro</div>
              <div className={`value ${profit >= 0 ? 'positive' : 'negative'}`}>
                {brl(profit)}
              </div>
            </div>
            <div className="kpi-card">
              <div className="label">ROAS</div>
              <div
                className={`value ${
                  kpis.roas != null && kpis.roas >= 1 ? 'positive' : 'negative'
                }`}
              >
                {kpis.roas != null ? kpis.roas.toFixed(2) : '—'}
              </div>
            </div>
            <div className="kpi-card">
              <div className="label">Reembolsos</div>
              <div className="value">{num(kpis.refunds)}</div>
              <div className="sub">{brl(kpis.refundedAmount)}</div>
            </div>
          </div>

          {!hasData ? (
            <div className="card">
              <div className="empty-state">
                Nenhum dado no período ainda.
                <br />
                Confira se os workflows do n8n estão ativos e se o webhook da
                Hotmart está cadastrado.
              </div>
            </div>
          ) : (
            <>
              <div className="card">
                <h2>Investimento x Faturamento por dia — {filterLabel}</h2>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={dailySeries}>
                    <CartesianGrid stroke="#232d42" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtDate}
                      stroke="#8b95ab"
                      fontSize={12}
                    />
                    <YAxis yAxisId="money" stroke="#8b95ab" fontSize={12} />
                    <YAxis
                      yAxisId="sales"
                      orientation="right"
                      stroke="#fbbf24"
                      fontSize={12}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelFormatter={(l) => fmtDate(String(l))}
                      formatter={(value: number, name: string) =>
                        name === 'Vendas'
                          ? [num(value), name]
                          : [brl(value), name]
                      }
                    />
                    <Legend />
                    <Bar
                      yAxisId="money"
                      dataKey="spend"
                      name="Investimento"
                      fill="#60a5fa"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      yAxisId="money"
                      dataKey="netRevenue"
                      name="Faturamento líquido"
                      fill="#34d399"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="sales"
                      type="monotone"
                      dataKey="sales"
                      name="Vendas"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {campaignTable('geral')}
            </>
          )}
        </>
      )}

      {/* ============ ABA META ADS (só dados do Meta) ============ */}
      {tab === 'meta' && (
        <>
          {hasData && groupCards}

          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="label">Investimento</div>
              <div className="value">{brl(meta.spend)}</div>
              <div className="sub">
                CPM {meta.cpm != null ? brl(meta.cpm) : '—'}
              </div>
            </div>
            <div className="kpi-card">
              <div className="label">Impressões</div>
              <div className="value">{num(meta.impressions)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Cliques</div>
              <div className="value">{num(meta.clicks)}</div>
              <div className="sub">
                CPC {meta.cpc != null ? brl(meta.cpc) : '—'}
              </div>
            </div>
            <div className="kpi-card">
              <div className="label">Cliques no link</div>
              <div className="value">{num(meta.linkClicks)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Pageviews (LP)</div>
              <div className="value">{num(meta.lpv)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">CTR</div>
              <div className="value">
                {meta.ctr != null ? `${meta.ctr.toFixed(2)}%` : '—'}
              </div>
            </div>
          </div>

          {!hasData ? (
            <div className="card">
              <div className="empty-state">
                Sem dados do Meta ainda. Execute o workflow de sync no n8n.
              </div>
            </div>
          ) : (
            <>
              <div className="card">
                <h2>Investimento x Cliques por dia — {filterLabel}</h2>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart
                    data={dailySeries.map((d) => {
                      const dayRows = filteredRows.filter(
                        (r) => r.date === d.date
                      );
                      return {
                        date: d.date,
                        spend: d.spend,
                        clicks: dayRows.reduce(
                          (s, r) => s + (Number(r.clicks) || 0),
                          0
                        ),
                        lpv: dayRows.reduce(
                          (s, r) => s + (Number(r.landing_page_views) || 0),
                          0
                        ),
                      };
                    })}
                  >
                    <CartesianGrid stroke="#232d42" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtDate}
                      stroke="#8b95ab"
                      fontSize={12}
                    />
                    <YAxis yAxisId="money" stroke="#8b95ab" fontSize={12} />
                    <YAxis
                      yAxisId="count"
                      orientation="right"
                      stroke="#fbbf24"
                      fontSize={12}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelFormatter={(l) => fmtDate(String(l))}
                      formatter={(value: number, name: string) =>
                        name === 'Investimento'
                          ? [brl(value), name]
                          : [num(value), name]
                      }
                    />
                    <Legend />
                    <Bar
                      yAxisId="money"
                      dataKey="spend"
                      name="Investimento"
                      fill="#60a5fa"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="clicks"
                      name="Cliques"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="lpv"
                      name="Pageviews (LP)"
                      stroke="#34d399"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {campaignTable('meta')}
            </>
          )}
        </>
      )}

      {/* ============ ABA HOTMART (só dados da Hotmart, por produto) ============ */}
      {tab === 'hotmart' && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="label">Vendas</div>
              <div className="value">{num(hotmart.sales)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Receita</div>
              <div className="value">{brl(hotmart.revenue)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Carrinhos abandonados</div>
              <div className="value">{num(hotmart.abandonedCarts)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Boletos/Pix gerados</div>
              <div className="value">{num(hotmart.billets)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Reembolsos</div>
              <div className="value">{num(hotmart.refunds)}</div>
              <div className="sub">{brl(hotmart.refundedAmount)}</div>
            </div>
          </div>

          {!hasHotmartData ? (
            <div className="card">
              <div className="empty-state">
                Nenhum evento da Hotmart no período.
                <br />
                Confira se o webhook está cadastrado na Hotmart e se a migração
                migration-2-funil.sql foi executada no Supabase.
              </div>
            </div>
          ) : (
            <>
              <div className="card">
                <h2>Vendas x Carrinhos abandonados por dia</h2>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={hotmartSeries}>
                    <CartesianGrid stroke="#232d42" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtDate}
                      stroke="#8b95ab"
                      fontSize={12}
                    />
                    <YAxis yAxisId="money" stroke="#8b95ab" fontSize={12} />
                    <YAxis
                      yAxisId="count"
                      orientation="right"
                      stroke="#fbbf24"
                      fontSize={12}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelFormatter={(l) => fmtDate(String(l))}
                      formatter={(value: number, name: string) =>
                        name === 'Receita' ? [brl(value), name] : [num(value), name]
                      }
                    />
                    <Legend />
                    <Bar
                      yAxisId="money"
                      dataKey="revenue"
                      name="Receita"
                      fill="#34d399"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="sales"
                      name="Vendas"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="abandonedCarts"
                      name="Carrinhos abandonados"
                      stroke="#f87171"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <h2>Por produto</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Vendas</th>
                        <th>Receita</th>
                        <th>Carrinhos aband.</th>
                        <th>Boletos/Pix pend.</th>
                        <th>Reembolsos</th>
                        <th>Valor reemb.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productSummaries.map((p) => (
                        <tr key={`${p.productId ?? p.productName}`}>
                          <td className="campaign-name" title={p.productName}>
                            {p.productName}
                          </td>
                          <td className="sales-count">{num(p.sales)}</td>
                          <td>{brl(p.revenue)}</td>
                          <td className="dim">{num(p.abandonedCarts)}</td>
                          <td className="dim">{num(p.billetsPending)}</td>
                          <td className="dim">{num(p.refunds)}</td>
                          <td className="dim">{brl(p.refundedAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
