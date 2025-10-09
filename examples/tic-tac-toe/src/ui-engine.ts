import { UIEngine } from '../../../client';
import { TicTacToeAction, TicTacToeEngine, TicTacToeState } from './game-engine';
import { generateQRCode } from '../../../client/utils';
import { StateChange } from '../../../client/events/EventFlow';
import { GameRoom } from '../../../shared/signaling-types';

export class TicTacToeUIEngine extends UIEngine<TicTacToeState, TicTacToeAction> {
  private boardElements: HTMLElement[] = [];
  private statusElement: HTMLElement | null = null;
  private currentPlayerElement: HTMLElement | null = null;
  private restartButton: HTMLElement | null = null;
  private joinRoomBtn: HTMLElement | null = null;
  private roomCodeInput: HTMLInputElement | null = null;
  private gameEngine: TicTacToeEngine;
  private currentGameState?: TicTacToeState;
  private currentRoom?: GameRoom;

  // === DIRECT METHOD CALLS (Hybrid Architecture) ===
  
  /**
   * Update game state - called directly by GameWork
   */
  updateState(state: TicTacToeState): void {
    this.currentGameState = state;
    this.render();
  }

  /**
   * Update room information - called directly by GameWork
   */
  updateRoom(room: GameRoom, isHost: boolean): void {
    this.currentRoom = room;
    
    // Update connection status based on room
    const connectedPlayers = this.gameWork.getConnectedPlayers();
    const playerCount = this.gameWork.getPlayerCount();
    const actualIsHost = this.gameWork.isHost();
    
    if (actualIsHost && room.roomCode) {
      this.updateRoomCode(room.roomCode);
      this.generateQRCode(room.roomCode);
    } else if (actualIsHost && room.id) {
      this.updateRoomCode(room.id.substring(0, 6).toUpperCase());
      this.generateQRCode(room.id.substring(0, 6).toUpperCase());
    }
    
    this.render();
  }

  /**
   * Initialize UI elements and event listeners
   */
  initialize(): void {
    this.boardElements = Array.from(document.querySelectorAll('.cell'));
    this.boardElements.forEach((cell, index) => {
      const action: TicTacToeAction = {
        action: 'playerMove',
        playerId: this.gameWork.id,
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
        playerId: this.gameWork.id,
      }
      this.restartButton.addEventListener('click', () => this.gameWork.sendPlayerAction(action));
    }
    
    
    this.roomCodeInput = document.getElementById('roomCodeInput') as HTMLInputElement;
    
    this.joinRoomBtn = document.getElementById('joinRoomBtn');
    
    if (this.joinRoomBtn) {
      this.joinRoomBtn.addEventListener('click', () => {
        let roomCode = this.roomCodeInput?.value
        if (roomCode) {
          this.gameWork.joinRoom(roomCode);
        } else {
        }
      });
    }
    
    if (this.roomCodeInput) {
      this.roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          let roomCode = this.roomCodeInput?.value
          if (roomCode) {
          this.gameWork.joinRoom(roomCode);
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
  private updateBoard(board: ('X' | 'O' | null)[] | undefined): void {
    if (!board || !Array.isArray(board)) {
      // Initialize empty board if not provided
      this.boardElements.forEach((cell) => {
        cell.textContent = '';
        cell.className = 'cell';
      });
      return;
    }
    
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

    // Add null checks for gameData
    const gameData = state.gameData || {};
    
    if (gameData.gameOver) {
      if (gameData.winner) {
        this.statusElement.textContent = `Player ${gameData.winner} wins!`;
        this.statusElement.className = 'status winner';
      } else {
        this.statusElement.textContent = "It's a draw!";
        this.statusElement.className = 'status draw';
      }
    } else {
      // Check number of players in room instead of game state
      const playerCount = Object.keys(state.players || {}).length || 0;
      
      if (playerCount < 2) {
        this.statusElement.textContent = 'Waiting for player 2 to join';
        this.statusElement.className = 'status waiting';
      } else if (gameData.currentPlayer === null) {
        // Both players joined but game hasn't started yet
        this.statusElement.textContent = 'Ready to play! Make the first move';
        this.statusElement.className = 'status ready';
      } else {
        this.statusElement.textContent = `Player ${gameData.currentPlayer}'s turn`;
        this.statusElement.className = 'status playing';
      }
    }
  }

  /**
   * Update the current player indicator
   */
  private updateCurrentPlayer(state: TicTacToeState): void {
    if (!this.currentPlayerElement) return;
    
    // Add null checks for gameData
    const gameData = state.gameData || {};
    let currentPlayer = gameData.currentPlayer;
    
    if (currentPlayer === null || currentPlayer === undefined) {
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

    const player1Status = document.getElementById('player1Status');
    if (player1Status) {
      const role = state.players[this.gameWork.id]?.symbol;
      player1Status.textContent = `You - ${role ? `Playing as ${role}` : 'Connected'}`;
    }
    
    // Update Player 2 status
    const player2Status = document.getElementById('player2Status');
    if (player2Status) {
      const player2Id = Object.keys(state.players).find(k => k !== this.gameWork.id)!;
      if (player2Id) {
        const role = state.players[player2Id]?.symbol;
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
     const urlParams = new URLSearchParams(window.location.search);
     const roomParam = urlParams.get('room');
     
     
     if (roomParam) {
       this.addGameLogEntry(`Looking up room: ${roomParam.toUpperCase()}`, 'info');
       this.gameWork.joinRoom(roomParam);
     } else {
       this.addGameLogEntry('Creating new game room...', 'info');
       this.gameWork.createRoom();
     }
     
  }

  async onReceiveStateChange(schange: StateChange): Promise<void> {
    // UI engine doesn't need to handle state changes in hybrid architecture
    // All internal communication is done via direct method calls
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
      // Use the existing generateQRCode utility with the current page URL as base
      const baseUrl = window.location.href.split('?')[0]; // Remove any existing query parameters
      const qrCodeDataURL = await generateQRCode(roomId, baseUrl);
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

  