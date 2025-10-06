import { UIEngine } from '../../../client';
import { TicTacToeAction, TicTacToeEngine, TicTacToeState } from './game-engine';
import { generateQRCode } from '../../../client/utils';
import { StateChange, GameState } from '../../../client/events/EventFlow';
import { GameRoom } from '../../../shared/signaling-types';

export class TicTacToeUIEngine extends UIEngine<TicTacToeState, TicTacToeAction> {
  private boardElements: HTMLElement[] = [];
  private statusElement: HTMLElement | null = null;
  private currentPlayerElement: HTMLElement | null = null;
  private restartButton: HTMLElement | null = null;
  private joinRoomBtn: HTMLElement | null = null;
  private roomCodeInput: HTMLInputElement | null = null;
  private gameEngine: TicTacToeEngine;
  private isHost: boolean = false;
  private currentGameState?: GameState;
  private currentRoom?: GameRoom;

  // === DIRECT METHOD CALLS (Hybrid Architecture) ===
  
  /**
   * Update game state - called directly by GameWork
   */
  updateState(gameState: GameState): void {
    this.currentGameState = gameState;
    this.render();
  }

  /**
   * Update room information - called directly by GameWork
   */
  updateRoom(room: GameRoom, isHost: boolean): void {
    this.currentRoom = room;
    this.isHost = isHost;
    this.render();
  }

