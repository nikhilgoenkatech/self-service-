import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";

const Step = ({ children }: { children: React.ReactNode }) => (
  <span style={{
    fontSize: 11, background: "transparent",
    border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)",
    borderRadius: 20, padding: "3px 10px",
    color: "var(--dt-colors-text-secondary, #a1a1aa)",
    whiteSpace: "nowrap" as const,
  }}>
    {children}
  </span>
);

const VaultStep = ({ children }: { children: React.ReactNode }) => (
  <span style={{
    fontSize: 11,
    background: "var(--dt-colors-background-warning-subtle, rgba(245,158,11,0.12))",
    border: "0.5px solid var(--dt-colors-border-warning-default, rgba(245,158,11,0.4))",
    borderRadius: 20, padding: "3px 10px",
    color: "var(--dt-colors-text-warning, #f59e0b)",
    whiteSpace: "nowrap" as const,
  }}>
    {children}
  </span>
);

const Arrow = () => (
  <Text textStyle="small" style={{ color: "var(--dt-colors-text-muted, #71717a)", fontSize: 12, flexShrink: 0 }}>→</Text>
);

export function ArchNote(): JSX.Element {
  return (
    <div style={{
      background: "var(--dt-colors-background-container-neutral-default, rgba(255,255,255,0.03))",
      border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)",
      borderRadius: 8, padding: "10px 14px",
    }}>
      <Text textStyle="small" style={{ fontWeight: 600, marginBottom: 8, fontSize: 12, display: "block" }}>
        How this works
      </Text>
      <Flex gap={6} alignItems="center" flexWrap="wrap">
        <Step>JS SDK — entities filtered by your IAM</Step>
        <Arrow />
        <Step>Settings API read</Step>
        <Arrow />
        <VaultStep>Admin token from credential vault</VaultStep>
        <Arrow />
        <Step>Settings API write (on save)</Step>
      </Flex>
    </div>
  );
}
