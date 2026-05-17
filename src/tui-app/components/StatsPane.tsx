import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { UsageTracker } from "../../tui/usage-tracker.js";
import { theme } from "../theme.js";

interface Worker {
  id: string;
  phase: string;
}

interface Models {
  orchestrator?: string;
  swarm?: string;
}

interface Props {
  tracker: UsageTracker;
  workspace: string;
  models: Models;
  phase: string;
  workers: Worker[];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd < 0.001) return "<$0.001";
  return `$${usd.toFixed(3)}`;
}

export function StatsPane({ tracker, workspace, models, phase, workers }: Props): React.JSX.Element {
  const [totals, setTotals] = useState(() => tracker.totals());

  useEffect(() => {
    const unsub = tracker.onChange(() => {
      setTotals(tracker.totals());
    });
    return unsub;
  }, [tracker]);

  const shortWorkspace = workspace.length > 20
    ? `...${workspace.slice(-17)}`
    : workspace;

  return (
    <Box
      flexDirection="column"
      width={24}
      borderStyle="single"
      borderColor={theme.dim}
      paddingX={1}
    >
      <Text color={theme.accent} bold>stats</Text>

      <Text> </Text>
      <Text color={theme.dim}>phase</Text>
      <Text color={theme.phaseActive}>{phase}</Text>

      <Text> </Text>
      <Text color={theme.dim}>agents</Text>
      {workers.length === 0 ? (
        <Text color={theme.dim}>  none</Text>
      ) : (
        workers.map((w) => (
          <Text key={w.id} color={theme.agent}>{"  "}{w.id}</Text>
        ))
      )}

      <Text> </Text>
      <Text color={theme.dim}>tokens</Text>
      <Text>{"  "}<Text color={theme.dim}>in  </Text><Text color={theme.agent}>{formatTokens(totals.promptTokens)}</Text></Text>
      <Text>{"  "}<Text color={theme.dim}>out </Text><Text color={theme.agent}>{formatTokens(totals.completionTokens)}</Text></Text>

      <Text> </Text>
      <Text color={theme.dim}>cost</Text>
      <Text color={theme.agent}>{"  "}{formatCost(totals.cost)}</Text>

      {models.orchestrator && (
        <>
          <Text> </Text>
          <Text color={theme.dim}>orch model</Text>
          <Text color={theme.agent}>{"  "}{models.orchestrator.slice(0, 18)}</Text>
        </>
      )}

      <Text> </Text>
      <Text color={theme.dim}>workspace</Text>
      <Text color={theme.agent}>{"  "}{shortWorkspace}</Text>
    </Box>
  );
}
