import { formatVNDPlain } from "@/lib/format";
import { DetailCard } from "../DetailCard";

export interface InvoiceItem { item_name: string; qty: number; rate: number; amount: number }
export interface InvoiceTax { description: string; tax_amount: number }

/** Items, tax lines and the grand total (D-Invoice line-items table). */
export function LineItemsCard({ items, taxes, total }: { items: InvoiceItem[]; taxes: InvoiceTax[]; total: number }) {
  return (
    <DetailCard title="Line items" className="md:col-span-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm tabular-nums">
          <thead className="text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="py-2.5 text-left font-semibold">Item</th>
              <th scope="col" className="py-2.5 text-right font-semibold">Qty</th>
              <th scope="col" className="py-2.5 text-right font-semibold">Unit (VND)</th>
              <th scope="col" className="py-2.5 text-right font-semibold">Amount (VND)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-t">
                <td className="py-3 pr-3">{item.item_name}</td>
                <td className="py-3 text-right">{item.qty}</td>
                <td className="py-3 text-right">{formatVNDPlain(item.rate)}</td>
                <td className="py-3 text-right">{formatVNDPlain(item.amount)}</td>
              </tr>
            ))}
            {taxes.map((t, i) => (
              <tr key={`tax-${i}`} className="border-t text-muted-foreground">
                <td className="py-3 pr-3">{t.description}</td>
                <td /><td />
                <td className="py-3 text-right">{formatVNDPlain(t.tax_amount)}</td>
              </tr>
            ))}
            <tr className="border-t font-bold">
              <td className="py-3 text-[15px]">Total</td>
              <td /><td />
              <td className="py-3 text-right text-[15px]">{formatVNDPlain(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DetailCard>
  );
}
