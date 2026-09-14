/**
 * DOM layer for the Set demo. The rules live in SetEngine; multiplayer
 * wiring lives in SetDirector. This file paints both the timed solo clear
 * (no session) and the N-player race (star, host reduces).
 */

import QRCode from 'qrcode';
import { Session, WebRTCNetworkEngine } from '../../src';
import { createNetworkConfig, DATA_CHANNEL_CONFIG } from '../shared/network-config';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  SET_ROLES,
  SetDirector
} from './SetDirector';
import {
  Card,
  firstHintCard,
  formatElapsed,
  isSet,
  PublicView,
  SetTable
} from './SetEngine';

type ViewId = 'homeView' | 'joinView' | 'lobbyView' | 'playView';
const ALL_VIEWS: ViewId[] = ['homeView', 'joinView', 'lobbyView', 'playView'];

const COLORS = ['#c0392b', '#1e8449', '#6c3483'];
const SOLO_ID = 'solo';
const CLAIM_FLASH_MS = 500;
const HINT_AFTER_MS = 60_000;

function claimKey(claim: PublicView['lastClaim']): string {
  return claim ? `${claim.entityId}:${claim.cards.join(',')}` : '';
}

function playerLabel(entityId: string, index: number, me: string | null): string {
  if (entityId === SOLO_ID) return 'You';
  const you = entityId === me ? ' (you)' : '';
  const host = index === 0 ? ' — host' : '';
  return `Player ${index + 1}${you}${host}`;
}

function shapePath(shape: number): string {
  if (shape === 0) return 'M 0,-14 L 11,0 L 0,14 L -11,0 Z'; // diamond
  // Horizontal pill (stadium): short enough that three stacked ones leave a gap.
  if (shape === 1) return 'M -10,-5 L 10,-5 A 5,5 0 0 1 10,5 L -10,5 A 5,5 0 0 1 -10,-5 Z';
  // squiggle
  return 'M -11,-6 C -4,-14 4,2 11,-6 C 14,-4 14,4 11,6 C 4,14 -4,-2 -11,6 C -14,4 -14,-4 -11,-6 Z';
}

function cardSvg(card: Card): string {
  const count = (card % 3) + 1;
  const colour = COLORS[Math.floor(card / 3) % 3];
  const shade = Math.floor(card / 9) % 3;
  const shape = Math.floor(card / 27) % 3;
  const patternId = `s${card}`;
  const fill = shade === 0 ? colour
    : shade === 1 ? `url(#${patternId})`
    : 'none';
  const ys = count === 1 ? [45] : count === 2 ? [30, 60] : [18, 45, 72];
  const shapes = ys.map((y) =>
    `<g transform="translate(30 ${y})">
      <path d="${shapePath(shape)}" fill="${fill}" stroke="${colour}" stroke-width="2.4"/>
    </g>`
  ).join('');
  const pattern = shade === 1
    ? `<pattern id="${patternId}" width="3" height="4" patternUnits="userSpaceOnUse">
         <rect width="1.4" height="4" fill="${colour}"/>
       </pattern>`
    : '';
  return `<svg viewBox="0 0 60 90" aria-hidden="true">${pattern}${shapes}</svg>`;
}

class SetManager {
  private session: Session | null = null;
  private director: SetDirector | null = null;
  private table: SetTable | null = null;
  private readonly deviceId = `device_${Math.random().toString(36).slice(2, 11)}`;
  private attached = false;
  private locked = false;
  private isHost = false;
  private solo = false;
  private selected = new Set<number>();
  private startedAt = 0;
  private endedAt: number | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private flashWrong = false;
  private displayed: Card[] = [];
  private flashClaim: Card[] | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private seenClaimKey = '';
  private stuckSince = 0;
  private hintCard: Card | null = null;
  private boardKey = '';
  private onPlayScreen = false;
  private locallyHidden = false;
  private pauseStartedAt: number | null = null;

