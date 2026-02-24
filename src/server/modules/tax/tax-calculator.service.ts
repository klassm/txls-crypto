import type { Transaction } from "@/lib/types";
import { TransactionType } from "@/lib/types";
import { DateTime } from "luxon";
import { diffDays, getYear } from "@/lib/utils/date";

export interface TaxCalculation {
  asset: string;
  transactions: TaxTransaction[];
  totalGain: number;
  totalLoss: number;
}

export type TaxExemptionReason =
  | "long_term_holding"
  | "exemption_limit_1000"
  | "exemption_limit_256_staking"
  | "none";

export interface LossCarryover {
  year: number;
  loss: number;
  remaining: number;
}

export interface TaxCalculationResult {
  assetCalculations: Map<string, TaxCalculation>;
  stakingRewardsExempt: number;
  stakingRewardsTaxable: number;
  lossCarryover: LossCarryover;
}

export interface TaxTransaction {
  date: DateTime;
  type: "buy" | "sell";
  asset: string;
  quantity: number;
  pricePerUnit: number;
  fee: number;
  costBasis: number;
  proceeds: number;
  gainLoss: number;
  holdingPeriodDays?: number;
  isTaxFree: boolean;
  exemptionReason: TaxExemptionReason;
}

interface BuyLot {
  transaction: Transaction;
  remainingQuantity: number;
  originalAcquisitionTimestamp?: DateTime;
}

interface PendingTransfer {
  asset: string;
  quantity: number;
  lots: Array<{
    originalTransaction: Transaction;
    quantity: number;
    originalAcquisitionTimestamp: DateTime;
  }>;
  transferOutTransaction: Transaction;
}

interface TransferMatch {
  transferOut: Transaction;
  transferIn: Transaction;
  lots: Array<{
    originalTransaction: Transaction;
    quantity: number;
    originalAcquisitionTimestamp: DateTime;
  }>;
}

export class TaxCalculationService {
  private savedLossCarryover: LossCarryover | null = null;

  setLossCarryover(lossCarryover: LossCarryover | null): void {
    this.savedLossCarryover = lossCarryover;
  }

  getLossCarryover(): LossCarryover | null {
    return this.savedLossCarryover;
  }

  getStakingRewardsForYear(transactions: Transaction[], year: number): number {
    return transactions
      .filter((t) => t.type === TransactionType.reward && getYear(t.timestamp) === year)
      .reduce((sum, t) => sum + t.eurValue, 0);
  }

  calculateTax(transactions: Transaction[]): Map<string, TaxCalculation> {
    const assetCalculations = new Map<string, TaxCalculation>();
    const buyQueuesByAccount = new Map<number, Map<string, BuyLot[]>>();

    const transferMatches = this.matchTransfers(transactions);

    const sortedTransactions = [...transactions].sort(
      (a, b) => a.timestamp.toMillis() - b.timestamp.toMillis()
    );

    for (const transaction of sortedTransactions) {
      const asset = transaction.asset;
      const accountId = transaction.providerAccountId;

      if (!buyQueuesByAccount.has(accountId)) {
        buyQueuesByAccount.set(accountId, new Map());
      }
      const accountQueues = buyQueuesByAccount.get(accountId)!;
      
      if (!accountQueues.has(asset)) {
        accountQueues.set(asset, []);
      }

      if (transaction.type === "buy" || transaction.type === "deposit" || transaction.type === "reward") {
        accountQueues.get(asset)!.push({
          transaction,
          remainingQuantity: transaction.quantity,
        });
      } else if (transaction.type === TransactionType.transfer_in) {
        this.processTransferIn(transaction, asset, accountQueues, transferMatches);
      } else if (transaction.type === TransactionType.transfer_out) {
        const sourceQueues = buyQueuesByAccount.get(accountId);
        if (sourceQueues) {
          this.processTransferOut(transaction, asset, sourceQueues, assetCalculations, transferMatches);
        }
      } else if (transaction.type === "sell") {
        this.processSell(transaction, asset, accountQueues, assetCalculations);
      }
    }

    for (const [, calculation] of assetCalculations.entries()) {
      calculation.transactions.sort((a, b) => a.date.toMillis() - b.date.toMillis());
    }

    return assetCalculations;
  }

  private matchTransfers(transactions: Transaction[]): Map<string, TransferMatch[]> {
    const matches = new Map<string, TransferMatch[]>();
    
    const transferOuts = transactions.filter(t => t.type === TransactionType.transfer_out);
    const transferIns = transactions.filter(t => t.type === TransactionType.transfer_in);

    for (const transferOut of transferOuts) {
      const asset = transferOut.asset;
      if (!matches.has(asset)) {
        matches.set(asset, []);
      }

      const matchingIn = transferIns.find(tIn => 
        tIn.asset === asset &&
        Math.abs(tIn.quantity - transferOut.quantity) < 0.0001 &&
        Math.abs(tIn.timestamp.toMillis() - transferOut.timestamp.toMillis()) < 72 * 60 * 60 * 1000 &&
        !matches.get(asset)!.some(m => m.transferIn.id === tIn.id)
      );

      if (matchingIn) {
        matches.get(asset)!.push({
          transferOut,
          transferIn: matchingIn,
          lots: [],
        });
      }
    }

    return matches;
  }

