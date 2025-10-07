import { WebRTCManager } from './WebRTCManager';
import { SignalingService } from './SignalingService';
import { Player, GameRoom, SignalingMessage, answerMessage, offerMessage, iceCandidateMessage } from '../../shared/signaling-types';
import { v4 as uuidv4 } from 'uuid';
import { PlayerAction, StateChange } from '../events/EventFlow';

export class NetworkEngine {
  private webrtc: WebRTCManager;
  private signaling: SignalingService | null = null;
  private owner: Player | null = null;
  protected gameWork: any;

  constructor(gameWork: any) {
    this.gameWork = gameWork;
    this.webrtc = new WebRTCManager(this);
    // Defer initialization until GameWork is ready
  }

  /**
   * Initialize networking components after GameWork state is ready
   */
  initialize(): void {
    this.owner = this.gameWork.getOwner();
    this.signaling = new SignalingService(this.gameWork.config.signalServiceConfig);
    
    // Setup signaling message handlers
    this.setupSignalingHandlers();
  }

  getRoom(): GameRoom | undefined {
    return this.gameWork.getRoom();
  }

  // === DIRECT METHOD CALLS (Hybrid Architecture) ===
  
  /**
   * Update game state - called directly by GameWork
   */
  updateState(gameState: any): void {
    // Broadcast state changes to all connected peers
    const room = this.gameWork.getRoom();
    if (this.webrtc && room) {
      this.webrtc.broadcastMessage({
        type: 'stateChange',
        payload: gameState
      });
    }
  }

  /**
   * Update room information - called directly by GameWork
   */
  updateRoom(room: GameRoom, isHost: boolean): void {
    this.webrtc.setRoom(room);
  }

  /**
   * Process player action - called directly by GameWork
   */
  processPlayerAction(action: PlayerAction): void {
    // Send to host for processing
    const room = this.gameWork.getRoom();
    if (this.webrtc && room) {
      this.webrtc.sendMessage(room.hostId, action);
    }
  }

  async onSendPlayerAction(payload: PlayerAction): Promise<void> {
    console.log('[NetworkEngine] onSendPlayerAction called with:', payload.action);
    console.log('[NetworkEngine] Payload details:', payload);
    
    // Only handle game actions (not room management)
    const gameActions = ['PlayerMove', 'RestartGame'];
    if (!gameActions.includes(payload.action)) {
      console.log('[NetworkEngine] Not a game action, ignoring:', payload.action);
      return;
    }
    
    // Send game actions to the host via WebRTC
    const room = this.gameWork.getRoom();
    console.log('[NetworkEngine] Current room:', room);
    console.log('[NetworkEngine] WebRTC manager:', this.webrtc);
    
    if (this.webrtc && room?.hostId) {
      console.log('[NetworkEngine] Sending game action to host via WebRTC:', room.hostId);
      this.webrtc.sendMessage(room.hostId, payload);
    } else {
      console.log('[NetworkEngine] No WebRTC connection or room, cannot send game action');
      console.log('[NetworkEngine] WebRTC:', this.webrtc, 'Room:', room);
    }
  }
  async onReceivePlayerAction(paction: PlayerAction): Promise<void> {
    console.log('[NetworkEngine] onReceivePlayerAction called with:', paction.action);
    console.log('[NetworkEngine] Action details:', paction);
    const action = paction.action;
    switch (action) {
      case 'CreateRoomRequest':
        console.log('[NetworkEngine] Processing CreateRoomRequest');
        const createRoomMessage: SignalingMessage = {
          type: 'RoomUpdate',
          action: action,
          from: paction.playerId,
          payload: {
            ...paction.input || {}
          }
        } as SignalingMessage;
        console.log('[NetworkEngine] Created signaling message:', createRoomMessage);
        console.log('[NetworkEngine] Signaling service:', this.signaling);
        this.signaling?.sendMessage(createRoomMessage);
        console.log('[NetworkEngine] CreateRoomRequest sent via signaling service');
        break;

      case 'JoinRoomRequest':
        const joinRoomMessage: SignalingMessage = {
          type: 'RoomUpdate',
          action: action,
          from: paction.playerId,
          payload: {
            ...paction.input || {}
          }
        } as SignalingMessage;
        this.signaling?.sendMessage(joinRoomMessage);
        break;

      case 'LeaveRoomRequest':
        const room = this.gameWork.getRoom();
        this.gameWork.sendStateChange({
          type: 'system',
          action: 'LeaveRoom',
          payload: {
            roomId: room?.id,
            playerId: paction.playerId
          }
        });
        break;
      default:
        break;
    }
  }
  async onSendStateChange(schange: StateChange): Promise<void> {
    console.log('[NetworkEngine] Sending state change:', schange.type);
    this.webrtc?.broadcastMessage(schange);
  }
  async onReceiveStateChange(schange: StateChange): Promise<void> {
    console.log('[NetworkEngine] Received state change:', schange.type);
    // NetworkEngine doesn't need to handle state changes in hybrid architecture
    // All internal communication is done via direct method calls
  }

