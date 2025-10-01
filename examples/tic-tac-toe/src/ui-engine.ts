import { UIEngine } from '../../../client';
import { TicTacToeEngine } from './game-engine';
import { generateQRCode } from '../../../client/utils';

export class TicTacToeUIEngine extends UIEngine {
  private boardElements: HTMLElement[] = [];
  private statusElement: HTMLElement | null = null;
  private currentPlayerElement: HTMLElement | null = null;
  private gameEngine: TicTacToeEngine;
  private isHost: boolean = false;

  // Event handler methods that match the event system
  onPlayerJoined(payload: { playerId: string, playerName?: string }): void {
    this.addGameLogEntry(`Player joined: ${payload.playerName || payload.playerId}`, 'success');
    this.updateUI();
  }
  onPlayerLeft(payload: { playerId: string }): void {
    this.addGameLogEntry(`Player left: ${payload.playerId}`, 'warning');
    this.updateUI();
  }
  onStateChange(payload: any): void {
    this.addGameLogEntry(`State changed: ${JSON.stringify(payload)}`, 'info');
    this.updateUI();
  }
  onPlayerMove(payload: any): void {
    this.addGameLogEntry(`Player move: ${JSON.stringify(payload)}`, 'info');
    this.updateUI();
  }
  onPlayerMoveApplied(payload: any): void {
    this.addGameLogEntry(`Player move applied: ${JSON.stringify(payload)}`, 'info');
    this.updateUI();
  }
  onTurnChange?(payload: { currentPlayerId: string }): void;
  onGameOver(payload: { winnerId?: string, scores: Record<string, number> }): void {
    this.addGameLogEntry(`Game over: ${JSON.stringify(payload)}`, 'info');
    this.updateUI();
  }
  onScoreUpdate(payload: { scores: Record<string, number> }): void {
    this.addGameLogEntry(`Score update: ${JSON.stringify(payload)}`, 'info');
    this.updateUI();
  }
  onRoomCreated(payload: { roomId: string, hostId: string }): void {
    this.addGameLogEntry(`Room created: ${JSON.stringify(payload)}`, 'success');
    this.updateUI();
  }
  onRoomClosed(payload: { roomId: string }): void{
    this.addGameLogEntry(`Room closed: ${JSON.stringify(payload)}`, 'info');
    this.updateUI();
  }
  // onConnectionLost(payload: { playerId?: string, reason?: string }): void;
  // onConnectionRestored?(payload: { playerId?: string }): void;
  // onChatMessage?(payload: { playerId: string, message: string }): void;
  // onRenderComplete?(payload: { frameTime: number }): void;
  // onAnimationEnd?(payload: { animationId: string }): void;
  // onUiInteraction?(payload: { elementId: string, action: string }): void;
  onError(payload: { code: string, message: string }): void{
    this.addGameLogEntry(`Error: ${JSON.stringify(payload)}`, 'error');
    this.showError(payload.message);
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

  /**
   * Update UI based on current game state
   */
  public updateUI(): void {
    const state = this.gameEngine.getTicTacToeState();
    
    // Update board
    this.updateBoard(state.board);
    
    // Update status
    this.updateStatus(state);
    
    // Update current player indicator
    this.updateCurrentPlayer(state.currentPlayer);
    
    // Update player count
    this.updatePlayerCount();
  }

  /**
   * Update the game board display
   */
  private updateBoard(board: (string | null)[]): void {
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

    if (state.gameOver) {
      if (state.winner) {
        this.statusElement.textContent = `Player ${state.winner} wins!`;
        this.statusElement.className = 'status winner';
      } else {
        this.statusElement.textContent = "It's a draw!";
        this.statusElement.className = 'status draw';
      }
    } else {
      // Check number of players in room instead of game state
      const playerCount = this.gameWork.getPlayers().length || 0;
      
      if (playerCount < 2) {
        this.statusElement.textContent = 'Waiting for player 2 to join';
        this.statusElement.className = 'status waiting';
      } else if (state.currentPlayer === null) {
        // Both players joined but game hasn't started yet
        this.statusElement.textContent = 'Ready to play! Make the first move';
        this.statusElement.className = 'status ready';
      } else {
        this.statusElement.textContent = `Player ${state.currentPlayer}'s turn`;
        this.statusElement.className = 'status playing';
      }
    }

    // Update player status indicators
    this.updatePlayerStatus();
  }

  /**
   * Update the current player indicator
   */
  private updateCurrentPlayer(currentPlayer: string | null): void {
    if (!this.currentPlayerElement) return;
    
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
  private updatePlayerStatus(): void {
    
    const players = this.gameWork.getPlayers();
    
    // Update Player 1 (Host) status
    const player1Status = document.getElementById('player1Status');
    if (player1Status) {
      const hostPlayer = players.find(p => p.isHost);
      if (hostPlayer) {
        const role = this.gameEngine.getPlayerRole(hostPlayer.id);
        player1Status.textContent = `Host - ${role ? `Playing as ${role}` : 'Connected'}`;
      } else {
        player1Status.textContent = 'Host - Connecting...';
      }
    }
    
    // Update Player 2 status
    const player2Status = document.getElementById('player2Status');
    if (player2Status) {
      const otherPlayer = players.find(p => !p.isHost);
      if (otherPlayer) {
        const role = this.gameEngine.getPlayerRole(otherPlayer.id);
        player2Status.textContent = `Player 2 - ${role ? `Playing as ${role}` : 'Connected'}`;
      } else {
        player2Status.textContent = 'Waiting for player...';
      }
    }
  }

  /**
   * Update player count display
   */
  private updatePlayerCount(): void {
    const playerCount = this.gameWork.getPlayers().length;
    const playerCountElement = document.getElementById('playerCount');
    if (playerCountElement) {
      playerCountElement.textContent = `Players: ${playerCount}`;
    }
  }


  /**
  * Show error message to user
  */
  public showError(message: string): void {
    if (this.statusElement) {
      this.statusElement.textContent = `Error: ${message}`;
      this.statusElement.className = 'status error';
    }
  }

  /**
 * Initialize UI elements and event listeners
 */
  initialize(): void {
    // Get board elements
    this.boardElements = Array.from(document.querySelectorAll('.cell'));
    this.boardElements.forEach((cell, index) => {
      cell.addEventListener('click', () => this.gameWork.emit('playerMove', { index }));
    });
    
    // Get status elements
    this.statusElement = document.getElementById('status');
    this.currentPlayerElement = document.getElementById('current-player');
    
    // Add restart button listener
    const restartButton = document.getElementById('restart');
    if (restartButton) {
      restartButton.addEventListener('click', () => this.gameWork.emit('restartGame'));
    }
    
    // Add join room button listener
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    if (joinRoomBtn) {
      joinRoomBtn.addEventListener('click', () => this.gameWork.emit('joinRoom'));
    }
    
    // Add enter key listener for room code input
    const roomCodeInput = document.getElementById('roomCodeInput');
    if (roomCodeInput) {
      roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.gameWork.emit('joinRoom');
        }
      });
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
       
       try {
         const fullRoomId = await this.gameWork.lookupRoom(roomParam);
         if (fullRoomId) {
           this.addGameLogEntry(`Found room: ${fullRoomId.substring(0, 6).toUpperCase()}`, 'success');
           await this.gameWork.joinRoom(fullRoomId);
           roomId = fullRoomId;
         } else {
           throw new Error('Room not found');
         }
       } catch (error) {
         this.addGameLogEntry(`Room lookup failed: ${error.message}`, 'error');
         throw error;
       }
     } else {
       // Host a new room
       this.addGameLogEntry('Creating new game room...', 'info');
       roomId = await this.gameWork.hostRoom();
     }
     
     // Determine if this player is the host
     this.isHost = this.gameWork.getOwner()?.isHost || false;
     
     // Assign player roles based on connection order
     const players = this.gameWork.getPlayers();
     const playerCount = players.length;
     
     console.log(`Room Code: ${roomId.substring(0, 6).toUpperCase()}, Is host: ${this.isHost}, Player count: ${playerCount}`);
     
     // Update room code and QR code
     this.updateRoomCode(roomId);
     await this.generateQRCode(roomId);
     
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
}

  