import React, { useState } from "react";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { FormField, Label, TextInput } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import type { SessionMeta } from "../context/AuditContext";

interface Props {
  onConfirm: (meta: SessionMeta) => void;
  onDismiss: () => void;
}

export function SessionMetaModal({ onConfirm, onDismiss }: Props) {
  const [ticket, setTicket] = useState("");
  const [username, setUsername] = useState("");

  const valid = ticket.trim().length > 0 && username.trim().length > 0;

  return (
    <Modal title="Change authorisation required" show onDismiss={onDismiss}>
      <Flex flexDirection="column" gap={16} style={{ minWidth: 360 }}>
        <Text textStyle="small" style={{ color: "var(--dt-colors-text-secondary)" }}>
          Please provide your details before saving. These will be recorded in the change log for auditing purposes.
        </Text>
        <FormField>
          <Label required>ServiceNow ticket</Label>
          <TextInput
            placeholder="e.g. CHG0012345"
            value={ticket}
            onChange={setTicket}
          />
        </FormField>
        <FormField>
          <Label required>CI Name</Label>
          <TextInput
            placeholder="e.g. jsmith"
            value={username}
            onChange={setUsername}
          />
        </FormField>
        <Flex gap={8} justifyContent="flex-end">
          <Button variant="default" onClick={onDismiss}>Cancel</Button>
          <Button variant="accent" onClick={() => onConfirm({ ticket: ticket.trim(), username: username.trim() })} disabled={!valid}>
            Confirm
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
}
