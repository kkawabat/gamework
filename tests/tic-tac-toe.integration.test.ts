import { GameHost, GameClient, InMemorySignalingService } from '../src/index';
import { ticTacToeConfig, TicTacToeState, TicTacToeMove } from '../examples/simple-tic-tac-toe';

describe('Tic-Tac-Toe Integration Tests', () => {
  let signalingService: InMemorySignalingService;
  let host: GameHost<TicTacToeState, TicTacToeMove>;
  let client: GameClient<TicTacToeState, TicTacToeMove>;

  beforeEach(() => {
    signalingService = new InMemorySignalingService();
  });

  afterEach(() => {
    if (host) {
      host.disconnect();
    }
    if (client) {
      client.disconnect();
    }
  });

  test('should create a game room and allow client to join', async () => {
    // Create host
    host = new GameHost(ticTacToeConfig, signalingService);
    await host.createRoom();
    
    expect(host.getRoomCode()).toBeDefined();
    expect(host.getRoomCode().length).toBe(6);

    // Create client and join
    client = new GameClient(ticTacToeConfig, signalingService);
    await client.joinRoom(host.getRoomCode());

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(client.isConnected()).toBe(true);
    expect(host.getConnectedPlayers().length).toBe(1);
  });

  test('should handle game moves correctly', async () => {
    // Setup host and client
    host = new GameHost(ticTacToeConfig, signalingService);
    await host.createRoom();
    
    client = new GameClient(ticTacToeConfig, signalingService);
    await client.joinRoom(host.getRoomCode());

    await new Promise(resolve => setTimeout(resolve, 100));

    // Make a move
    const move: TicTacToeMove = { row: 0, col: 0, playerId: client.getPlayerId() };
    
    const moveResult = await client.makeMove(move);
    expect(moveResult.success).toBe(true);

    // Check if host received the move
    const gameState = host.getGameState();
    expect(gameState.board[0][0]).toBe('X'); // Client should be X
  });

  test('should detect win conditions', async () => {
    // Setup host and client
    host = new GameHost(ticTacToeConfig, signalingService);
    await host.createRoom();
    
    client = new GameClient(ticTacToeConfig, signalingService);
    await client.joinRoom(host.getRoomCode());

    await new Promise(resolve => setTimeout(resolve, 100));

    // Make winning moves for X (client)
    const moves: TicTacToeMove[] = [
      { row: 0, col: 0, playerId: client.getPlayerId() }, // X
      { row: 1, col: 0, playerId: client.getPlayerId() }, // X  
      { row: 2, col: 0, playerId: client.getPlayerId() }  // X - wins
    ];

    for (const move of moves) {
      await client.makeMove(move);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const gameState = host.getGameState();
    expect(gameState.winner).toBe('X');
    expect(gameState.gameStatus).toBe('finished');
  });

  test('should handle multiple clients', async () => {
    // Create host
    host = new GameHost(ticTacToeConfig, signalingService);
    await host.createRoom();

    // Create two clients
    const client1 = new GameClient(ticTacToeConfig, signalingService);
    const client2 = new GameClient(ticTacToeConfig, signalingService);

    await client1.joinRoom(host.getRoomCode());
    await client2.joinRoom(host.getRoomCode());

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(host.getConnectedPlayers().length).toBe(2);
    expect(client1.isConnected()).toBe(true);
    expect(client2.isConnected()).toBe(true);
  });
});
