import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface Models {
  orchestrator?: string;
  swarm?: string;
}

interface Props {
  phase: string;
  models: Models;
  hint: string;
}

export function StatusBar({ phase, models, hint }: Props): React.JSX.Element {
  const modelLabel = models.orchestrator
    ? models.orchestrator.split("/").pop() ?? models.orchestrator
    : "no model";

  return (
    <Box borderStyle="single" borderColor={theme.dim} paddingX={1}>
      <Text color={theme.dim}>phase: </Text>
      <Text color={theme.phaseActive}>{phase}</Text>
      <Text color={theme.dim}>{" | model: "}</Text>
      <Text color={theme.agent}>{modelLabel}</Text>
      <Text color={theme.dim}>{" | "}</Text>
      <Text color={theme.dim}>{hint}</Text>
      <Text color={theme.dim}>{" | Ctrl+C exits"}</Text>
    </Box>
  );
}
