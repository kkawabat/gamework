import { SignalingMessage, GameRoom } from '../types';
export { WebSocketSignalingService, WebSocketSignalingConfig } from './WebSocketSignalingService';

export interface SignalingService {
  connect(): Promise<void>;
  disconnect(): void;
  joinRoom(roomId: string, playerId: string): Promise<void>;
  leaveRoom(roomId: string, playerId: string): Promise<void>;
  sendMessage(message: SignalingMessage): Promise<void>;
  handleSignalingMessage(message: SignalingMessage, webrtcManager: any, playerId: string): Promise<void>;
  onMessage(callback: (message: SignalingMessage) => void): void;
  onRoomUpdate(callback: (room: GameRoom) => void): void;
  onError(callback: (error: Error) => void): void;
}