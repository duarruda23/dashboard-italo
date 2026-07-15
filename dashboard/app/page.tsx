import {
  getCampaignDaily,
  getProductDaily,
  getHotmartEventsDaily,
} from '@/lib/data';
import Dashboard from '@/components/Dashboard';

// Revalida a cada 5 minutos (dados novos chegam via n8n de qualquer forma)
export const revalidate = 300;

const VALID_PERIODS = [7, 14, 30, 90];

export default async function Page({
  searchParams,
}: {
  searchParams: { periodo?: string };
}) {
  const parsed = Number(searchParams.periodo);
  const days = VALID_PERIODS.includes(parsed) ? parsed : 30;

  const [rows, products, events] = await Promise.all([
    getCampaignDaily(days),
    getProductDaily(days),
    getHotmartEventsDaily(days),
  ]);

  return (
    <Dashboard
      days={days}
      periods={VALID_PERIODS}
      rows={rows}
      products={products}
      events={events}
    />
  );
}
