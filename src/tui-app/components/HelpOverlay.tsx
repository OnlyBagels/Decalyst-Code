import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";

interface Props {
  onClose: () => void;
}

const COMMANDS: Array<{ name: string; desc: string }> = [
  { name: "/help", desc: "show slash command list" },
  { name: "/exit, /quit", desc: "exit the shell" },
  { name: "/workspace [path]", desc: "print or change workspace root" },
  { name: "/model [target] [name]", desc: "print or set model overrides" },
  { name: "/clear", desc: "clear the transcript" },
  { name: "/cost", desc: "show token usage and estimated cost" },
  { name: "/files", desc: "list workspace files" },
  { name: "/cancel", desc: "abort the active run" },
  { name: "/permissions", desc: "show cached permission decisions" },
];

const KEYS: Array<{ key: string; desc: string }> = [
  { key: "Esc", desc: "abort active run, or clear input" },
  { key: "Ctrl+L", desc: "clear transcript display" },
  { key: "Ctrl+C", desc: "abort run (first press), then exit" },
  { key: "F1 / ?", desc: "open this help overlay" },
  { key: "Tab", desc: "autocomplete slash command" },
  { key: "Up / Down", desc: "navigate input history" },
];

export function HelpOverlay({ onClose }: Props): React.JSX.Element {
  useInput((input, key) => {
    if (key.escape || input === "?") {
      onClose();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.accent}
      paddingX={2}
      paddingY={1}
    >
      <Text color={theme.accent} bold>Decalyst-Code — Help</Text>
      <Text> </Text>

      <Text color={theme.dim} bold>slash commands</Text>
      {COMMANDS.map((cmd) => (
        <Box key={cmd.name}>
          <Text color={theme.agent}>{cmd.name.padEnd(28)}</Text>
          <Text color={theme.dim}>{cmd.desc}</Text>
        </Box>
      ))}

      <Text> </Text>
      <Text color={theme.dim} bold>key bindings</Text>
      {KEYS.map((kb) => (
        <Box key={kb.key}>
          <Text color={theme.agent}>{kb.key.padEnd(16)}</Text>
          <Text color={theme.dim}>{kb.desc}</Text>
        </Box>
      ))}

      <Text> </Text>
      <Text color={theme.dim}>press Esc or ? to close</Text>
    </Box>
  );
}
