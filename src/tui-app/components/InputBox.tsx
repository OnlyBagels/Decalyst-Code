import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";

interface Props {
  disabled: boolean;
  history: string[];
  onSubmit: (value: string) => void;
}

export function InputBox({ disabled, history, onSubmit }: Props): React.JSX.Element {
  const [value, setValue] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput(
    (_, key) => {
      if (disabled) return;

      if (key.upArrow) {
        const nextIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(nextIndex);
        const entry = history[history.length - 1 - nextIndex];
        if (entry !== undefined) setValue(entry);
        return;
      }

      if (key.downArrow) {
        const nextIndex = historyIndex - 1;
        if (nextIndex < 0) {
          setHistoryIndex(-1);
          setValue("");
        } else {
          setHistoryIndex(nextIndex);
          const entry = history[history.length - 1 - nextIndex];
          if (entry !== undefined) setValue(entry);
        }
        return;
      }
    },
    { isActive: !disabled },
  );

  const handleSubmit = useCallback(
    (submitted: string) => {
      const trimmed = submitted.trim();
      if (!trimmed || disabled) return;
      setValue("");
      setHistoryIndex(-1);
      onSubmit(trimmed);
    },
    [disabled, onSubmit],
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
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="type a message..."
      />
    </Box>
  );
}
