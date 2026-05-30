import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, useApp, useInput } from "ink";
import type { EventBus } from "../events/bus.js";
import type { UsageTracker } from "../tui/usage-tracker.js";
import type { AgentRunner } from "../agent/agent-runner.js";
import type { SessionState, Message } from "../agent/session-state.js";
import type { PermissionDecision } from "../events/types.js";
import { Transcript } from "./components/Transcript.js";
import { InputBox } from "./components/InputBox.js";
import { StatsPane } from "./components/StatsPane.js";
import { StatusBar } from "./components/StatusBar.js";
import { LiveRun } from "./components/LiveRun.js";
import { PermissionModal } from "./components/PermissionModal.js";
import { AskUserModal } from "./components/AskUserModal.js";
import { HelpOverlay } from "./components/HelpOverlay.js";

interface Worker {
  id: string;
  phase: string;
}

interface PermissionRequest {
  toolName: string;
  args: unknown;
  resolve: (decision: PermissionDecision) => void;
}

interface AskUserRequest {
  question: string;
  options?: string[];
  resolve: (answer: string) => void;
}

export interface AppProps {
  bus: EventBus;
  tracker: UsageTracker;
  runner: AgentRunner;
  state: SessionState;
  initialWorkspace: string;
  orchestratorModel?: string;
  swarmModel?: string;
}

export function App({
  bus,
  tracker,
  runner,
  state,
  initialWorkspace,
  orchestratorModel,
  swarmModel,
}: AppProps): React.JSX.Element {
  const { exit } = useApp();

  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState("idle");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [permissionQueue, setPermissionQueue] = useState<PermissionRequest[]>([]);
  const [askUserQueue, setAskUserQueue] = useState<AskUserRequest[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  const ctrlCCount = useRef(0);
  const ctrlCTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      ctrlCCount.current += 1;

      if (ctrlCCount.current === 1) {
        if (state.activeRun) {
          state.activeRun.abortController.abort();
          ctrlCCount.current = 0;
        } else {
          ctrlCTimer.current = setTimeout(() => {
            ctrlCCount.current = 0;
          }, 1500);
        }
      } else {
        if (ctrlCTimer.current) clearTimeout(ctrlCTimer.current);
        exit();
      }
      return;
    }

    if (key.ctrl && input === "l") {
      setMessages([]);
      return;
    }

    if (key.escape) {
      if (state.activeRun) {
        state.activeRun.abortController.abort();
        const now = new Date().toISOString();
        bus.emit({
          t: "transcript_message",
          message: { kind: "system", text: "Run cancelled via Esc.", ts: now },
        });
      } else if (inputValue.length > 0) {
        setInputValue("");
      }
      return;
    }

    if (input === "\x1bOP" || (input === "?" && inputValue === "")) {
      setShowHelp(true);
      return;
    }
  });

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      bus.on("transcript_message", (e) => {
        setMessages((prev) => {
          if (prev.some((m) => m.ts === e.message.ts)) return prev;
          return [...prev, e.message as Message];
        });
      }),
    );

    unsubs.push(
      bus.on("mode_change", (e) => {
        setPhase(e.mode);
      }),
    );

    unsubs.push(
      bus.on("worker_started", (e) => {
        setWorkers((prev) => [...prev, { id: e.id, phase: e.role }]);
      }),
    );

    unsubs.push(
      bus.on("worker_finished", (e) => {
        setWorkers((prev) => prev.filter((w) => w.id !== e.id));
      }),
    );

    unsubs.push(
      bus.on("run_finished", () => {
        setIsRunning(false);
        setWorkers([]);
      }),
    );

    unsubs.push(
      bus.on("permission_request", (e) => {
        setPermissionQueue((prev) => [
          ...prev,
          { toolName: e.toolName, args: e.args, resolve: e.resolve },
        ]);
      }),
    );

    unsubs.push(
      bus.on("ask_user", (e) => {
        setAskUserQueue((prev) => [
          ...prev,
          { question: e.question, options: e.options, resolve: e.resolve },
        ]);
      }),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [bus]);

  const handleSubmit = useCallback(
    async (text: string) => {
      const msg: Message = { kind: "user", text, ts: new Date().toISOString() };
      setMessages((prev) => [...prev, msg]);
      setInputHistory((prev) => [...prev, text]);
      setIsRunning(true);

      try {
        const result = await runner.handleInput(text);
        if (result.exit) exit();
      } finally {
        setIsRunning(false);
      }
    },
    [runner, exit],
  );

  const handlePermissionClose = useCallback(() => {
    setPermissionQueue((prev) => prev.slice(1));
  }, []);

  const handleAskUserClose = useCallback(() => {
    setAskUserQueue((prev) => prev.slice(1));
  }, []);

  const allMessages = [...messages, ...state.transcript.filter(
    (m) => !messages.some((em) => em.ts === m.ts),
  )];

  const models = { orchestrator: orchestratorModel, swarm: swarmModel };

  const topPermission = permissionQueue[0];
  const topAskUser = askUserQueue[0];

  return (
    <Box flexDirection="column" height="100%">
      {showHelp && (
        <HelpOverlay onClose={() => setShowHelp(false)} />
      )}

      {!showHelp && topPermission && (
        <PermissionModal request={topPermission} onClose={handlePermissionClose} />
      )}
      {!showHelp && topAskUser && !topPermission && (
        <AskUserModal request={topAskUser} onClose={handleAskUserClose} />
      )}

      {!showHelp && (
        <>
          <Box flexDirection="row" flexGrow={1}>
            <Box flexDirection="column" flexGrow={1}>
              <Transcript messages={allMessages} />
              <LiveRun isRunning={isRunning} workers={workers} />
            </Box>
            <StatsPane
              tracker={tracker}
              workspace={initialWorkspace}
              models={models}
              phase={phase}
              workers={workers}
              messageCount={allMessages.length}
              summaryActive={state.conversationSummary !== undefined}
            />
          </Box>

          <InputBox
            disabled={isRunning}
            history={inputHistory}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={(text) => { void handleSubmit(text); }}
          />

          <StatusBar phase={phase} models={models} hint="/help or ?" />
        </>
      )}
    </Box>
  );
}
