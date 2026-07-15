import { supabase } from './supabase';
import type {
  CampaignDailyRow,
  ProductDailyRow,
  HotmartEventDailyRow,
} from './types';

function sinceStr(days: number): string {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since.toISOString().slice(0, 10);
}

export async function getCampaignDaily(
  days: number
): Promise<CampaignDailyRow[]> {
  const { data, error } = await supabase
    .from('vw_campaign_daily')
    .select('*')
    .gte('date', sinceStr(days))
    .order('date', { ascending: true });

  if (error) throw new Error(`Erro ao consultar vw_campaign_daily: ${error.message}`);
  return (data ?? []) as CampaignDailyRow[];
}

export async function getProductDaily(
  days: number
): Promise<ProductDailyRow[]> {
  const { data, error } = await supabase
    .from('vw_product_daily')
    .select('*')
    .gte('date', sinceStr(days))
    .order('date', { ascending: true });

  if (error) throw new Error(`Erro ao consultar vw_product_daily: ${error.message}`);
  return (data ?? []) as ProductDailyRow[];
}

export async function getHotmartEventsDaily(
  days: number
): Promise<HotmartEventDailyRow[]> {
  const { data, error } = await supabase
    .from('vw_hotmart_events_daily')
    .select('*')
    .gte('date', sinceStr(days))
    .order('date', { ascending: true });

  if (error) throw new Error(`Erro ao consultar vw_hotmart_events_daily: ${error.message}`);
  return (data ?? []) as HotmartEventDailyRow[];
}
