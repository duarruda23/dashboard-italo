import type {
  CampaignDailyRow,
  CampaignSummary,
  DailyPoint,
  HotmartEventDailyRow,
  Kpis,
  ProductDailyRow,
  ProductSummary,
} from './types';

// Helpers de agregação puros (sem import do Supabase) — seguros para
// usar tanto no server quanto no client component.

export const ABANDONED_EVENTS = [
  'PURCHASE_OUT_OF_SHOPPING_CART',
  'CART_ABANDONMENT',
];

export function buildDailySeries(rows: CampaignDailyRow[]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  for (const r of rows) {
    const p = byDate.get(r.date) ?? {
      date: r.date,
      spend: 0,
      revenue: 0,
      netRevenue: 0,
      sales: 0,
    };
    p.spend += Number(r.spend) || 0;
    p.revenue += Number(r.revenue) || 0;
    p.netRevenue += Number(r.net_revenue) || 0;
    p.sales += Number(r.sales) || 0;
    byDate.set(r.date, p);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildCampaignSummaries(
  rows: CampaignDailyRow[]
): CampaignSummary[] {
  const byCampaign = new Map<string, CampaignSummary>();
  for (const r of rows) {
    const key = r.campaign_id;
    const c = byCampaign.get(key) ?? {
      campaignId: key,
      campaignName: r.campaign_name ?? key,
      spend: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      landingPageViews: 0,
      sales: 0,
      revenue: 0,
      refunds: 0,
      refundedAmount: 0,
      netRevenue: 0,
      roas: null as number | null,
      cpa: null as number | null,
    };
    if (r.campaign_name) c.campaignName = r.campaign_name;
    c.spend += Number(r.spend) || 0;
    c.impressions += Number(r.impressions) || 0;
    c.clicks += Number(r.clicks) || 0;
    c.linkClicks += Number(r.link_clicks) || 0;
    c.landingPageViews += Number(r.landing_page_views) || 0;
    c.sales += Number(r.sales) || 0;
    c.revenue += Number(r.revenue) || 0;
    c.refunds += Number(r.refunds) || 0;
    c.refundedAmount += Number(r.refunded_amount) || 0;
    c.netRevenue += Number(r.net_revenue) || 0;
    byCampaign.set(key, c);
  }
  for (const c of byCampaign.values()) {
    c.roas = c.spend > 0 ? c.netRevenue / c.spend : null;
    c.cpa = c.sales > 0 ? c.spend / c.sales : null;
  }
  return [...byCampaign.values()].sort((a, b) => b.sales - a.sales);
}

export function buildKpis(rows: CampaignDailyRow[]): Kpis {
  const k: Kpis = {
    spend: 0,
    revenue: 0,
    netRevenue: 0,
    sales: 0,
    refunds: 0,
    refundedAmount: 0,
    roas: null,
    cpa: null,
  };
  for (const r of rows) {
    k.spend += Number(r.spend) || 0;
    k.revenue += Number(r.revenue) || 0;
    k.netRevenue += Number(r.net_revenue) || 0;
    k.sales += Number(r.sales) || 0;
    k.refunds += Number(r.refunds) || 0;
    k.refundedAmount += Number(r.refunded_amount) || 0;
  }
  k.roas = k.spend > 0 ? k.netRevenue / k.spend : null;
  k.cpa = k.sales > 0 ? k.spend / k.sales : null;
  return k;
}

export function buildProductSummaries(
  products: ProductDailyRow[],
  events: HotmartEventDailyRow[]
): ProductSummary[] {
  const byProduct = new Map<string, ProductSummary>();

  const keyOf = (id: number | null, name: string) =>
    id != null ? String(id) : `nome:${name}`;

  for (const r of products) {
    const key = keyOf(r.product_id, r.product_name);
    const p = byProduct.get(key) ?? {
      productId: r.product_id,
      productName: r.product_name,
      sales: 0,
      revenue: 0,
      refunds: 0,
      refundedAmount: 0,
      billetsPending: 0,
      abandonedCarts: 0,
    };
    p.sales += Number(r.sales) || 0;
    p.revenue += Number(r.revenue) || 0;
    p.refunds += Number(r.refunds) || 0;
    p.refundedAmount += Number(r.refunded_amount) || 0;
    p.billetsPending += Number(r.billets_pending) || 0;
    byProduct.set(key, p);
  }

  for (const e of events) {
    if (!ABANDONED_EVENTS.includes(e.event)) continue;
    const key = keyOf(e.product_id, e.product_name);
    const p = byProduct.get(key) ?? {
      productId: e.product_id,
      productName: e.product_name,
      sales: 0,
      revenue: 0,
      refunds: 0,
      refundedAmount: 0,
      billetsPending: 0,
      abandonedCarts: 0,
    };
    p.abandonedCarts += Number(e.events) || 0;
    byProduct.set(key, p);
  }

  return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
}

export function countEvents(
  events: HotmartEventDailyRow[],
  eventNames: string[]
): number {
  return events
    .filter((e) => eventNames.includes(e.event))
    .reduce((s, e) => s + (Number(e.events) || 0), 0);
}

export interface HotmartDailyPoint {
  date: string;
  sales: number;
  revenue: number;
  abandonedCarts: number;
}

export function buildHotmartDailySeries(
  products: ProductDailyRow[],
  events: HotmartEventDailyRow[]
): HotmartDailyPoint[] {
  const byDate = new Map<string, HotmartDailyPoint>();
  const get = (date: string) => {
    const p = byDate.get(date) ?? {
      date,
      sales: 0,
      revenue: 0,
      abandonedCarts: 0,
    };
    byDate.set(date, p);
    return p;
  };
  for (const r of products) {
    const p = get(r.date);
    p.sales += Number(r.sales) || 0;
    p.revenue += Number(r.revenue) || 0;
  }
  for (const e of events) {
    if (!ABANDONED_EVENTS.includes(e.event)) continue;
    get(e.date).abandonedCarts += Number(e.events) || 0;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
