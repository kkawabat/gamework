// Game State Interface
export interface GameState {
  stage: string;
  tick: number;            // current game tick
  players: {
    [playerId: string]: {
      [key: string]: any;  // game-specific player data
    };
  };
  gameData?: {
    [key: string]: any;    // game-specific state data
  };
  metadata?: {
    gameMode?: string;
    round?: number;
    phase?: string;
    [key: string]: any;    // additional game metadata
  };
}

// Client → Host
export interface PlayerAction {
  action: "CreateRoomRequest" | "JoinRoomRequest" | "LeaveRoomRequest" | "PlayerMove" | "RestartGame" | string;
  tick?: number;            // game tick when action occurred
  seq?: number;             // per-player sequence number for dedup/reorder
  playerId: string;        // sender ID
  input?: {
    [key: string]: any;    // extension for game-specific actions
  };
}

// Host → Client
export interface StateChange {
  tick?: number;            // tick this state corresponds to
  type: "delta" | "snapshot" | "system";
  action: string;
  payload?: {
    [key: string]: any;
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

