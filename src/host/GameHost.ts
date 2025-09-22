import { GameEngine } from '../core/GameEngine';
import { WebRTCManager } from '../networking/WebRTCManager';
import { SignalingService, InMemorySignalingService } from '../networking/SignalingService';
import { 
  GameConfig, 
  GameState, 
  GameMove, 
  Player, 
  GameMessage, 
  GameRoom,
  SignalingMessage,
  HostConfig
} from '../types';
import { v4 as uuidv4 } from 'uuid';

export class GameHost {
  private engine: GameEngine;
  private webrtc: WebRTCManager;
  private signaling: SignalingService;
  private config: HostConfig;
  private room: GameRoom;
  private hostPlayer: Player;
  private isRunning = false;

  // Event callbacks
  private onStateUpdate?: (state: GameState) => void;
  private onPlayerJoin?: (player: Player) => void;
  private onPlayerLeave?: (playerId: string) => void;
  private onRoomUpdate?: (room: GameRoom) => void;
  private onGameOver?: (winner: string | null) => void;
  private onError?: (error: Error) => void;

  constructor(config: HostConfig, signalingService?: SignalingService) {
    this.config = config;
    this.signaling = signalingService || new InMemorySignalingService();
    
    // Initialize game engine
    this.engine = new GameEngine(config.gameConfig.initialState, config.gameConfig.rules);
    
    // Initialize WebRTC manager
    this.webrtc = new WebRTCManager(config.stunServers);
    
    // Create host player
    this.hostPlayer = {
      id: uuidv4(),
      name: 'Host',
      isHost: true,
      isConnected: true,
      lastSeen: Date.now()
    };
    
    // Create room
    this.room = {
      id: config.roomId,
      name: config.roomName,
      hostId: this.hostPlayer.id,
      players: new Map([[this.hostPlayer.id, this.hostPlayer]]),
      maxPlayers: config.gameConfig.maxPlayers,
      gameType: config.gameConfig.gameType,
      createdAt: Date.now()
    };

    this.setupEventHandlers();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Game host is already running');
    }

    try {
      // Connect to signaling service
      await this.signaling.connect();
      await this.signaling.joinRoom(this.room.id, this.hostPlayer.id);
      
      this.isRunning = true;
      console.log(`Game host started for room: ${this.room.name}`);
      
      // Broadcast initial state
      this.broadcastState(true);
      
    } catch (error) {
      console.error('Failed to start game host:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Disconnect all peers
      this.webrtc.disconnectAll();
      
      // Leave signaling room
      await this.signaling.leaveRoom(this.room.id, this.hostPlayer.id);
      this.signaling.disconnect();
      
      this.isRunning = false;
      console.log('Game host stopped');
      
    } catch (error) {
      console.error('Error stopping game host:', error);
    }
  }

  // Game state management
  getCurrentState(): GameState {
    return this.engine.getCurrentState();
  }

  applyMove(move: GameMove): boolean {
    const newState = this.engine.applyMove(move);
    if (newState) {
      // Broadcast state update to all players
      this.broadcastState(false);
      
      // Check if game is over
      if (this.engine.isGameOver()) {
        const winner = this.engine.getWinner();
        if (this.onGameOver) {
          this.onGameOver(winner);
        }
      }
      
      return true;
    }
    return false;
  }

  // Player management
  getPlayers(): Player[] {
    return Array.from(this.room.players.values());
  }

  getPlayer(playerId: string): Player | undefined {
    return this.room.players.get(playerId);
  }

  // Export/Import functionality
  exportGameState(): string {
    return this.engine.exportState();
  }

  importGameState(exportedState: string): boolean {
    const success = this.engine.importState(exportedState);
    if (success) {
      this.broadcastState(true);
    }
    return success;
  }

  // Event handlers
  setStateUpdateHandler(handler: (state: GameState) => void): void {
    this.onStateUpdate = handler;
  }

  setPlayerJoinHandler(handler: (player: Player) => void): void {
    this.onPlayerJoin = handler;
  }

  setPlayerLeaveHandler(handler: (playerId: string) => void): void {
    this.onPlayerLeave = handler;
  }

  setRoomUpdateHandler(handler: (room: GameRoom) => void): void {
    this.onRoomUpdate = handler;
  }

  setGameOverHandler(handler: (winner: string | null) => void): void {
    this.onGameOver = handler;
  }

  setErrorHandler(handler: (error: Error) => void): void {
    this.onError = handler;
  }

