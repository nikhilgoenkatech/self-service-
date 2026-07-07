import React, { createContext, useCallback, useContext, useState } from "react";

export interface SessionMeta {
  ticket: string;
  username: string;
}

export interface ChangeEntry {
  timestamp: string;
  username: string;
  ticket: string;
  hostName: string;
  hostId: string;
  tab: string;
  field: string;
  oldValue: string;
  newValue: string;
}

interface AuditContextValue {
  sessionMeta: SessionMeta | null;
  setSessionMeta: (meta: SessionMeta) => void;
  changeLog: ChangeEntry[];
  appendChanges: (entries: Omit<ChangeEntry, "timestamp" | "username" | "ticket">[]) => void;
  downloadCSV: () => void;
}

const AuditContext = createContext<AuditContextValue | null>(null);

export function AuditProvider({ children }: { children: React.ReactNode }) {
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  const [changeLog, setChangeLog] = useState<ChangeEntry[]>([]);

  const appendChanges = useCallback((entries: Omit<ChangeEntry, "timestamp" | "username" | "ticket">[]) => {
    if (!entries.length) return;
    setSessionMeta((meta) => {
      if (!meta) return meta;
      const timestamp = new Date().toISOString();
      const newEntries: ChangeEntry[] = entries.map((e) => ({
        ...e,
        timestamp,
        username: meta.username,
        ticket: meta.ticket,
      }));
      setChangeLog((prev) => [...prev, ...newEntries]);
      return meta;
    });
  }, []);

  const downloadCSV = useCallback(() => {
    setChangeLog((log) => {
      if (!log.length) return log;
      const headers = ["Timestamp", "Username", "Ticket", "Host", "Host ID", "Tab", "Field", "Old Value", "New Value"];
      const rows = log.map((e) => [
        e.timestamp, e.username, e.ticket, e.hostName, e.hostId, e.tab, e.field, e.oldValue, e.newValue,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `settings-change-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return log;
    });
  }, []);

  return (
    <AuditContext.Provider value={{ sessionMeta, setSessionMeta, changeLog, appendChanges, downloadCSV }}>
      {children}
    </AuditContext.Provider>
  );
}

export function useAudit(): AuditContextValue {
  const ctx = useContext(AuditContext);
  if (!ctx) throw new Error("useAudit must be used inside AuditProvider");
  return ctx;
}
