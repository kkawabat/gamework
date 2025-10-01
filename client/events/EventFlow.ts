// Client → Host
export interface PlayerAction {
  t: "playerMove";         // event type
  tick: number;            // game tick when action occurred
  seq: number;             // per-player sequence number for dedup/reorder
  playerId: string;        // sender ID
  input: {
    action?: string;    // e.g. ["jump", "shoot"]
    [key: string]: any;    // extension for game-specific actions
  };
}

// Host → Client
export interface StateChange {
  t: "stateChange";        // event type
  tick: number;            // tick this state corresponds to
  kind: "delta" | "snapshot" | "lobby" | "start" | "end" | "pause" | "resume" | "system";
  
  // delta-specific
  baseTick?: number;       // for "delta": tick this delta is based on
  changes?: any[];         // for "delta": compact list of state changes

  // snapshot-specific
  fullState?: any;         // for "snapshot": authoritative full game state

  // optional metadata (for lifecycle/system)
  meta?: {
    reason?: string;       // e.g. why ended, why paused
    [key: string]: any;    // flexible field for extra context
  };
}

export type EventPayload = PlayerAction | StateChange;

export interface EventPayloadMap {
  sendPlayerAction?: PlayerAction;
  receivePlayerAction?: PlayerAction;
  sendStateChange?: StateChange;
  receiveStateChange?: StateChange;
}

export type EventName = keyof EventPayloadMap

export interface EventConfig<P> {
  senders: string[];
  listeners: string[];
  __payloadType__?: (p: P) => void;
}

export type EventFlows<M extends Record<string, any>> = {
  [K in keyof M]: EventConfig<M[K]>;
};


export const ThinClientEventFlow = {
  sendPlayerAction: {
    senders: ['UIEngine'],
    listeners: ['NetworkEngine'],
  },
  receivePlayerAction: {
    senders: ['NetworkEngine'],
    listeners: ['GameEngine'],
  },
  sendStateChange: {
    senders: ['GameEngine'],
    listeners: ['NetworkEngine'],
  },
  receiveStateChange: {
    senders: ['NetworkEngine'],
    listeners: ['UIEngine'],
  },
} as const satisfies EventFlows<EventPayloadMap>

export const ClientPredictionEventFlow = {
  sendPlayerAction: {
    senders: ['UIEngine'],
    listeners: ['NetworkEngine', 'GameEngine'],
  },
  receivePlayerAction: {
    senders: ['NetworkEngine'],
    listeners: ['GameEngine'],
  },
  sendStateChange: {
    senders: ['GameEngine'],
    listeners: ['NetworkEngine', 'UIEngine'],
  },
  receiveStateChange: {
    senders: ['NetworkEngine'],
    listeners: ['UIEngine', 'GameEngine'],
  },
} as const satisfies EventFlows<EventPayloadMap>

export const DeterministicLockstepEventFlow = {
  sendPlayerAction: {
    senders: ['UIEngine'],
    listeners: ['NetworkEngine'],
  },
  receivePlayerAction: {
    senders: ['NetworkEngine'],
    listeners: ['GameEngine'],
  },
  receiveStateChange: {
    senders: ['GameEngine'],
    listeners: ['UIEngine'],
  },
} as const satisfies EventFlows<EventPayloadMap>