  private processTransferIn(
    transaction: Transaction,
    asset: string,
    buyQueues: Map<string, BuyLot[]>,
    transferMatches: Map<string, TransferMatch[]>,
  ): void {
    const matches = transferMatches.get(asset) || [];
    const match = matches.find(m => m.transferIn.id === transaction.id);

    if (match && match.lots.length > 0) {
      for (const lot of match.lots) {
        buyQueues.get(asset)!.push({
          transaction: {
            ...transaction,
            quantity: lot.quantity,
            eurValue: lot.originalTransaction.eurValue * (lot.quantity / lot.originalTransaction.quantity),
            eurFee: lot.originalTransaction.eurFee * (lot.quantity / lot.originalTransaction.quantity),
          },
          remainingQuantity: lot.quantity,
          originalAcquisitionTimestamp: lot.originalAcquisitionTimestamp,
        });
      }
    } else {
      buyQueues.get(asset)!.push({
        transaction,
        remainingQuantity: transaction.quantity,
      });
    }
  }

  private processTransferOut(
    transaction: Transaction,
    asset: string,
    buyQueues: Map<string, BuyLot[]>,
    assetCalculations: Map<string, TaxCalculation>,
    transferMatches: Map<string, TransferMatch[]>,
  ): void {
    const matches = transferMatches.get(asset) || [];
    const match = matches.find(m => m.transferOut.id === transaction.id);

    if (match) {
      let remainingQuantity = transaction.quantity;
      const buyQueue = buyQueues.get(asset)!;

      while (remainingQuantity > 0 && buyQueue.length > 0) {
        const lot = buyQueue[0];
        if (lot.remainingQuantity <= 0) {
          buyQueue.shift();
          continue;
        }

        const consumedQuantity = Math.min(remainingQuantity, lot.remainingQuantity);
        
        match.lots.push({
          originalTransaction: lot.transaction,
          quantity: consumedQuantity,
          originalAcquisitionTimestamp: lot.originalAcquisitionTimestamp || lot.transaction.timestamp,
        });

        lot.remainingQuantity -= consumedQuantity;
        remainingQuantity -= consumedQuantity;

        if (lot.remainingQuantity <= 0) {
          buyQueue.shift();
        }
      }
    } else {
      this.processSell(transaction, asset, buyQueues, assetCalculations);
    }
  }

  private processSell(
    transaction: Transaction,
    asset: string,
    buyQueues: Map<string, BuyLot[]>,
    assetCalculations: Map<string, TaxCalculation>
  ): void {
    let remainingSellQuantity = transaction.quantity;
    const taxTransactions: TaxTransaction[] = [];
    const assetCalc = assetCalculations.get(asset) || {
      asset,
      transactions: [],
      totalGain: 0,
      totalLoss: 0,
    };

    const pricePerUnit = transaction.quantity > 0
      ? transaction.eurValue / transaction.quantity
      : 0;

    const buyQueue = buyQueues.get(asset)!;

    while (remainingSellQuantity > 0 && buyQueue.length > 0) {
      const lot = buyQueue[0];
      if (lot.remainingQuantity <= 0) {
        buyQueue.shift();
        continue;
      }

      const lotQuantity = Math.min(remainingSellQuantity, lot.remainingQuantity);
      const { costBasis, netProceeds, gainLoss, holdingPeriodDays } = this.calculateLotValues(
        lot,
        lotQuantity,
        pricePerUnit,
        transaction
      );

      taxTransactions.push({
        date: transaction.timestamp,
        type: "sell",
        asset,
        quantity: lotQuantity,
        pricePerUnit,
        fee: transaction.eurFee * (lotQuantity / transaction.quantity),
        costBasis,
        proceeds: netProceeds,
        gainLoss,
        holdingPeriodDays,
        isTaxFree: false,
        exemptionReason: "none",
      });

      if (gainLoss >= 0) {
        assetCalc.totalGain += gainLoss;
      } else {
        assetCalc.totalLoss += Math.abs(gainLoss);
      }

      lot.remainingQuantity -= lotQuantity;
      remainingSellQuantity -= lotQuantity;

      if (lot.remainingQuantity <= 0) {
        buyQueue.shift();
      }
    }

    if (remainingSellQuantity > 0) {
      const gainLoss = remainingSellQuantity * pricePerUnit;
      taxTransactions.push({
        date: transaction.timestamp,
        type: "sell",
        asset,
        quantity: remainingSellQuantity,
        pricePerUnit,
        fee: transaction.eurFee * (remainingSellQuantity / transaction.quantity),
        costBasis: 0,
        proceeds: remainingSellQuantity * pricePerUnit,
        gainLoss,
        isTaxFree: false,
        exemptionReason: "none",
      });
      assetCalc.totalGain += gainLoss;
    }

    assetCalc.transactions.push(...taxTransactions);
    assetCalculations.set(asset, assetCalc);
  }

