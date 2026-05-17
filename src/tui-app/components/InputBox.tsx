import React, { useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";

const SLASH_COMMANDS = [
  "/help",
  "/exit",
  "/quit",
  "/workspace",
  "/clear",
  "/model",
  "/cost",
  "/files",
  "/cancel",
  "/permissions",
];

export function tabComplete(current: string): string {
  if (!current.startsWith("/")) return current;

  const matches = SLASH_COMMANDS.filter((cmd) => cmd.startsWith(current));
  if (matches.length === 0) return current;
  if (matches.length === 1) {
    const match = matches[0];
    return match !== undefined ? match + " " : current;
  }

  let prefix = matches[0] ?? current;
  for (const cmd of matches.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < cmd.length && prefix[i] === cmd[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

interface Props {
  disabled: boolean;
  history: string[];
  value: string;
  onChange: (v: string) => void;
  onSubmit: (value: string) => void;
}

export function InputBox({ disabled, history, value, onChange, onSubmit }: Props): React.JSX.Element {
  useInput(
    (input, key) => {
      if (disabled) return;

      if (key.upArrow) {
        const currentIndex = history.indexOf(value);
        const nextIndex = currentIndex === -1
          ? history.length - 1
          : Math.max(0, currentIndex - 1);
        const entry = history[nextIndex];
        if (entry !== undefined) onChange(entry);
        return;
      }

      if (key.downArrow) {
        const currentIndex = history.indexOf(value);
        if (currentIndex === -1 || currentIndex === history.length - 1) {
          onChange("");
        } else {
          const entry = history[currentIndex + 1];
          if (entry !== undefined) onChange(entry);
        }
        return;
      }

      if (key.tab) {
        onChange(tabComplete(value));
        return;
      }
    },
    { isActive: !disabled },
  );

  const handleSubmit = useCallback(
    (submitted: string) => {
      const trimmed = submitted.trim();
      if (!trimmed || disabled) return;
      onChange("");
      onSubmit(trimmed);
    },
    [disabled, onChange, onSubmit],
  );

  if (disabled) {
    return (
      <Box borderStyle="single" borderColor={theme.dim} paddingX={1}>
        <Text color={theme.dim}>
          <Spinner type="dots" />
          {" running..."}
        </Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderColor={theme.accent} paddingX={1}>
      <Text color={theme.accent}>{"> "}</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={handleSubmit}
        placeholder="type a message..."
      />
    </Box>
  );
}
