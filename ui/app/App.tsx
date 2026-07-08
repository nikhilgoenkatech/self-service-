import React, { useState } from "react";
import { PageLayout, TitleBar, AppHeader } from "@dynatrace/strato-components/layouts";
import { Tabs, Tab } from "@dynatrace/strato-components/navigation";
import { ToastContainer } from "@dynatrace/strato-components/notifications";
import { Button } from "@dynatrace/strato-components/buttons";
import { Link } from "react-router-dom";
import { AnomalyDetection } from "./pages/AnomalyDetection";
import { DiskAnomalySettings } from "./pages/DiskAnomalySettings";
import { SyntheticConfig } from "./pages/SyntheticConfig";
import { AuditProvider, useAudit } from "./context/AuditContext";
import { TABS } from "./config";

const PAGE_COMPONENTS: Record<string, React.ComponentType> = {
  "infrastructure-anomaly": AnomalyDetection,
  "disk-anomaly": DiskAnomalySettings,
};

function DownloadLogButton() {
  const { changeLog, downloadCSV } = useAudit();
  return (
    <Button variant="default" size="condensed" onClick={downloadCSV}>
      Download change log{changeLog.length > 0 ? ` (${changeLog.length})` : ""}
    </Button>
  );
}

const TAB_STORAGE_KEY = "settings-delegate-active-tab";

function AppInner() {
  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    return stored !== null ? Number(stored) : 0;
  });

  const handleTabChange = (index: number) => {
    localStorage.setItem(TAB_STORAGE_KEY, String(index));
    setSelectedIndex(index);
  };

  return (
    <PageLayout>
      <PageLayout.Header>
        <AppHeader>
          <AppHeader.Navigation>
            <AppHeader.Logo as={Link} to="/" />
          </AppHeader.Navigation>
        </AppHeader>
        <TitleBar>
          <TitleBar.Title>Settings Delegate</TitleBar.Title>
          <TitleBar.Subtitle>
            View and edit entity settings on behalf of read-only users
          </TitleBar.Subtitle>
          <TitleBar.Action>
            <DownloadLogButton />
          </TitleBar.Action>
        </TitleBar>
      </PageLayout.Header>

      <PageLayout.Content>
        <Tabs selectedIndex={selectedIndex} onChange={handleTabChange} style={{ width: "100%" }}>
          {TABS.map((tab) => {
            const PageComponent = PAGE_COMPONENTS[tab.id] ?? (() => null);
            return (
              <Tab key={tab.id} title={tab.label}>
                <PageComponent />
              </Tab>
            );
          })}
          <Tab title="Synthetic Configuration">
            <SyntheticConfig />
          </Tab>
        </Tabs>
      </PageLayout.Content>

      <ToastContainer />
    </PageLayout>
  );
}

export const App = () => (
  <AuditProvider>
    <AppInner />
  </AuditProvider>
);