  /**
   * Initialize UI elements and event listeners
   */
  initialize(): void {
    // Get board elements
    this.boardElements = Array.from(document.querySelectorAll('.cell'));
    this.boardElements.forEach((cell, index) => {
      const action: TicTacToeAction = {
        action: 'playerMove',
        playerId: this.gameWork.getOwner().id,
        input: {
          position: index
        }
      }
      cell.addEventListener('click', () => this.gameWork.sendPlayerAction(action));
    });
    
    this.statusElement = document.getElementById('status');
    this.currentPlayerElement = document.getElementById('current-player');
    
    this.restartButton = document.getElementById('restart');
    if (this.restartButton) {
      const action: TicTacToeAction = {
        action: 'RestartGame',
        playerId: this.gameWork.getOwner().id,
      }
      this.restartButton.addEventListener('click', () => this.gameWork.sendPlayerAction(action));
    }
    
    
    this.roomCodeInput = document.getElementById('roomCodeInput') as HTMLInputElement;
    this.joinRoomBtn = document.getElementById('joinRoomBtn');
    if (this.joinRoomBtn) {
      this.joinRoomBtn.addEventListener('click', () => {
        let roomCode = this.roomCodeInput?.value
        if (roomCode) {
          const action: TicTacToeAction = {
            action: 'JoinRoom',
            playerId: this.gameWork.getOwner().id,
            input: { roomCode: roomCode }
          }
          this.gameWork.sendPlayerAction(action)
        }
      });
    }
    
    
    if (this.roomCodeInput) {
      this.roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          let roomCode = this.roomCodeInput?.value
          if (roomCode) {
            const action: TicTacToeAction = {
              action: 'JoinRoom',
              playerId: this.gameWork.getOwner().id,
              input: { roomCode: roomCode }
            }
            this.gameWork.sendPlayerAction(action);
          }
        }
      });
    }

    this.initializeQRCode()
  }

  /**
   * Update UI based on current game state
   */
  public render(): void {
    const state = this.currentGameState || this.gameWork.getState();
    
    this.updateBoard(state.gameData.board);
    this.updateStatus(state);
    this.updateCurrentPlayer(state);
    this.updatePlayerStatus(state);
  }

  /**
   * Update the game board display
   */
  private updateBoard(board: ('X' | 'O' | null)[]): void {
    this.boardElements.forEach((cell, index) => {
      const cellValue = board[index];
      cell.textContent = cellValue || '';
      cell.className = `cell ${cellValue ? `player-${cellValue.toLowerCase()}` : ''}`;
    });
  }

  /**
   * Update the game status
   */
  private updateStatus(state: any): void {
    if (!this.statusElement) return;

    if (state.gameData.gameOver) {
      if (state.gameData.winner) {
        this.statusElement.textContent = `Player ${state.gameData.winner} wins!`;
        this.statusElement.className = 'status winner';
      } else {
        this.statusElement.textContent = "It's a draw!";
        this.statusElement.className = 'status draw';
      }
    } else {
      // Check number of players in room instead of game state
      const playerCount = Object.keys(state.players).length || 0;
      
      if (playerCount < 2) {
        this.statusElement.textContent = 'Waiting for player 2 to join';
        this.statusElement.className = 'status waiting';
      } else if (state.gameData.currentPlayer === null) {
        // Both players joined but game hasn't started yet
        this.statusElement.textContent = 'Ready to play! Make the first move';
        this.statusElement.className = 'status ready';
      } else {
        this.statusElement.textContent = `Player ${state.gameData.currentPlayer}'s turn`;
        this.statusElement.className = 'status playing';
      }
    }
  }

  /**
   * Update the current player indicator
   */
  private updateCurrentPlayer(state: TicTacToeState): void {
    if (!this.currentPlayerElement) return;
    let currentPlayer = state.gameData.currentPlayer;
    if (currentPlayer === null) {
      this.currentPlayerElement.textContent = 'Waiting for first move...';
      this.currentPlayerElement.className = 'current-player waiting';
    } else {
      this.currentPlayerElement.textContent = `Current Player: ${currentPlayer}`;
      this.currentPlayerElement.className = `current-player ${currentPlayer.toLowerCase()}`;
    }
  }

  /**
   * Update player status indicators
   */
  private updatePlayerStatus(state: TicTacToeState): void {
    
    const players = state.players;
    
    const playerCount = players.length;
    const playerCountElement = document.getElementById('playerCount');
    if (playerCountElement) {
      playerCountElement.textContent = `Players: ${playerCount}`;
    }

    const me = this.gameWork.getOwner()
    const player1Status = document.getElementById('player1Status');
    if (player1Status) {
      const role = state.players[me.id].symbol;
      player1Status.textContent = `You - ${role ? `Playing as ${role}` : 'Connected'}`;
    }
    
    // Update Player 2 status
    const player2Status = document.getElementById('player2Status');
    if (player2Status) {
      const player2Id = Object.keys(state.players).find(k => k !== me.id)!;
      if (player2Id) {
        const role = state.players[player2Id].symbol;
        player2Status.textContent = `Player 2 - ${role ? `Playing as ${role}` : 'Connected'}`;
      } else {
        player2Status.textContent = 'Waiting for player...';
      }
    }
  }

  /**
   * Update join room button status
   */
  public updateJoinRoomButtonStatus(text: string, disabled: boolean = false): void {
    const joinRoomBtn = document.getElementById('joinRoomBtn') as HTMLButtonElement;
    if (joinRoomBtn) {
      joinRoomBtn.textContent = text;
      joinRoomBtn.disabled = disabled;
      
      // Update button styling based on status
      if (text === 'Connecting...') {
        joinRoomBtn.style.background = '#ffc107';
        joinRoomBtn.style.color = '#000';
      } else if (text === 'Joined!') {
        joinRoomBtn.style.background = '#28a745';
        joinRoomBtn.style.color = '#fff';
      } else {
        // Reset to default styling
        joinRoomBtn.style.background = '#28a745';
        joinRoomBtn.style.color = '#fff';
      }
    }
  }

  async initializeQRCode(): Promise<void> {
     // Check if joining an existing room via URL parameter
     const urlParams = new URLSearchParams(window.location.search);
     const roomParam = urlParams.get('room');
     
     let roomId: string;
     
     if (roomParam) {
       // Join existing room by room code
       console.log(`Looking up room with code: ${roomParam}`);
       this.addGameLogEntry(`Looking up room: ${roomParam.toUpperCase()}`, 'info');
       this.gameWork.sendPlayerAction({
        action: 'JoinRoomRequest',
        playerId: this.gameWork.getOwner().id,
        input: { roomCode: roomParam }
       })
     } else {
       // Host a new room
       this.addGameLogEntry('Creating new game room...', 'info');
       this.gameWork.sendPlayerAction({
        action: 'CreateRoomRequest',
        playerId: this.gameWork.getOwner().id,
       })
     }
     
  }

  async onReceiveStateChange(schange: StateChange): Promise<void> {
    switch (schange.type) {
      case 'system':
        switch (schange.action) {
          case 'CreateRoomComplete':
            // WebRTC is fully initialized - safe to access room data
            // Determine if this player is the host
            this.isHost = this.gameWork.getOwner()?.isHost || false;
            
            // Get room data (WebRTC is now ready)
            const room = this.gameWork.getRoom();
            const roomId = schange.payload?.roomId;
            const players = room?.players.values() || [];
            const playerCount = players.length;
            
            console.log(`Room Code: ${roomId.substring(0, 6).toUpperCase()}, Is host: ${this.isHost}, Player count: ${playerCount}`);
            
            // Update room code and QR code
            this.updateRoomCode(roomId);
            await this.generateQRCode(roomId);
            
            const urlParams = new URLSearchParams(window.location.search);
            const roomParam = urlParams.get('room');

            // Update join room button status if we joined an existing room
            if (roomParam) {
              this.updateJoinRoomButtonStatus('Joined!', true);
            }
            
            // Update game log with successful initialization
            this.addGameLogEntry('Game initialized successfully!', 'success');
            this.addGameLogEntry(`Room Code: ${roomId.substring(0, 6).toUpperCase()}`, 'info');
            this.addGameLogEntry(`Status: ${this.isHost ? 'Host' : 'Player'}`, 'info');
            
            if (roomParam) {
              this.addGameLogEntry(`Joined existing room: ${roomId.substring(0, 6).toUpperCase()}`, 'success');
            } else {
              this.addGameLogEntry(`Hosted new room: ${roomId.substring(0, 6).toUpperCase()}`, 'success');
            }
            break;
      }
      default:
        this.render();
        break;
    }
  }

  /**
   * Update room code display
   */
  private updateRoomCode(roomId: string): void {
    const roomCodeElement = document.getElementById('roomCode');
    if (roomCodeElement) {
      // Use 6 characters for convenience
      const shortCode = roomId.substring(0, 6).toUpperCase();
      roomCodeElement.textContent = shortCode;
    }
  }

  /**
   * Generate QR code for room joining
   */
  private async generateQRCode(roomId: string): Promise<void> {
    const qrContainer = document.getElementById('qrCodeContainer');
    if (!qrContainer) return;

    try {
      // Use the existing generateQRCode utility
      const qrCodeDataURL = await generateQRCode(roomId);
      const shortCode = roomId.substring(0, 6).toUpperCase();

      // Update QR code container
      qrContainer.innerHTML = `
        <img src="${qrCodeDataURL}" alt="QR Code for Room ${shortCode}" />
        <p style="font-size: 12px; color: #666; margin-top: 10px;">
          Scan to join room: ${shortCode}
        </p>
      `;
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      qrContainer.innerHTML = '<p style="color: red;">Failed to generate QR code</p>';
    }
  }


    /**
  * Add an entry to the game log
  */
  public addGameLogEntry(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const gameLogElement = document.getElementById('gameLog');
    if (!gameLogElement) return;

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    gameLogElement.appendChild(logEntry);
    
    // Auto-scroll to bottom
    gameLogElement.scrollTop = gameLogElement.scrollHeight;
  }
}

  