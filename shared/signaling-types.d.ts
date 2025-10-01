export interface Player {
    id: string;
    name?: string;
    isHost?: boolean;
    isConnected?: boolean;
    lastSeen?: number;
    [key: string]: any;
}
export interface GameRoom {
    id: string;
    name: string;
    hostId: string;
    players: Map<string, Player>;
    maxPlayers: number;
    gameType: string;
    createdAt: number;
}
export interface SignalingMessage {
    type: 'offer' | 'answer' | 'ice_candidate' | 'room_info' | 'join_request' | 'lookup_room' | 'room_found' | 'room_joined';
    payload: any;
    from: string;
    to?: string;
    roomId: string;
}
export interface ClientMessage {
    type: 'server_message' | 'signaling_message' | 'ping';
    payload: any;
}
export interface ServerMessage {
    type: 'room_joined' | 'room_left' | 'signaling_message' | 'room_update' | 'error' | 'pong' | 'room_found';
    payload: any;
    roomId?: string;
}
//# sourceMappingURL=signaling-types.d.ts.map