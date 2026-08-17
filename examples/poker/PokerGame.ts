/**
 * DOM layer for the Poker demo. The reducer lives in PokerEngine; session
 * wiring lives in PokerDirector, which tests drive without a browser.
 *
 * Star + authoritative: joiners dial only the host, and only the dealer
 * ever sees the deck. Each seat reads `hand:{self}` and nothing else private.
 */

import QRCode from 'qrcode';
import { Session, WebRTCNetworkEngine } from '../../src';
import { createNetworkConfig, DATA_CHANNEL_CONFIG } from '../shared/network-config';
import {
  POKER_ROLES,
  PokerDirector,
  PokerPublicView,
  PokerSecretView
} from './PokerDirector';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  isRedCard,
  cardRankIndex,
  RANK_LABELS,
  SUIT_GLYPHS,
  legalActions,
  playerName
} from './PokerEngine';

// --- UI --------------------------------------------------------------------

export class PokerUI {
  private localSeat = 0;
  private names: string[] = [];
  private localHole: number[] = [];

  private opponentsEl: HTMLElement | null = null;
  private selfSeatEl: HTMLElement | null = null;
  private communityEl: HTMLElement | null = null;
  private potEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private controlsEl: HTMLElement | null = null;
  private nextHandBtn: HTMLElement | null = null;
  private playAgainBtn: HTMLElement | null = null;

  private foldBtn: HTMLButtonElement | null = null;
  private checkCallBtn: HTMLButtonElement | null = null;
  private raiseBtn: HTMLButtonElement | null = null;
  private raiseSlider: HTMLInputElement | null = null;
  private raiseAmountEl: HTMLElement | null = null;

  initialize(): void {
    this.opponentsEl = document.getElementById('opponents');
    this.selfSeatEl = document.getElementById('selfSeat');
    this.communityEl = document.getElementById('community');
    this.potEl = document.getElementById('pot');
    this.statusEl = document.getElementById('status');
    this.controlsEl = document.getElementById('betControls');
    this.nextHandBtn = document.getElementById('nextHandBtn');
    this.playAgainBtn = document.getElementById('playAgainBtn');
    this.foldBtn = document.getElementById('foldBtn') as HTMLButtonElement | null;
    this.checkCallBtn = document.getElementById('checkCallBtn') as HTMLButtonElement | null;
    this.raiseBtn = document.getElementById('raiseBtn') as HTMLButtonElement | null;
    this.raiseSlider = document.getElementById('raiseSlider') as HTMLInputElement | null;
    this.raiseAmountEl = document.getElementById('raiseAmount');

    this.raiseSlider?.addEventListener('input', () => this.syncRaiseLabel());
  }

  setSeating(localSeat: number, names: string[]): void {
    this.localSeat = localSeat;
    this.names = names;
  }

  setLocalHole(hole: number[]): void {
    this.localHole = hole;
  }

  render(view: PokerPublicView): void {
    this.renderSeats(view);
    this.renderCommunity(view);
    this.renderStatus(view);
    this.renderControls(view);

    if (this.potEl) this.potEl.textContent = view.pot > 0 ? `Pot: ${view.pot}` : '';
    if (this.nextHandBtn) this.nextHandBtn.hidden = !(view.handOver && !view.matchOver);
    if (this.playAgainBtn) this.playAgainBtn.hidden = !view.matchOver;
  }

  destroy(): void {
    this.opponentsEl = this.selfSeatEl = this.communityEl = this.potEl = null;
    this.statusEl = this.controlsEl = this.nextHandBtn = this.playAgainBtn = null;
  }

  getRaiseAmount(): number {
    return this.raiseSlider ? parseInt(this.raiseSlider.value, 10) : 0;
  }

  private displayName(seat: number): string {
    if (seat === this.localSeat) return 'You';
    return this.names[seat] || playerName(seat);
  }

  private cardHTML(card: number, faceDown = false): string {
    if (faceDown) return '<div class="card back"></div>';
    const red = isRedCard(card) ? ' red' : '';
    return `<div class="card${red}"><span class="rank">${RANK_LABELS[cardRankIndex(card)]}</span><span class="suit">${SUIT_GLYPHS[cardSuit(card)]}</span></div>`;
  }

  private renderCommunity(view: PokerPublicView): void {
    if (!this.communityEl) return;
    const slots: string[] = [];
    for (let i = 0; i < 5; i++) {
      slots.push(i < view.community.length ? this.cardHTML(view.community[i]) : '<div class="card empty"></div>');
    }
    this.communityEl.innerHTML = slots.join('');
  }