  // Private methods
  private setupEventHandlers(): void {
    // WebRTC message handling
    this.webrtc.setMessageHandler((peerId, message) => {
      this.handlePeerMessage(peerId, message);
    });

    this.webrtc.setConnectionChangeHandler((peerId, isConnected) => {
      this.handlePeerConnectionChange(peerId, isConnected);
    });

    // Signaling service message handling
    this.signaling.onMessage((message) => {
      this.handleSignalingMessage(message);
    });

    this.signaling.onRoomUpdate((room) => {
      this.room = room;
      // Notify about room updates for UI updates
      if (this.onRoomUpdate) {
        this.onRoomUpdate(room);
      }
    });

    this.signaling.onError((error) => {
      if (this.onError) {
        this.onError(error);
      }
    });
  }

  private async handlePeerMessage(peerId: string, message: GameMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'join':
          await this.handlePlayerJoin(message.payload);
          break;
          
        case 'input':
          await this.handlePlayerInput(peerId, message.payload);
          break;
          
        case 'resync':
          await this.handleResyncRequest(peerId, message.payload);
          break;
          
        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling peer message:', error);
      this.sendErrorToPeer(peerId, 'MESSAGE_PROCESSING_ERROR', 'Failed to process message');
    }
  }

  private async handlePlayerJoin(joinData: any): Promise<void> {
    const { playerId, playerName } = joinData;
    
    // Create new player
    const newPlayer: Player = {
      id: playerId,
      name: playerName,
      isHost: false,
      isConnected: true,
      lastSeen: Date.now()
    };
    
    // Add to room
    this.room.players.set(playerId, newPlayer);
    
    // Notify callback
    if (this.onPlayerJoin) {
      this.onPlayerJoin(newPlayer);
    }
    
    // Send current state to new player
    this.sendStateToPeer(playerId, true);
  }

  private async handlePlayerInput(peerId: string, move: GameMove): Promise<void> {
    // Validate that the move is from a valid player
    const player = this.room.players.get(peerId);
    if (!player || !player.isConnected) {
      this.sendErrorToPeer(peerId, 'INVALID_PLAYER', 'Player not found or disconnected');
      return;
    }
    
    // Apply the move
    const success = this.applyMove(move);
    if (!success) {
      this.sendErrorToPeer(peerId, 'INVALID_MOVE', 'Move is not valid for current game state');
    }
  }

  private async handleResyncRequest(peerId: string, resyncData: any): Promise<void> {
    const { lastKnownVersion } = resyncData;
    
    // Send full state snapshot for resync
    this.sendStateToPeer(peerId, true);
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'offer':
          const answer = await this.webrtc.handleOffer(message.from, message.payload);
          await this.signaling.sendMessage({
            type: 'answer',
            payload: answer,
            from: this.hostPlayer.id,
            to: message.from,
            roomId: this.room.id
          });
          break;
          
        case 'ice_candidate':
          await this.webrtc.handleIceCandidate(message.from, message.payload);
          break;
          
        default:
          console.warn('Unknown signaling message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }

  private handlePeerConnectionChange(peerId: string, isConnected: boolean): void {
    const player = this.room.players.get(peerId);
    if (player) {
      player.isConnected = isConnected;
      player.lastSeen = Date.now();
      
      if (!isConnected && this.onPlayerLeave) {
        this.onPlayerLeave(peerId);
      }
    }
  }

  private broadcastState(isFullSnapshot: boolean): void {
    const stateMessage = this.engine.createStateMessage(isFullSnapshot);
    
    // Send to all connected peers
    this.webrtc.broadcastMessage(stateMessage);
    
    // Notify local callback
    if (this.onStateUpdate) {
      this.onStateUpdate(stateMessage.payload.state);
    }
  }

  private sendStateToPeer(peerId: string, isFullSnapshot: boolean): void {
    const stateMessage = this.engine.createStateMessage(isFullSnapshot);
    this.webrtc.sendMessage(peerId, stateMessage);
  }

  private sendErrorToPeer(peerId: string, code: string, message: string): void {
    const errorMessage = {
      type: 'error',
      payload: { code, message },
      timestamp: Date.now(),
      messageId: uuidv4()
    };
    
    this.webrtc.sendMessage(peerId, errorMessage);
  }

  // Utility methods
  getRoomInfo(): GameRoom {
    return { ...this.room };
  }

  isGameRunning(): boolean {
    return this.isRunning;
  }

  getGameVersion(): number {
    return this.engine.getCurrentVersion();
  }
}

