import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { SyncStatus } from "@txls/shared";

const WS_URL = typeof window !== "undefined" && window.location.port === "3000" 
  ? "http://localhost:3001" 
  : window.location.origin;

export function useSyncWebSocket(accountId: number | null) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;

    const socket: Socket = io(WS_URL);

    socket.on("connect", () => {
      socket.emit("join", `account:${accountId}`);
    });

    socket.on("sync-started", (data: { accountId: number }) => {
      if (data.accountId === accountId) {
        setStatus("syncing");
        setError(null);
      }
    });

    socket.on("sync-complete", (data: { accountId: number; imported: number }) => {
      if (data.accountId === accountId) {
        setStatus("idle");
        setError(null);
      }
    });

    socket.on("sync-error", (data: { accountId: number; error: string }) => {
      if (data.accountId === accountId) {
        setStatus("error");
        setError(data.error);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [accountId]);

  return { status, error };
}