  private renderSeats(view: PokerPublicView): void {
    if (this.opponentsEl) {
      const html: string[] = [];
      for (let k = 1; k < view.numPlayers; k++) {
        const seat = (this.localSeat + k) % view.numPlayers;
        html.push(this.seatHTML(view, seat));
      }
      this.opponentsEl.innerHTML = html.join('');
    }
    if (this.selfSeatEl) {
      this.selfSeatEl.innerHTML = this.localSeat >= 0 ? this.seatHTML(view, this.localSeat) : '';
    }
  }

  private holeFor(view: PokerPublicView, seat: number): { cards: number[]; faceDown: boolean } {
    if (seat === this.localSeat && this.localHole.length) {
      return { cards: this.localHole, faceDown: false };
    }
    const shown = view.shownHole[seat] ?? [];
    if (shown.length) return { cards: shown, faceDown: false };
    return { cards: [], faceDown: true };
  }

  private seatHTML(view: PokerPublicView, seat: number): string {
    const isLocal = seat === this.localSeat;
    const dealtIn = view.inHand[seat];
    const folded = view.folded[seat];
    const allIn = dealtIn && !folded && view.stacks[seat] === 0 && view.stage !== 'idle';
    const acting = view.toAct === seat && !view.handOver && view.stage !== 'idle';
    const { cards, faceDown } = this.holeFor(view, seat);

    let cardHTML = '';
    if (dealtIn && cards.length) {
      cardHTML = cards.map((c) => this.cardHTML(c, faceDown)).join('');
    } else if (view.stage !== 'idle' && dealtIn) {
      cardHTML = `${this.cardHTML(0, true)}${this.cardHTML(0, true)}`;
    }

    const tags: string[] = [];
    if (view.button === seat && view.stage !== 'idle') tags.push('<span class="dealer">D</span>');
    if (folded) tags.push('<span class="tag fold">folded</span>');
    else if (allIn) tags.push('<span class="tag allin">all-in</span>');

    const bet = view.roundBet[seat] > 0 ? `<div class="bet">bet ${view.roundBet[seat]}</div>` : '';
    const showdown = view.stage === 'showdown';
    const handName = showdown && view.result?.names[seat]
      ? `<div class="hand-name">${view.result.names[seat]}</div>` : '';
    const won = view.handOver && view.result && view.result.winnings[seat] > 0;

    const classes = ['seat'];
    if (acting) classes.push('acting');
    if (folded) classes.push('is-folded');
    if (isLocal) classes.push('is-local');

    return `
      <div class="${classes.join(' ')}">
        <div class="seat-label">${this.displayName(seat)} ${tags.join(' ')}</div>
        <div class="hole${won ? ' winner' : ''}">${cardHTML}</div>
        <div class="stack">${view.stacks[seat]} chips</div>
        ${bet}${handName}
      </div>`;
  }

  private renderStatus(view: PokerPublicView): void {
    if (this.statusEl) this.statusEl.textContent = view.message;
  }

  private renderControls(view: PokerPublicView): void {
    if (!this.controlsEl) return;
    const legal = legalActions(view, this.localSeat);
    this.controlsEl.hidden = !legal.isTurn;
    if (!legal.isTurn) return;

    if (this.foldBtn) this.foldBtn.disabled = !legal.canFold;

    if (this.checkCallBtn) {
      if (legal.canCheck) {
        this.checkCallBtn.textContent = 'Check';
        this.checkCallBtn.disabled = false;
        this.checkCallBtn.dataset.action = 'CHECK';
      } else if (legal.canCall) {
        this.checkCallBtn.textContent = `Call ${legal.callAmount}`;
        this.checkCallBtn.disabled = false;
        this.checkCallBtn.dataset.action = 'CALL';
      } else {
        this.checkCallBtn.disabled = true;
      }
    }

    if (this.raiseBtn && this.raiseSlider) {
      if (legal.canRaise && legal.maxRaiseTo > legal.minRaiseTo) {
        this.raiseSlider.min = String(legal.minRaiseTo);
        this.raiseSlider.max = String(legal.maxRaiseTo);
        this.raiseSlider.value = String(legal.minRaiseTo);
        this.raiseSlider.disabled = false;
        this.raiseSlider.hidden = false;
        this.raiseBtn.disabled = false;
        this.syncRaiseLabel();
      } else if (legal.canRaise) {
        this.raiseSlider.value = this.raiseSlider.min = this.raiseSlider.max = String(legal.maxRaiseTo);
        this.raiseSlider.hidden = true;
        this.raiseBtn.disabled = false;
        this.raiseBtn.textContent = `All-in ${legal.maxRaiseTo}`;
        if (this.raiseAmountEl) this.raiseAmountEl.textContent = '';
      } else {
        this.raiseBtn.disabled = true;
        this.raiseSlider.hidden = true;
        if (this.raiseAmountEl) this.raiseAmountEl.textContent = '';
      }
    }
  }

