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
  createRoomComplete?: StateChange;
}

export type EventName = keyof EventPayloadMap

export interface EventHandler<P> {
  method: string;
  component: string;
}

export interface EventConfig<P> {
  sender: EventHandler<P>;
  listeners: EventHandler<P>[];
  __payloadType__?: (p: P) => void;
}

export type EventFlows<M extends Record<string, any>> = {
  [K in keyof M]: EventConfig<M[K]>;
};


export const ThinClientEventFlow = {
  sendPlayerAction: {
    sender: { method: 'onSendPlayerAction', component: 'UIEngine' },
    listeners: [
      { method: 'onReceivePlayerAction', component: 'NetworkEngine' }
    ],
  },
  receivePlayerAction: {
    sender: { method: 'onSendPlayerAction', component: 'NetworkEngine' },
    listeners: [
      { method: 'onReceivePlayerAction', component: 'GameEngine' }
    ],
  },
  sendStateChange: {
    sender: { method: 'onSendStateChange', component: 'GameEngine' },
    listeners: [
      { method: 'onReceiveStateChange', component: 'NetworkEngine' }
    ],
  },
  receiveStateChange: {
    sender: { method: 'onSendStateChange', component: 'NetworkEngine' },
    listeners: [
      { method: 'onReceiveStateChange', component: 'NetworkEngine' },
      { method: 'onReceiveStateChange', component: 'UIEngine' }
    ],
  },
} as const satisfies EventFlows<EventPayloadMap>

export const ClientPredictionEventFlow = {
  sendPlayerAction: {
    sender: { method: 'onSendPlayerAction', component: 'UIEngine' },
    listeners: [
      { method: 'onReceivePlayerAction', component: 'NetworkEngine' },
      { method: 'onReceivePlayerAction', component: 'GameEngine' }
    ],
  },
  receivePlayerAction: {
    sender: { method: 'onSendPlayerAction', component: 'NetworkEngine' },
    listeners: [
      { method: 'onReceivePlayerAction', component: 'GameEngine' }
    ],
  },
  sendStateChange: {
    sender: { method: 'onSendStateChange', component: 'GameEngine' },
    listeners: [
      { method: 'onReceiveStateChange', component: 'NetworkEngine' },
      { method: 'onReceiveStateChange', component: 'UIEngine' }
    ],
  },
  receiveStateChange: {
    sender: { method: 'onSendStateChange', component: 'NetworkEngine' },
    listeners: [
      { method: 'onReceiveStateChange', component: 'UIEngine' },
      { method: 'onReceiveStateChange', component: 'GameEngine' }
    ],
  },
} as const satisfies EventFlows<EventPayloadMap>

export const DeterministicLockstepEventFlow = {
  sendPlayerAction: {
    sender: { method: 'onSendPlayerAction', component: 'UIEngine' },
    listeners: [
      { method: 'onReceivePlayerAction', component: 'NetworkEngine' }
    ],
  },
  receivePlayerAction: {
    sender: { method: 'onSendPlayerAction', component: 'NetworkEngine' },
    listeners: [
      { method: 'onReceivePlayerAction', component: 'GameEngine' }
    ],
  },
  receiveStateChange: {
    sender: { method: 'onSendStateChange', component: 'GameEngine' },
    listeners: [
      { method: 'onReceiveStateChange', component: 'UIEngine' }
    ],
  },
} as const satisfies EventFlows<EventPayloadMap>