  private calculateLotValues(
    lot: BuyLot,
    lotQuantity: number,
    pricePerUnit: number,
    sellTransaction: Transaction
  ): { costBasis: number; netProceeds: number; gainLoss: number; holdingPeriodDays: number } {
    const lotPricePerUnit = lot.transaction.eurValue / lot.transaction.quantity;
    const lotFeePercentage = lot.transaction.quantity > 0
      ? lot.transaction.eurFee / lot.transaction.quantity
      : 0;

    const costBasis = lotQuantity * lotPricePerUnit + lotQuantity * lotFeePercentage;
    const proceeds = lotQuantity * pricePerUnit;
    const feeAllocation = sellTransaction.eurFee * (lotQuantity / sellTransaction.quantity);
    const netProceeds = proceeds - feeAllocation;
    const gainLoss = netProceeds - costBasis;
    const acquisitionTimestamp = lot.originalAcquisitionTimestamp || lot.transaction.timestamp;
    const holdingPeriodDays = Math.floor(diffDays(acquisitionTimestamp, sellTransaction.timestamp));

    return { costBasis, netProceeds, gainLoss, holdingPeriodDays };
  }

  applyGermanTaxRules(taxTransactions: TaxTransaction[]): TaxTransaction[] {
    const EXEMPTION_LIMIT_1000 = 1000;

    const results: TaxTransaction[] = taxTransactions.map((tx) => {
      const isTaxFree = (tx.holdingPeriodDays ?? 0) > 365;
      return {
        ...tx,
        isTaxFree,
        exemptionReason: isTaxFree ? "long_term_holding" as const : "none" as const,
      };
    });

    const taxableGains = results
      .filter((t) => !t.isTaxFree && t.gainLoss > 0)
      .reduce((sum, t) => sum + t.gainLoss, 0);

    if (taxableGains < EXEMPTION_LIMIT_1000 && taxableGains > 0) {
      for (const tx of results) {
        if (!tx.isTaxFree && tx.gainLoss > 0) {
          tx.isTaxFree = true;
          tx.exemptionReason = "exemption_limit_1000";
        }
      }
    }

    return results;
  }

  calculateTaxForYear(transactions: Transaction[], year: number): TaxCalculationResult {
    const allTransactions = transactions.filter((t) => getYear(t.timestamp) <= year);
    const allCalculations = this.calculateTax(allTransactions);

    const { yearCalculations, allTaxTransactions } = Array.from(allCalculations.entries()).reduce<{
      yearCalculations: Map<string, TaxCalculation>;
      allTaxTransactions: TaxTransaction[];
    }>(
      (acc, [asset, calculation]) => {
        const yearSells = calculation.transactions.filter((t) => getYear(t.date) === year);

        if (yearSells.length > 0) {
          acc.allTaxTransactions.push(...yearSells);
          acc.yearCalculations.set(asset, calculation);
        }

        return acc;
      },
      { yearCalculations: new Map(), allTaxTransactions: [] }
    );

    const taxFreeTransactions = this.applyGermanTaxRules(allTaxTransactions);
    const yearTotalLoss = taxFreeTransactions
      .filter((t) => !t.isTaxFree && t.gainLoss < 0)
      .reduce((sum, t) => sum + Math.abs(t.gainLoss), 0);

    const assetResults = new Map<string, TaxCalculation>();
    for (const [asset] of yearCalculations.entries()) {
      assetResults.set(asset, {
        asset,
        transactions: taxFreeTransactions.filter((t) => t.asset === asset),
        totalGain: taxFreeTransactions
          .filter((t) => t.asset === asset && !t.isTaxFree && t.gainLoss >= 0)
          .reduce((sum, t) => sum + t.gainLoss, 0),
        totalLoss: taxFreeTransactions
          .filter((t) => t.asset === asset && !t.isTaxFree && t.gainLoss < 0)
          .reduce((sum, t) => sum + Math.abs(t.gainLoss), 0),
      });
    }

    const stakingRewards = this.getStakingRewardsForYear(transactions, year);
    const STAKING_FREIGRENZE = 256;
    const stakingRewardsExempt = stakingRewards < STAKING_FREIGRENZE ? stakingRewards : 0;
    const stakingRewardsTaxable = stakingRewards >= STAKING_FREIGRENZE ? stakingRewards : 0;

    const availableLossCarryover = this.getLossCarryover()?.remaining ?? 0;
    const lossAfterCarryover = Math.max(0, yearTotalLoss - availableLossCarryover);

    this.setLossCarryover({ year, loss: lossAfterCarryover, remaining: lossAfterCarryover });

    return {
      assetCalculations: assetResults,
      stakingRewardsExempt,
      stakingRewardsTaxable,
      lossCarryover: { year, loss: lossAfterCarryover, remaining: lossAfterCarryover },
    };
  }
}
