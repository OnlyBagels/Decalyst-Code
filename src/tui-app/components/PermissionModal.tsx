import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PermissionDecision } from "../../events/types.js";
import { theme } from "../theme.js";

interface Request {
  toolName: string;
  args: unknown;
  resolve: (decision: PermissionDecision) => void;
}

interface Props {
  request: Request;
  onClose: () => void;
}

const CHOICES = [
  { label: "Approve (auto)", key: "a", decision: "auto" as PermissionDecision },
  { label: "Ask once", key: "o", decision: "ask-once" as PermissionDecision },
  { label: "Deny", key: "d", decision: "deny" as PermissionDecision },
  { label: "Cancel", key: "c", decision: "deny" as PermissionDecision },
];

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return String(args ?? "");
  const entries = Object.entries(args as Record<string, unknown>).slice(0, 3);
  return entries
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
}

export function PermissionModal({ request, onClose }: Props): React.JSX.Element {
  const [selected, setSelected] = useState(0);

  useInput((_, key) => {
    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((s) => Math.min(CHOICES.length - 1, s + 1));
      return;
    }
    if (key.return) {
      const choice = CHOICES[selected];
      if (choice) {
        request.resolve(choice.decision);
        onClose();
      }
      return;
    }

    for (const choice of CHOICES) {
      if (_.toLowerCase() === choice.key) {
        request.resolve(choice.decision);
        onClose();
        return;
      }
    }
  });

  const argsStr = summarizeArgs(request.args);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.accent}
      paddingX={2}
      paddingY={1}
    >
      <Text color={theme.accent} bold>permission request</Text>
      <Text> </Text>
      <Text color={theme.dim}>tool: </Text>
      <Text color={theme.agent}>{request.toolName}</Text>
      {argsStr && (
        <>
          <Text color={theme.dim}>args: </Text>
          <Text color={theme.agent}>{argsStr}</Text>
        </>
      )}
      <Text> </Text>
      {CHOICES.map((choice, i) => (
        <Box key={choice.key}>
          <Text color={i === selected ? theme.accent : theme.dim}>
            {i === selected ? "> " : "  "}
            {`[${choice.key}] ${choice.label}`}
          </Text>
        </Box>
      ))}
      <Text> </Text>
      <Text color={theme.dim}>up/down to move, enter to confirm, or press key</Text>
    </Box>
  );
}