  private syncRaiseLabel(): void {
    if (!this.raiseSlider || !this.raiseAmountEl || !this.raiseBtn) return;
    const value = this.raiseSlider.value;
    this.raiseAmountEl.textContent = value;
    this.raiseBtn.textContent = value === this.raiseSlider.max ? `All-in ${value}` : `Raise to ${value}`;
  }
}

// --- Manager (lobby + session) ---------------------------------------------

type ViewId = 'homeView' | 'inviteView' | 'joinView' | 'waitView' | 'gameView';
const ALL_VIEWS: ViewId[] = ['homeView', 'inviteView', 'joinView', 'waitView', 'gameView'];

class MultiplayerPokerManager {
  private session: Session | null = null;
  private director: PokerDirector | null = null;
  private ui: PokerUI | null = null;
  private readonly deviceId = `player_${Math.random().toString(36).slice(2, 11)}`;
  private connecting = new Set<string>();
  private started = false;
  private attached = false;
  private roomRequestInFlight = false;

  async initialize(): Promise<void> {
    try {
      const joining = new URLSearchParams(window.location.search).get('room');
      const isHost = !joining;

      const network = new WebRTCNetworkEngine(
        { ...createNetworkConfig(), dialPolicy: 'host' },
        DATA_CHANNEL_CONFIG,
        this.deviceId
      );

      this.session = new Session(network, {
        mode: { connectivity: 'star', authority: 'authoritative' },
        deviceId: this.deviceId,
        roles: POKER_ROLES,
        entities: isHost ? [{ role: 'dealer' }, { role: 'player' }] : [{ role: 'player' }],
        maxEntities: { dealer: 1, player: MAX_PLAYERS }
      });

      this.director = new PokerDirector(this.session);
      this.ui = new PokerUI();
      this.ui.initialize();

      await this.session.initialize();
      this.setupEventHandlers();
      if (joining && joining.length === 6) this.joinRoom(joining.toUpperCase());
    } catch (error) {
      console.error('Failed to initialize game:', error);
      this.showMessage(`Could not connect: ${(error as Error).message}`);
    }
  }

  private async createRoom(): Promise<void> {
    if (!this.session || this.roomRequestInFlight) return;
    this.roomRequestInFlight = true;
    try {
      const roomCode = await this.session.host();
      this.showMessage(null);
      this.showRoomInvite(roomCode);
      await this.generateQRCode(roomCode);
      this.renderLobby();
    } catch (error) {
      console.error('Failed to create room:', error);
      this.showMessage(`Failed to create room: ${(error as Error).message}`);
      this.showView('homeView');
    } finally {
      this.roomRequestInFlight = false;
    }
  }

  private async joinRoom(roomCode: string): Promise<void> {
    if (!this.session || this.roomRequestInFlight) return;
    this.roomRequestInFlight = true;
    try {
      await this.session.join(roomCode);
      this.showMessage(null);
      this.showView('waitView');
      this.renderLobby();
    } catch (error) {
      console.error('Failed to join room:', error);
      this.showMessage(`Failed to join room: ${(error as Error).message}`);
      this.showView('homeView');
    } finally {
      this.roomRequestInFlight = false;
    }
  }

  private setupEventHandlers(): void {
    if (!this.session || !this.director) return;

    this.session.onRegistry((_entities, locked) => {
      if (locked) this.session.lock();
      this.bindDirector();
      this.renderLobby();
    });

    this.session.onPeerJoined((peerId) => {
      if (this.director?.isDealer && !this.started) {
        this.connecting.add(peerId);
        this.renderLobby();
      }
    });

    this.session.onPeerConnected((peerId) => {
      this.connecting.delete(peerId);
      this.renderLobby();
    });

    this.session.onPeerFailed((peerId) => {
      if (!this.awaitingLobbyConnection(peerId)) return;
      this.connecting.delete(peerId);
      const problem = this.director?.isDealer ? 'A player could not connect' : 'Could not connect to the host';
      this.showMessage(`${problem}. If you are both on mobile data, try Wi-Fi.`);
      this.renderLobby();
    });

    this.setupUIEventHandlers();
  }

  private bindDirector(): void {
    if (!this.session || !this.director || this.attached) return;
    if (!this.session.localEntityOfRole('player')) return;

    this.attached = true;
    this.director.attach();
    this.director.onPublic((view) => this.onView(view));
    this.director.onSecret((secret) => this.onSecret(secret));
  }

  private onView(view: PokerPublicView): void {
    if (!this.started && view.stage !== 'idle') {
      this.beginMatch();
    }
    this.ui?.render(view);
  }

