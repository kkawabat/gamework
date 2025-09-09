// Tic-Tac-Toe game rules
export const ticTacToeRules = {
    applyMove: (state, move) => {
        const ticTacToeState = state;
        const moveData = move.data;
        // Create new state
        const newState = {
            ...ticTacToeState,
            board: [...ticTacToeState.board],
            currentPlayer: ticTacToeState.currentPlayer === 'X' ? 'O' : 'X'
        };
        // Apply the move
        if (newState.board[moveData.position] === null) {
            newState.board[moveData.position] = move.playerId === 'player1' ? 'X' : 'O';
        }
        // Check for winner
        newState.winner = checkWinner(newState.board);
        newState.gameOver = newState.winner !== null || isBoardFull(newState.board);
        return newState;
    },
    isValidMove: (state, move) => {
        const ticTacToeState = state;
        const moveData = move.data;
        // Check if game is over
        if (ticTacToeState.gameOver) {
            return false;
        }
        // Check if position is valid
        if (moveData.position < 0 || moveData.position >= 9) {
            return false;
        }
        // Check if position is empty
        if (ticTacToeState.board[moveData.position] !== null) {
            return false;
        }
        // Check if it's the player's turn
        const expectedPlayer = ticTacToeState.currentPlayer === 'X' ? 'player1' : 'player2';
        return move.playerId === expectedPlayer;
    },
    isGameOver: (state) => {
        const ticTacToeState = state;
        return ticTacToeState.gameOver;
    },
    getWinner: (state) => {
        const ticTacToeState = state;
        return ticTacToeState.winner;
    }
};
// Helper functions
function checkWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6] // diagonals
    ];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}
function isBoardFull(board) {
    return board.every(cell => cell !== null);
}
// Initial game state
export const initialTicTacToeState = {
    version: 0,
    timestamp: Date.now(),
    board: Array(9).fill(null),
    currentPlayer: 'X',
    winner: null,
    gameOver: false
};
// Game configuration
export const ticTacToeConfig = {
    gameType: 'tic-tac-toe',
    maxPlayers: 2,
    initialState: initialTicTacToeState,
    rules: ticTacToeRules
};
