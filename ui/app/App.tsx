import React, { useState } from "react";
import { Page, TitleBar, AppHeader } from "@dynatrace/strato-components/layouts";
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
  if (!changeLog.length) return null;
  return (
    <Button variant="default" size="condensed" onClick={downloadCSV}>
      Download change log ({changeLog.length})
    </Button>
  );
}

function AppInner() {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <Page>
      <Page.Header>
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
      </Page.Header>

      <Page.Main>
        <Tabs selectedIndex={selectedIndex} onChange={setSelectedIndex}>
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
      </Page.Main>

      <ToastContainer />
    </Page>
  );
}

export const App = () => (
  <AuditProvider>
    <AppInner />
  </AuditProvider>
);