  /**
   * Setup signaling message handlers for host-based room management
   */
  private setupSignalingHandlers(): void {
    console.log('[NetworkEngine] Setting up signaling handlers');
    console.log('[NetworkEngine] Signaling service:', this.signaling);
    
    this.signaling?.onMessage((message: any) => {
      console.log('[NetworkEngine] Received signaling message:', message.type, message.action);
      console.log('[NetworkEngine] Full message:', message);
      switch (message.type) {
        case 'RoomUpdate':
          console.log('[NetworkEngine] Handling RoomUpdate message');
          this.handleRoomUpdate(message);
          break;
        case 'SignalingMessage':
          console.log('[NetworkEngine] Handling SignalingMessage');
          this.handleSignalingMessages(message);
          break;
        default:
          console.log('[NetworkEngine] Unknown message type:', message.type);
      }
    });
    
    console.log('[NetworkEngine] Signaling handlers setup complete');
  }

  private handleRoomUpdate(message: SignalingMessage): void {
    console.log('[NetworkEngine] handleRoomUpdate called with action:', message.action);
    console.log('[NetworkEngine] Message payload:', message.payload);
    
    switch (message.action) {
      case 'CreateRoom':
        console.log('[NetworkEngine] Processing CreateRoom confirmation');
        console.log('[NetworkEngine] Room ID:', message.payload.roomId);
        console.log('[NetworkEngine] Room Code:', message.payload.roomCode);
        
        // Server confirmed room creation - update GameWork state directly
        const newRoom = {
          id: message.payload.roomId,
          roomCode: message.payload.roomCode, // Store the server-generated room code
          hostId: this.owner!.id,
          players: new Map([[this.owner!.id, this.owner!]]),
        } as GameRoom;
        
        // Set room in WebRTC manager
        this.webrtc.setRoom(newRoom);
        
        // Update GameWork state directly (hybrid architecture)
        this.gameWork.handleRoomUpdate(newRoom);
        console.log('[NetworkEngine] Room created and GameWork state updated directly');
        break;
      case 'JoinRoom':
        console.log('[NetworkEngine] JoinRoom message received');
        console.log('[NetworkEngine] Message payload:', message.payload);
        
        // Check if we're the host or client
        const isHost = this.owner?.id === message.payload.hostId;
        console.log('[NetworkEngine] Is host:', isHost, 'Owner ID:', this.owner?.id, 'Host ID:', message.payload.hostId);
        
        if (isHost) {
          // Host: A client joined our room
          console.log('[NetworkEngine] Host: Client joined room, setting up WebRTC connection');
          
          // Add the new player to our room
          const newPlayer: Player = {
            id: message.payload.playerId,
            connection: undefined,
            dataChannel: undefined,
            isConnected: false
          };
          
          // Update room with new player
          const currentRoom = this.gameWork.getRoom();
          if (currentRoom) {
            currentRoom.players.set(newPlayer.id, newPlayer);
            this.gameWork.addConnectedPlayer(newPlayer);
          }
          
          // Host initiates WebRTC connection (creates offer)
          console.log('[NetworkEngine] Host: Initiating WebRTC connection with client:', message.payload.playerId);
          this.webrtc.initiateConnection(message.payload.playerId);
          
        } else {
          // Client: We joined a room
          console.log('[NetworkEngine] Client: Joined room, setting up WebRTC connection');
          
          // Create room object for client (minimal - just for GameWork state)
          const clientRoom = {
            id: message.payload.roomId,
            roomCode: message.payload.roomCode,
            hostId: message.payload.hostId || message.from,
            players: new Map([[this.owner!.id, this.owner!]]), // Only self
          } as GameRoom;
          
          // Update GameWork state (this will update UI with room info)
          this.gameWork.handleRoomUpdate(clientRoom);
          
          // Client waits for host's offer (no WebRTC setup needed yet)
          console.log('[NetworkEngine] Client: Waiting for host offer');
        }
        
        console.log('[NetworkEngine] JoinRoom handling complete');
        break;
      case 'CloseRoomRequest':
        // Handle room closure directly
        const room = this.gameWork.getRoom();
        if (room?.hostId === this.owner?.id) {
          // Host leaving - disconnect all and clear room
          this.webrtc?.disconnectAll();
          this.gameWork.handleRoomUpdate(undefined as any);
        }
        break;
    }
  }


  /**
   * Handle WebRTC signaling messages
   */
  private async handleSignalingMessages(message: SignalingMessage): Promise<void> {
    switch (message.action) {
      case 'offer':
        console.log('[NetworkEngine] Received offer from:', message.from);
        
        console.log('[NetworkEngine] Creating answer for offer from:', message.from);
        const answer = await this.webrtc?.handleOffer(message as offerMessage);
        let msg =  {
          type: 'SignalingMessage',
          action: 'answer',
          from: this.owner?.id || '',
          payload: {
            to: message.from,
            answer: answer
          }
        } as answerMessage;
        console.log('[NetworkEngine] Sending answer to:', message.from);
        await this.signaling?.sendMessage(msg);
        break;
      case 'answer':
        console.log('[NetworkEngine] Received answer from:', message.from);
        await this.webrtc?.handleAnswer(message as answerMessage);
        break;
      case 'ice_candidate':
        await this.webrtc?.handleIceCandidate(message as iceCandidateMessage);
        break;
    }
  }
}
