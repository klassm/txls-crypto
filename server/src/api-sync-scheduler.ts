import cron from "node-cron";
import type { DataSource } from "typeorm";
import { config } from "./config/env.js";
import { ApiSyncService, type SyncResult } from "./modules/api-sync/api-sync.service.js";
import { logger } from "./common/logger.js";

export class ApiSyncScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private syncService: ApiSyncService;
  private isRunning = false;

  constructor(private dataSource: DataSource) {
    this.syncService = new ApiSyncService(dataSource);
  }

  async start(): Promise<void> {
    if (!config.apiSync.enabled) {
      logger.info("[ApiSyncScheduler] API sync disabled, not starting scheduler");
      return;
    }

    logger.info(
      { interval: config.apiSync.interval },
      "[ApiSyncScheduler] Starting scheduler"
    );

    this.cronJob = cron.schedule(config.apiSync.interval, async () => {
      await this.runSync();
    });

    await this.runSync();
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info("[ApiSyncScheduler] Stopped scheduler");
    }
  }

  async runSyncNow(): Promise<void> {
    await this.runSync();
  }

  private async runSync(): Promise<void> {
    if (this.isRunning) {
      logger.debug("[ApiSyncScheduler] Sync already running, skipping");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info("[ApiSyncScheduler] Starting scheduled sync");
      const results = await this.syncService.syncAllAccounts();

      const successful = results.filter((r: SyncResult) => r.success).length;
      const failed = results.filter((r: SyncResult) => !r.success).length;
      const totalImported = results.reduce((sum: number, r: SyncResult) => sum + r.imported, 0);

      const duration = Date.now() - startTime;
      logger.info(
        { duration: `${duration}ms`, successful, failed, totalImported },
        "[ApiSyncScheduler] Sync completed"
      );
    } catch (error) {
      logger.error({ error }, "[ApiSyncScheduler] Sync failed");
    } finally {
      this.isRunning = false;
    }
  }

  getSyncService(): ApiSyncService {
    return this.syncService;
  }
}
