import React, { useState } from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";

interface Request {
  question: string;
  options?: string[];
  resolve: (answer: string) => void;
}

interface Props {
  request: Request;
  onClose: () => void;
}

export function AskUserModal({ request, onClose }: Props): React.JSX.Element {
  const [freeValue, setFreeValue] = useState("");

  const handleSelect = (item: { label: string; value: string }) => {
    request.resolve(item.label);
    onClose();
  };

  const handleFreeSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    request.resolve(trimmed);
    onClose();
  };

  const items = request.options?.map((opt) => ({ label: opt, value: opt })) ?? [];

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.accent}
      paddingX={2}
      paddingY={1}
    >
      <Text color={theme.accent} bold>question</Text>
      <Text> </Text>
      <Text color={theme.agent}>{request.question}</Text>
      <Text> </Text>

      {items.length > 0 ? (
        <SelectInput items={items} onSelect={handleSelect} />
      ) : (
        <Box>
          <Text color={theme.dim}>{"> "}</Text>
          <TextInput
            value={freeValue}
            onChange={setFreeValue}
            onSubmit={handleFreeSubmit}
            placeholder="type answer..."
          />
        </Box>
      )}
    </Box>
  );
}
