import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";

interface Worker {
  id: string;
  phase: string;
}

interface Props {
  isRunning: boolean;
  workers: Worker[];
}

export function LiveRun({ isRunning, workers }: Props): React.JSX.Element | null {
  if (!isRunning) return null;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box>
        <Text color={theme.phaseActive}>
          <Spinner type="dots" />
        </Text>
        {workers.length === 0 ? (
          <Text color={theme.phaseActive}>{" orchestrator working..."}</Text>
        ) : (
          <Text color={theme.phaseActive}>{` ${workers.length} worker${workers.length === 1 ? "" : "s"} active`}</Text>
        )}
      </Box>
      {workers.map((w) => (
        <Box key={w.id}>
          <Text color={theme.dim}>{"  "}</Text>
          <Text color={theme.agent}>{w.id}</Text>
          <Text color={theme.dim}>{" "}</Text>
          <Text color={theme.dim}>{w.phase}</Text>
        </Box>
      ))}
    </Box>
  );
}
