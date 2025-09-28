interface PlayerMove {
  playerId: string;
  moveType: string;
  payload: any;      // move-specific data
  timestamp: number;
  moveId?: string;
}
GameState / StateChange:

interface GameState {
  board: any[];
  players: { id: string, score: number }[];
  turn: string;
  timestamp: number;
}

interface StateChange {
  changes: Partial<GameState>;
  events?: string[];
  timestamp: number;
}


Event Map with Payloads
2. NetworkEngine Engine → emits
Event	Payload	Listeners
playerMove	PlayerMove object (see above)	GameEngine, RenderEngine
playerJoined	{ playerId: string, playerName?: string }	GameEngine, RenderEngine
playerLeft	{ playerId: string }	GameEngine, RenderEngine
roomCreated	{ roomId: string, hostId: string }	GameWork
roomClosed	{ roomId: string }	GameWork, RenderEngine
error	{ code: string, message: string }	GameWork, RenderEngine
3. Game Engine → emits
Event	Payload	Listeners
stateChange	GameState or StateChange object (full snapshot or diff)	RenderEngine, NetworkEngine
playerMoveApplied	PlayerMove object	RenderEngine
turnChange	{ currentPlayerId: string }	RenderEngine, NetworkEngine
gameOver	{ winnerId?: string, scores: Record<string, number> }	RenderEngine, NetworkEngine
scoreUpdate	{ scores: Record<string, number> }	RenderEngine
error	{ code: string, message: string }	RenderEngine