import { GameEngine } from './core/GameEngine';
import { UIEngine } from './core/UIEngine';
import { NetworkEngine} from './networking/NetworkEngine';
import { EventManager } from './events/EventManager';
import { 
  Player,
  GameWorkConfig,
} from './types';
import { v4 as uuidv4 } from 'uuid';



// Default configuration for GameWork
const DEFAULT_GAMEWORK_CONFIG: GameWorkConfig = {
  stunServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  signalServiceConfig: {
    serverUrl: __SIGNALING_SERVER_URL__,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10,
    pingInterval: 30000
  }
};


/**
 * GameWork - The main multiplayer game framework
 * 
 * Handles all networking and player management while delegating game logic to GameEngine.
 * Developers focus on game logic, GameWork handles the rest.
 */
export class GameWork {
  private config: GameWorkConfig;
  private eventManager: EventManager;
  private gameEngine: GameEngine;
  private uiEngine: UIEngine;
  private network: NetworkEngine;
  private owner: Player;
  

  constructor(gameEngine: GameEngine, uiEngine: UIEngine, config?: GameWorkConfig) {
    this.config = { ...DEFAULT_GAMEWORK_CONFIG, ...config };
    this.owner = {
      id: uuidv4(),
      name: 'Host',
      isHost: true,
      isConnected: true,
      lastSeen: Date.now()
    };

    // Initialize networking with GameWork reference
    this.network = new NetworkEngine(this);
    
    // Set GameWork reference in engines
    this.gameEngine = gameEngine;
    this.gameEngine.setGameWork(this);
    this.uiEngine = uiEngine;
    this.uiEngine.setGameWork(this);
    
    // Initialize event manager first
    this.eventManager = new EventManager(this);

  }
}