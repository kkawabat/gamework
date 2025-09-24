import { GameHost, GameClient, WebSocketSignalingService } from 'gamework';
import { connectFourConfig, ConnectFourState } from './connect-four-game';

// Configure signaling server
const signalingConfig = {
  serverUrl: 'wss://your-signaling-server.com',
  reconnectAttempts: 5,
  reconnectDelay: 1000
};

const signalingService = new WebSocketSignalingService(signalingConfig);

// Simple Connect Four game controller
class ConnectFourGame {
  private gameHost: GameHost | null = null;
  private gameClient: GameClient | null = null;
  private isHost: boolean = false;
  private roomId: string | null = null;
  
  async initializeAsHost(roomId: string) {
    this.isHost = true;
    this.roomId = roomId;
    
    this.gameHost = new GameHost({
      roomId,
      roomName: 'Connect Four Game',
      gameConfig: connectFourConfig
    }, signalingService);
    
    this.gameHost.setStateUpdateHandler((state) => {
      this.handleStateUpdate(state as ConnectFourState);
    });
    
    await this.gameHost.start();
    console.log('Connect Four game host started');
  }
  
  async initializeAsClient(roomId: string) {
    this.isHost = false;
    this.roomId = roomId;
    
    this.gameClient = new GameClient({
      roomId,
      playerName: 'Connect Four Player'
    }, signalingService);
    
    this.gameClient.setStateUpdateHandler((state) => {
      this.handleStateUpdate(state as ConnectFourState);
    });
    
    await this.gameClient.connect();
    console.log('Connected to Connect Four game');
  }
  
  makeMove(column: number) {
    const move = {
      type: 'drop',
      playerId: this.isHost ? 'host' : 'client',
      timestamp: Date.now(),
      data: { column } as any
    };
    
    if (this.gameHost) {
      this.gameHost.applyMove(move);
    } else if (this.gameClient) {
      this.gameClient.sendMove('drop', { column });
    }
  }
  
  private handleStateUpdate(state: ConnectFourState) {
    console.log('Connect Four state updated:', state);
    this.renderBoard(state.board);
    this.updateCurrentPlayer(state.currentPlayer);
    
    if (state.gameOver) {
      if (state.winner) {
        console.log(`Game over! ${state.winner} wins!`);
      } else {
        console.log('Game over! It\'s a draw!');
      }
    }
  }
  
  private renderBoard(board: (string | null)[][]) {
    console.log('Connect Four Board:');
    board.forEach(row => {
      console.log(row.map(cell => cell || '.').join(' '));
    });
  }
  
  private updateCurrentPlayer(player: string) {
    console.log('Current player:', player);
  }
}

// Example usage
const connectFourGame = new ConnectFourGame();

async function startConnectFourGame() {
  const roomId = 'CONNECT4_123';
  
  // Check if we should be host or client
  const urlParams = new URLSearchParams(window.location.search);
  const isHost = urlParams.get('host') === 'true';
  
  if (isHost) {
    await connectFourGame.initializeAsHost(roomId);
  } else {
    await connectFourGame.initializeAsClient(roomId);
  }
  
  // Example moves
  setTimeout(() => {
    connectFourGame.makeMove(3); // Drop in column 3
  }, 2000);
  
  setTimeout(() => {
    connectFourGame.makeMove(4); // Drop in column 4
  }, 4000);
}

startConnectFourGame().catch(console.error);