  private onSecret(secret: PokerSecretView): void {
    this.ui?.setLocalHole(secret.hole);
    this.ui?.render(this.director!.publicView);
  }

  private setupUIEventHandlers(): void {
    document.getElementById('inviteBtn')?.addEventListener('click', () => this.createRoom());
    document.getElementById('joinBtn')?.addEventListener('click', () => {
      this.showView('joinView');
      document.getElementById('roomCodeInput')?.focus();
    });

    const roomInput = document.getElementById('roomCodeInput') as HTMLInputElement | null;
    const submitJoin = () => {
      const code = roomInput?.value.trim().toUpperCase() || '';
      if (code.length === 6) this.joinRoom(code);
      else this.showMessage('Please enter a valid 6-character room code');
    };
    document.getElementById('joinRoomBtn')?.addEventListener('click', submitJoin);
    roomInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitJoin(); });

    document.getElementById('startBtn')?.addEventListener('click', () => this.hostStart());

    document.getElementById('foldBtn')?.addEventListener('click', () => this.director?.act('FOLD'));
    document.getElementById('checkCallBtn')?.addEventListener('click', (e) => {
      const type = (e.currentTarget as HTMLElement).dataset.action === 'CALL' ? 'CALL' : 'CHECK';
      this.director?.act(type);
    });
    document.getElementById('raiseBtn')?.addEventListener('click', () =>
      this.director?.act('RAISE', this.ui?.getRaiseAmount()));

    document.getElementById('nextHandBtn')?.addEventListener('click', () => this.director?.requestDeal(false));
    document.getElementById('playAgainBtn')?.addEventListener('click', () => this.director?.requestDeal(true));
  }

  private awaitingLobbyConnection(peerId: string): boolean {
    if (this.started) return false;
    if (!this.director?.isDealer) return true;
    return this.connecting.has(peerId);
  }

  private get seatCount(): number {
    return this.session?.entitiesOfRole('player').length ?? 0;
  }

  private hostStart(): void {
    if (!this.director?.isDealer || this.started) return;
    if (this.seatCount < MIN_PLAYERS) return;
    this.session?.lock();
    this.director.startMatch();
  }

  private beginMatch(): void {
    if (!this.director || this.started) return;
    this.started = true;
    const names = this.director.playerIds().map((_, seat) => playerName(seat));
    this.ui?.setSeating(this.director.localSeat, names);
    this.showView('gameView');
  }

  private renderLobby(): void {
    const seats = this.session?.entitiesOfRole('player') ?? [];
    const me = this.director?.playerId;
    const count = Math.max(seats.length, 1);
    const seatedHTML = (seats.length ? seats : [null]).map((seat, i) => {
      const you = seat && seat.entityId === me ? ' (you)' : '';
      const host = i === 0 ? ' — host' : '';
      return `<li>Player ${i + 1}${you}${host}</li>`;
    }).join('');
    const listHTML = seatedHTML + [...this.connecting]
      .map((_, i) => `<li class="muted">Player ${count + i + 1} — connecting…</li>`)
      .join('');
    for (const id of ['playerList', 'playerList2']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = listHTML;
    }
    const waitCount = document.getElementById('waitCount');
    if (waitCount) waitCount.textContent = `${count} player${count === 1 ? '' : 's'} in the room — waiting for the host…`;

    const startBtn = document.getElementById('startBtn') as HTMLButtonElement | null;
    if (startBtn) {
      startBtn.hidden = !this.director?.isDealer;
      startBtn.disabled = this.seatCount < MIN_PLAYERS;
      startBtn.textContent = this.seatCount < MIN_PLAYERS
        ? 'Waiting for players…'
        : `Start Game (${this.seatCount})`;
    }
  }

  private showView(viewId: ViewId): void {
    for (const id of ALL_VIEWS) {
      const el = document.getElementById(id);
      if (el) el.hidden = id !== viewId;
    }
  }

  private showRoomInvite(roomCode: string): void {
    const el = document.getElementById('roomCode');
    if (el) el.textContent = roomCode;
    this.showView('inviteView');
  }

  private async generateQRCode(roomCode: string): Promise<void> {
    const container = document.getElementById('qrCodeContainer');
    if (!container) return;
    const qrUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    const canvas = document.createElement('canvas');
    try {
      await QRCode.toCanvas(canvas, qrUrl, { width: 200, margin: 2 });
      container.replaceChildren(canvas);
    } catch (error) {
      container.textContent = 'QR code generation failed';
      console.error('QR code generation failed:', error);
    }
  }

  private showMessage(message: string | null): void {
    const el = document.getElementById('message');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }
}

export function startPokerGame(): void {
  const manager = new MultiplayerPokerManager();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => manager.initialize());
  } else {
    manager.initialize();
  }
}
