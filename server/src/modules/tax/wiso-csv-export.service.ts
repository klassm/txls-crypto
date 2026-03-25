import { DateTime } from "luxon";
import { injectable } from "inversify";
import type { TaxCalculation } from "./tax-calculator.service.js";

@injectable()
export class WisoCsvExportService {
  formatGermanDate(date: DateTime): string {
    return date.toFormat("dd.MM.yyyy");
  }

  generateCsv(
    taxCalculations: Map<string, TaxCalculation>,
    year: number,
    source: string
  ): string {
    const header = `Identifier:Capital_Gains,Method:FIFO,Tax_Year:${year},Base_Currency:EUR`;
    const columns =
      "Amount,Currency,Date Sold,Date Acquired,Short/Long,Buy/Input at,Sell/Output at,Proceeds,Cost Basis,Gain/Loss";

    const rows = Array.from(taxCalculations.values()).flatMap((calculation) =>
      calculation.transactions.map((tx) => {
        const amount = tx.quantity.toFixed(8);
        const currency = tx.asset;
        const dateSold = this.formatGermanDate(tx.date);

        const holdingDate =
          tx.holdingPeriodDays !== undefined
            ? tx.date.minus({ days: tx.holdingPeriodDays })
            : tx.date;
        const dateAcquired = this.formatGermanDate(holdingDate);
        const shortLong =
          tx.holdingPeriodDays !== undefined && tx.holdingPeriodDays > 365
            ? "Long"
            : "Short";
        const buyAt = source;
        const sellAt = source;
        const proceeds = tx.proceeds.toFixed(2);
        const costBasis = tx.costBasis.toFixed(2);
        const gainLoss = tx.gainLoss.toFixed(2);

        return `${amount},${currency},${dateSold},${dateAcquired},${shortLong},${buyAt},${sellAt},${proceeds},${costBasis},${gainLoss}`;
      })
    );

    return [header, columns, ...rows].join("\n");
  }
}