  async initialize(): Promise<void> {
    this.wireControls();
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) await this.join(room.toUpperCase());
  }

  private wireControls(): void {
    document.getElementById('soloBtn')?.addEventListener('click', () => this.startSolo());
    document.getElementById('hostBtn')?.addEventListener('click', () => this.startHost());
    document.getElementById('joinBtn')?.addEventListener('click', () => {
      this.showView('joinView');
      document.getElementById('roomCodeInput')?.focus();
    });

    const roomInput = document.getElementById('roomCodeInput') as HTMLInputElement | null;
    const submitJoin = () => {
      const code = roomInput?.value.trim().toUpperCase() || '';
      if (code.length === 6) this.join(code);
      else this.showMessage('Enter a 6-character room code');
    };
    document.getElementById('joinRoomBtn')?.addEventListener('click', submitJoin);
    roomInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') submitJoin(); });

    document.getElementById('startBtn')?.addEventListener('click', () => this.hostBegin());
    document.getElementById('againBtn')?.addEventListener('click', () => this.playAgain());

    document.getElementById('board')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (button) this.toggle(Number(button.dataset.card));
    });
    document.getElementById('hintBtn')?.addEventListener('click', () => this.onHint());
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  private startSolo(): void {
    this.solo = true;
    this.table = new SetTable();
    this.table.start([SOLO_ID]);
    this.startedAt = Date.now();
    this.endedAt = null;
    this.selected.clear();
    this.clearFlash();
    this.onPlayScreen = true;
    this.resetStuck();
    this.showView('playView');
    this.startTick();
    this.render();
  }

  private async openSession(isHost: boolean): Promise<void> {
    const network = new WebRTCNetworkEngine(
      // Star means the joiner dials the hub and nobody else. Without this a
      // guest dials every other guest: a mesh's N² connections, and its N² TURN
      // exposure, under a session that routes as a star anyway. Sunday's four
      // phones did exactly that, ICE-connected to each other, and then played
      // diverging boards because claims never reached the host.
      createNetworkConfig({ dialPolicy: 'host' }),
      DATA_CHANNEL_CONFIG,
      this.deviceId
    );
    this.session = new Session(network, {
      mode: { connectivity: 'star', authority: 'authoritative' },
      deviceId: this.deviceId,
      roles: SET_ROLES,
      entities: isHost ? [{ role: 'admin' }, { role: 'player' }] : [{ role: 'player' }],
      maxEntities: { admin: 1, player: MAX_PLAYERS }
    });
    this.director = new SetDirector(this.session);
    this.isHost = isHost;

    this.session.onRegistry((_entities, locked) => {
      if (locked) this.session!.lock();
      if (!this.attached && this.session!.localEntityOfRole('player')) {
        this.attached = true;
        this.director!.attach();
        this.director!.onPublic(() => {
          const view = this.director!.publicView;
          if (view.phase !== 'idle') this.enterPlay();
          this.maybeFlashClaim(view);
          this.render();
        });
      }
      this.render();
    });

    this.session.onPeerFailed(() =>
      this.showMessage('A device could not connect. If you are on mobile data, try Wi-Fi.'));

    await this.session.initialize();
  }

  private async startHost(): Promise<void> {
    try {
      await this.openSession(true);
      const roomCode = await this.session!.host();
      const codeElement = document.getElementById('roomCode');
      if (codeElement) codeElement.textContent = roomCode;
      const container = document.getElementById('qrCodeContainer');
      if (container) {
        const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
        const canvas = document.createElement('canvas');
        try {
          await QRCode.toCanvas(canvas, url, { width: 200, margin: 2 });
          container.replaceChildren(canvas);
        } catch {
          container.textContent = url;
        }
      }
      this.showView('lobbyView');
      this.render();
    } catch (error) {
      this.showMessage(`Could not host: ${(error as Error).message}`);
    }
  }

  private async join(roomCode: string): Promise<void> {
    try {
      await this.openSession(false);
      await this.session!.join(roomCode);
      this.showView('lobbyView');
      this.render();
    } catch (error) {
      this.showMessage(`Could not join: ${(error as Error).message}`);
    }
  }

  private hostBegin(): void {
    try {
      this.clearFlash();
      if (!this.locked) {
        this.session?.lock();
        this.locked = true;
      }
      this.director?.startGame();
    } catch (error) {
      this.showMessage((error as Error).message);
    }
  }

  private playAgain(): void {
    if (this.solo) {
      this.startSolo();
      return;
    }
    this.hostBegin();
  }

  private enterPlay(): void {
    this.showView('playView');
    if (this.onPlayScreen) return;
    this.onPlayScreen = true;
    this.selected.clear();
    this.resetStuck();
    this.startTick();
  }

  private maybeFlashClaim(view: PublicView): void {
    const key = claimKey(view.lastClaim);
    if (!key || key === this.seenClaimKey) return;
    this.seenClaimKey = key;
    if (this.displayed.length === 0 || !view.lastClaim) return;
    this.beginFlash(view.lastClaim.cards, this.displayed);
  }

  private beginFlash(cards: Card[], board: Card[]): void {
    this.flashClaim = cards;
    this.displayed = board.slice();
    this.selected.clear();
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashClaim = null;
      this.flashTimer = null;
      this.render();
    }, CLAIM_FLASH_MS);
  }

  private clearFlash(): void {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = null;
    this.flashClaim = null;
    this.displayed = [];
    this.seenClaimKey = '';
  }

  private currentView(): PublicView | null {
    if (this.solo) return this.table?.view() ?? null;
    return this.director?.publicView ?? null;
  }

  private me(): string | null {
    return this.solo ? SOLO_ID : this.director?.playerId ?? null;
  }

  private toggle(card: Card): void {
    const view = this.currentView();
    if (!view || view.phase !== 'playing' || this.flashClaim) return;
    if (this.isPaused(view)) return;
    if (!view.board.includes(card)) return;

    if (this.selected.has(card)) this.selected.delete(card);
    else this.selected.add(card);

    if (this.selected.size === 3) {
      const cards = [...this.selected];
      if (!isSet(cards[0], cards[1], cards[2])) {
        this.flashWrong = true;
        this.render();
        this.selected.clear();
        window.setTimeout(() => {
          this.flashWrong = false;
          this.render();
        }, 280);
        return;
      }
      this.selected.clear();
      const boardBefore = this.solo ? (this.table?.board.slice() ?? []) : this.displayed.slice();
      if (this.solo) this.table?.claim(SOLO_ID, cards);
      else this.director?.claim(cards);
      if (this.solo) this.beginFlash(cards, boardBefore);
    }
    this.render();
  }

  private startTick(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = setInterval(() => this.tickUi(), 100);
  }

  private stopTick(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }

  private tickUi(): void {
    this.renderClock();
    this.renderChrome();
  }

  private renderClock(): void {
    const clock = document.getElementById('clock');
    if (!clock) return;
    const view = this.currentView();
    if (!this.solo || !view) {
      clock.hidden = true;
      return;
    }
    clock.hidden = false;
    if (view.phase === 'over' && this.endedAt === null) this.endedAt = Date.now();
    const now = this.pauseStartedAt ?? Date.now();
    const end = this.endedAt ?? now;
    clock.textContent = formatElapsed(end - this.startedAt);
    if (view.phase === 'over') this.stopTick();
  }

  private render(): void {
    const view = this.currentView();
    this.syncPauseClock(!!view && view.phase === 'playing' && this.isPaused(view));
    this.renderLobby(view);
    this.renderClock();
    this.renderPlay(view);
    this.renderChrome();
  }

  private renderLobby(view: PublicView | null): void {
    const players = this.solo ? [SOLO_ID] : (this.director?.playerIds() ?? []);
    const me = this.me();
    const list = document.getElementById('playerList');
    if (list) {
      list.innerHTML = players.length
        ? players.map((id, index) => `<li>${playerLabel(id, index, me)}</li>`).join('')
        : '<li class="muted">Waiting for players…</li>';
    }

    const invite = document.getElementById('inviteBlock');
    if (invite) invite.hidden = !this.isHost || (view?.phase ?? 'idle') !== 'idle';

    const status = document.getElementById('lobbyStatus');
    if (status) {
      status.textContent = this.isHost
        ? `${players.length} player${players.length === 1 ? '' : 's'} joined.`
        : `${players.length} player${players.length === 1 ? '' : 's'} in the room — waiting for the host…`;
    }

    const startButton = document.getElementById('startBtn') as HTMLButtonElement | null;
    if (startButton) {
      startButton.hidden = !this.isHost;
      startButton.disabled = players.length < MIN_PLAYERS;
      startButton.textContent = players.length < MIN_PLAYERS
        ? `Need ${MIN_PLAYERS} players`
        : 'Start game';
    }
  }

  private renderPlay(view: PublicView | null): void {
    if (!view) return;
    const me = this.me();

    const hud = document.getElementById('hud');
    if (hud) {
      const deck = `${view.deckRemaining} in deck`;
      const scores = view.scores
        .map((row, index) => `${playerLabel(row.entityId, index, me)}: ${row.cards}`)
        .join(' · ');
      hud.textContent = this.solo
        ? `${view.scores[0]?.cards ?? 0} cards · ${deck}`
        : `${deck} · ${scores}`;
    }

    const board = document.getElementById('board');
    if (board) {
      board.classList.toggle('wrong', this.flashWrong);
      const cards = this.flashClaim ? this.displayed : view.board;
      if (!this.flashClaim) this.displayed = view.board.slice();
      const flashed = new Set(this.flashClaim ?? []);
      board.innerHTML = cards.map((card) => {
        const kind = flashed.has(card) ? ' claimed'
          : this.selected.has(card) ? ' selected'
          : this.hintCard === card ? ' hint'
          : '';
        return `<button type="button" class="set-slot${kind}" data-card="${card}" aria-label="Card ${card}">${cardSvg(card)}</button>`;
      }).join('');
    }

    const banner = document.getElementById('result');
    const again = document.getElementById('againBtn') as HTMLButtonElement | null;
    if (view.phase === 'over') {
      const top = Math.max(0, ...view.scores.map((row) => row.cards));
      const winners = view.scores.filter((row) => row.cards === top);
      if (banner) {
        banner.hidden = false;
        banner.textContent = this.solo
          ? `Cleared in ${formatElapsed((this.endedAt ?? Date.now()) - this.startedAt)} — ${view.scores[0]?.cards ?? 0} cards.`
          : winners.length === 1
            ? `${playerLabel(winners[0].entityId, view.scores.indexOf(winners[0]), me)} wins with ${top} cards.`
            : `Tie at ${top} cards.`;
      }
      if (again) {
        again.hidden = this.solo ? false : !this.isHost;
        again.textContent = this.solo ? 'Play again' : 'New game';
      }
    } else {
      if (banner) banner.hidden = true;
      if (again) again.hidden = true;
    }

    if (view.phase === 'playing' && !this.flashClaim) this.noteBoard(view);
  }

  private isPaused(view: PublicView | null): boolean {
    return this.locallyHidden || !!view?.paused;
  }

  private noteBoard(view: PublicView): void {
    const key = view.board.join(',');
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.resetStuck();
  }

  private resetStuck(): void {
    this.stuckSince = Date.now();
    this.hintCard = null;
  }

  private stuckMs(): number {
    const now = this.pauseStartedAt ?? Date.now();
    return now - this.stuckSince;
  }

  private syncPauseClock(paused: boolean): void {
    if (paused && this.pauseStartedAt === null) {
      this.pauseStartedAt = Date.now();
    } else if (!paused && this.pauseStartedAt !== null) {
      const delta = Date.now() - this.pauseStartedAt;
      this.startedAt += delta;
      this.stuckSince += delta;
      this.pauseStartedAt = null;
    }
  }

  private onHint(): void {
    const view = this.currentView();
    if (!view || view.phase !== 'playing' || this.isPaused(view) || this.flashClaim) return;
    this.hintCard = firstHintCard(view.board);
    this.render();
  }

  private onVisibility(): void {
    this.locallyHidden = document.hidden;
    const view = this.currentView();
    if (view?.phase === 'playing') {
      if (this.solo) this.table?.setAway(SOLO_ID, this.locallyHidden);
      else this.director?.setAway(this.locallyHidden);
    }
    this.render();
  }

  private renderChrome(): void {
    const view = this.currentView();
    const playing = view?.phase === 'playing';
    const paused = playing && this.isPaused(view);

    const overlay = document.getElementById('pauseOverlay');
    if (overlay) overlay.hidden = !paused;
    const status = document.getElementById('pauseStatus');
    if (status) {
      status.textContent = this.locallyHidden
        ? 'Paused — return to this tab to keep playing.'
        : 'Paused — waiting for everyone to come back.';
    }

    const hintBtn = document.getElementById('hintBtn') as HTMLButtonElement | null;
    if (hintBtn) {
      hintBtn.hidden = !(playing && !paused && !this.flashClaim && !this.hintCard
        && this.stuckMs() >= HINT_AFTER_MS);
    }
  }

  private showView(viewId: ViewId): void {
    for (const id of ALL_VIEWS) {
      const element = document.getElementById(id);
      if (element) element.hidden = id !== viewId;
    }
  }

  private showMessage(message: string | null): void {
    const element = document.getElementById('message');
    if (!element) return;
    element.textContent = message || '';
    element.hidden = !message;
  }
}

export function startSet(): void {
  const manager = new SetManager();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => manager.initialize());
  } else {
    manager.initialize();
  }
}
