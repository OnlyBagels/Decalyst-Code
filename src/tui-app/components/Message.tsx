import React from "react";
import { Text } from "ink";
import type { Message as Msg } from "../../agent/session-state.js";
import { theme } from "../theme.js";

interface Props {
  msg: Msg;
}

export function Message({ msg }: Props): React.JSX.Element {
  if (msg.kind === "user") {
    return (
      <Text color={theme.user} wrap="wrap">{`> ${msg.text}`}</Text>
    );
  }
  if (msg.kind === "agent") {
    return (
      <Text color={theme.agent} wrap="wrap">{`  ${msg.text}`}</Text>
    );
  }
  if (msg.kind === "build") {
    return (
      <Text color={theme.build} wrap="wrap">{`  [build] ${msg.line}`}</Text>
    );
  }
  return (
    <Text color={theme.system} wrap="wrap">{`  [system] ${msg.text}`}</Text>
  );
}
