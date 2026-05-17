import React from "react";
import { Box, Static } from "ink";
import type { Message as Msg } from "../../agent/session-state.js";
import { Message } from "./Message.js";

interface Props {
  messages: Msg[];
}

export function Transcript({ messages }: Props): React.JSX.Element {
  const staticMessages = messages.slice(0, -1);
  const liveMessage = messages[messages.length - 1];

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {staticMessages.length > 0 && (
        <Static items={staticMessages}>
          {(msg, i) => <Message key={i} msg={msg} />}
        </Static>
      )}
      {liveMessage !== undefined && <Message msg={liveMessage} />}
    </Box>
  );
}
