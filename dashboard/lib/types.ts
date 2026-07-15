export interface CampaignDailyRow {
  date: string;
  campaign_id: string;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks?: number;
  landing_page_views?: number;
  sales: number;
  revenue: number;
  refunds: number;
  refunded_amount: number;
  net_revenue: number;
  roas: number | null;
  cpa: number | null;
}

export interface ProductDailyRow {
  date: string;
  product_id: number | null;
  product_name: string;
  sales: number;
  revenue: number;
  refunds: number;
  refunded_amount: number;
  billets_pending: number;
}

export interface HotmartEventDailyRow {
  date: string;
  product_id: number | null;
  product_name: string;
  event: string;
  events: number;
}

export interface DailyPoint {
  date: string;
  spend: number;
  revenue: number;
  netRevenue: number;
  sales: number;
}

export interface CampaignSummary {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  sales: number;
  revenue: number;
  refunds: number;
  refundedAmount: number;
  netRevenue: number;
  roas: number | null;
  cpa: number | null;
}

export interface ProductSummary {
  productId: number | null;
  productName: string;
  sales: number;
  revenue: number;
  refunds: number;
  refundedAmount: number;
  billetsPending: number;
  abandonedCarts: number;
}

export interface Kpis {
  spend: number;
  revenue: number;
  netRevenue: number;
  sales: number;
  refunds: number;
  refundedAmount: number;
  roas: number | null;
  cpa: number | null;
}
