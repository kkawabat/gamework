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
  formatElapsed,
  isSet,
  PublicView,
  SetTable
} from './SetEngine';

type ViewId = 'homeView' | 'joinView' | 'lobbyView' | 'playView';
const ALL_VIEWS: ViewId[] = ['homeView', 'joinView', 'lobbyView', 'playView'];

const COLORS = ['#c0392b', '#1e8449', '#6c3483'];
const SOLO_ID = 'solo';

function playerLabel(entityId: string, index: number, me: string | null): string {
  if (entityId === SOLO_ID) return 'You';
  const you = entityId === me ? ' (you)' : '';
  const host = index === 0 ? ' — host' : '';
  return `Player ${index + 1}${you}${host}`;
}

function shapePath(shape: number): string {
  if (shape === 0) return 'M 0,-14 L 11,0 L 0,14 L -11,0 Z'; // diamond
  if (shape === 1) return 'M -8,0 A 8,14 0 1 0 8,0 A 8,14 0 1 0 -8,0 Z'; // oval
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
  }

  private startSolo(): void {
    this.solo = true;
    this.table = new SetTable();
    this.table.start([SOLO_ID]);
    this.startedAt = Date.now();
    this.endedAt = null;
    this.selected.clear();
    this.showView('playView');
    this.startClock();
    this.render();
  }

  private async openSession(isHost: boolean): Promise<void> {
    const network = new WebRTCNetworkEngine(createNetworkConfig(), DATA_CHANNEL_CONFIG, this.deviceId);
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
          if (this.director!.publicView.phase !== 'idle') this.enterPlay();
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
    this.selected.clear();
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
    if (!view || view.phase !== 'playing') return;
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
      if (this.solo) this.table?.claim(SOLO_ID, cards);
      else this.director?.claim(cards);
    }
    this.render();
  }

  private startClock(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = setInterval(() => this.renderClock(), 100);
  }

  private stopClock(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
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
    const end = this.endedAt ?? Date.now();
    clock.textContent = formatElapsed(end - this.startedAt);
    if (view.phase === 'over') this.stopClock();
  }

  private render(): void {
    const view = this.currentView();
    this.renderLobby(view);
    this.renderClock();
    this.renderPlay(view);
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
      board.innerHTML = view.board.map((card) => {
        const selected = this.selected.has(card) ? ' selected' : '';
        return `<button type="button" class="set-slot${selected}" data-card="${card}" aria-label="Card ${card}">${cardSvg(card)}</button>`;
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
