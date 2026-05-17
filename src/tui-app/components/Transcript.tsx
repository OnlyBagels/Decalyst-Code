import React from "react";
import { Box } from "ink";
import type { Message as Msg } from "../../agent/session-state.js";
import { Message } from "./Message.js";

interface Props {
  messages: Msg[];
  tailSize?: number;
}

const DEFAULT_TAIL = 80;

export function Transcript({ messages, tailSize = DEFAULT_TAIL }: Props): React.JSX.Element {
  const visible = messages.length > tailSize ? messages.slice(-tailSize) : messages;

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden" width="100%">
      {visible.map((msg, i) => (
        <Box key={`${msg.ts}-${i}`} width="100%">
          <Message msg={msg} />
        </Box>
      ))}
    </Box>
  );
}
