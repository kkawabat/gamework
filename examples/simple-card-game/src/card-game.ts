import { GameConfig, GameRules, GameState, GameMove } from 'gamework';

// Simple card game state
export interface CardGameState extends GameState {
  deck: string[];
  player1Hand: string[];
  player2Hand: string[];
  currentPlayer: 'player1' | 'player2';
  gameOver: boolean;
  winner: string | null;
  score: { player1: number; player2: number };
}

// Card game move data
export interface CardGameMove {
  action: 'draw' | 'play';
  card?: string;
  target?: string;
}

// Simple card game rules (like Go Fish or similar)
export const cardGameRules: GameRules = {
  applyMove: (state: GameState, move: GameMove): GameState => {
    const cardState = state as CardGameState;
    const moveData = move.data as CardGameMove;
    
    const newState: CardGameState = {
      ...cardState,
      deck: [...cardState.deck],
      player1Hand: [...cardState.player1Hand],
      player2Hand: [...cardState.player2Hand],
      score: { ...cardState.score }
    };
    
    const currentPlayer = cardState.currentPlayer;
    const currentHand = currentPlayer === 'player1' ? newState.player1Hand : newState.player2Hand;
    
    if (moveData.action === 'draw' && newState.deck.length > 0) {
      // Draw a card
      const drawnCard = newState.deck.pop()!;
      currentHand.push(drawnCard);
    } else if (moveData.action === 'play' && moveData.card) {
      // Play a card
      const cardIndex = currentHand.indexOf(moveData.card);
      if (cardIndex !== -1) {
        currentHand.splice(cardIndex, 1);
        // Add to score or handle card effect
        newState.score[currentPlayer]++;
      }
    }
    
    // Switch players
    newState.currentPlayer = currentPlayer === 'player1' ? 'player2' : 'player1';
    
    // Check for game over
    newState.gameOver = newState.deck.length === 0 && 
                       newState.player1Hand.length === 0 && 
                       newState.player2Hand.length === 0;
    
    if (newState.gameOver) {
      newState.winner = newState.score.player1 > newState.score.player2 ? 'player1' : 
                       newState.score.player2 > newState.score.player1 ? 'player2' : null;
    }
    
    return newState;
  },
  
  isValidMove: (state: GameState, move: GameMove): boolean => {
    const cardState = state as CardGameState;
    const moveData = move.data as CardGameMove;
    
    if (cardState.gameOver) return false;
    
    if (moveData.action === 'draw') {
      return cardState.deck.length > 0;
    } else if (moveData.action === 'play') {
      const currentHand = cardState.currentPlayer === 'player1' ? 
                         cardState.player1Hand : cardState.player2Hand;
      return moveData.card ? currentHand.includes(moveData.card) : false;
    }
    
    return false;
  },
  
  isGameOver: (state: GameState): boolean => {
    return (state as CardGameState).gameOver;
  },
  
  getWinner: (state: GameState): string | null => {
    return (state as CardGameState).winner;
  }
};

// Create a simple deck
function createDeck(): string[] {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck: string[] = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}_${suit}`);
    }
  }
  
  // Shuffle the deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

// Initial card game state
export const initialCardGameState: CardGameState = {
  version: 0,
  timestamp: Date.now(),
  deck: createDeck(),
  player1Hand: [],
  player2Hand: [],
  currentPlayer: 'player1',
  gameOver: false,
  winner: null,
  score: { player1: 0, player2: 0 }
};

// Game configuration
export const cardGameConfig: GameConfig = {
  gameType: 'card-game',
  maxPlayers: 2,
  initialState: initialCardGameState,
  rules: cardGameRules
};
