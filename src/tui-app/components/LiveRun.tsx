import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";

interface Worker {
  id: string;
  phase: string;
}

interface Props {
  workers: Worker[];
}

export function LiveRun({ workers }: Props): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box>
        <Text color={theme.phaseActive}>
          <Spinner type="dots" />
        </Text>
        <Text color={theme.phaseActive}>{" running"}</Text>
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
