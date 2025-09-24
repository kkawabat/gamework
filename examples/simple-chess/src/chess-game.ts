import { GameConfig, GameState, GameMove } from '../../../src/index';

// Chess piece types
export type ChessPiece = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type ChessColor = 'white' | 'black';

// Chess move data
export interface ChessMove {
  from: { row: number; col: number };
  to: { row: number; col: number };
  piece: ChessPiece;
  captured?: ChessPiece;
  promotion?: ChessPiece;
  castling?: 'kingside' | 'queenside';
  enPassant?: boolean;
}

// Chess game state
export interface ChessState extends GameState {
  board: (ChessPiece | null)[][];
  currentPlayer: ChessColor;
  gameOver: boolean;
  winner: ChessColor | null;
  check: boolean;
  checkmate: boolean;
  stalemate: boolean;
  capturedPieces: {
    white: ChessPiece[];
    black: ChessPiece[];
  };
  moveHistory: ChessMove[];
  enPassantTarget: { row: number; col: number } | null;
  castlingRights: {
    white: { kingside: boolean; queenside: boolean };
    black: { kingside: boolean; queenside: boolean };
  };
}

// Initial chess board setup
const initialBoard: (ChessPiece | null)[][] = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];

// Initial chess state
const initialChessState: ChessState = {
  board: initialBoard,
  currentPlayer: 'white',
  gameOver: false,
  winner: null,
  check: false,
  checkmate: false,
  stalemate: false,
  capturedPieces: {
    white: [],
    black: []
  },
  moveHistory: [],
  enPassantTarget: null,
  castlingRights: {
    white: { kingside: true, queenside: true },
    black: { kingside: true, queenside: true }
  }
};

// Helper functions
function isWhitePiece(piece: ChessPiece | null): boolean {
  return piece !== null && piece === piece.toUpperCase();
}

function isBlackPiece(piece: ChessPiece | null): boolean {
  return piece !== null && piece === piece.toLowerCase();
}

function getPieceColor(piece: ChessPiece | null): ChessColor | null {
  if (piece === null) return null;
  return piece === piece.toUpperCase() ? 'white' : 'black';
}

function isValidSquare(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function isSquareEmpty(board: (ChessPiece | null)[][], row: number, col: number): boolean {
  return isValidSquare(row, col) && board[row][col] === null;
}

function isSquareOccupiedByColor(board: (ChessPiece | null)[][], row: number, col: number, color: ChessColor): boolean {
  if (!isValidSquare(row, col)) return false;
  const piece = board[row][col];
  if (piece === null) return false;
  return getPieceColor(piece) === color;
}

// Check if a move is valid
function isValidMove(state: ChessState, move: ChessMove): boolean {
  const { from, to, piece } = move;
  const { board, currentPlayer } = state;

  // Check if it's the current player's turn
  const pieceColor = getPieceColor(piece);
  if (pieceColor !== currentPlayer) return false;

  // Check if the piece is actually at the from position
  if (board[from.row][from.col] !== piece) return false;

  // Check if the destination is valid
  if (!isValidSquare(to.row, to.col)) return false;

  // Check if the destination is not occupied by own piece
  if (isSquareOccupiedByColor(board, to.row, to.col, currentPlayer)) return false;

  // Basic move validation (simplified for demo)
  // In a real implementation, you'd check for:
  // - Piece-specific movement rules
  // - Check/checkmate conditions
  // - Castling rules
  // - En passant rules
  // - Pawn promotion rules

  return true;
}

// Apply a move to the board
function applyMove(state: ChessState, move: ChessMove): ChessState {
  const newState: ChessState = {
    ...state,
    board: state.board.map(row => [...row]),
    capturedPieces: {
      white: [...state.capturedPieces.white],
      black: [...state.capturedPieces.black]
    },
    moveHistory: [...state.moveHistory, move]
  };

  const { from, to, piece } = move;
  const { board } = newState;

  // Check for captured piece
  const capturedPiece = board[to.row][to.col];
  if (capturedPiece) {
    const capturedColor = getPieceColor(capturedPiece);
    if (capturedColor === 'white') {
      newState.capturedPieces.white.push(capturedPiece);
    } else {
      newState.capturedPieces.black.push(capturedPiece);
    }
  }

  // Move the piece
  board[to.row][to.col] = piece;
  board[from.row][from.col] = null;

  // Switch current player
  newState.currentPlayer = newState.currentPlayer === 'white' ? 'black' : 'white';

  // Check for game over conditions (simplified)
  // In a real implementation, you'd check for:
  // - Check/checkmate
  // - Stalemate
  // - Insufficient material
  // - Threefold repetition
  // - 50-move rule

  return newState;
}

// Check if the game is over
function checkGameOver(state: ChessState): ChessState {
  // Simplified game over check
  // In a real implementation, you'd check for:
  // - Checkmate
  // - Stalemate
  // - Insufficient material
  // - Threefold repetition
  // - 50-move rule

  return {
    ...state,
    gameOver: false,
    winner: null,
    check: false,
    checkmate: false,
    stalemate: false
  };
}

// Chess game configuration
export const chessConfig: GameConfig<ChessState, ChessMove> = {
  initialState: initialChessState,
  
  isValidMove: (state: ChessState, move: GameMove): boolean => {
    const chessMove = move.data as ChessMove;
    return isValidMove(state, chessMove);
  },
  
  applyMove: (state: ChessState, move: GameMove): ChessState => {
    const chessMove = move.data as ChessMove;
    const newState = applyMove(state, chessMove);
    return checkGameOver(newState);
  },
  
  getWinner: (state: ChessState): string | null => {
    if (state.gameOver && state.winner) {
      return state.winner;
    }
    return null;
  },
  
  isGameOver: (state: ChessState): boolean => {
    return state.gameOver;
  }
};
