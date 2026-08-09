/**
 * DOM layer for the Odd One Out demo. All the game logic lives in
 * OddOneOutDirector, which is driven across real sessions in
 * tests/unit/OddOneOut.test.ts — this file only paints it.
 *
 * The PC opens the page with no room code and becomes the hub: it brings an
 * `admin` entity (the referee) and a `table` entity (the shared screen).
 * Phones open the QR link and bring a single `player`.
 */

import QRCode from 'qrcode';
import { Session } from '../../src';
import { WebRTCNetworkEngine } from '../../src/engines/WebRTCNetworkEngine';
import { createNetworkConfig, DATA_CHANNEL_CONFIG } from '../shared/network-config';
import {
  MIN_PLAYERS,
  ODD_ONE_OUT_ROLES,
  OddOneOutDirector,
  PublicView,
  SecretView
} from './OddOneOutDirector';

type ViewId = 'homeView' | 'tableView' | 'playerView';
const ALL_VIEWS: ViewId[] = ['homeView', 'tableView', 'playerView'];

class OddOneOutManager {
  private session: Session | null = null;
  private director: OddOneOutDirector | null = null;
  private readonly deviceId = `device_${Math.random().toString(36).slice(2, 11)}`;
  private attached = false;
  private isTable = false;

  async initialize(): Promise<void> {
    const roomCode = new URLSearchParams(window.location.search).get('room');
    this.isTable = !roomCode;

    const network = new WebRTCNetworkEngine(
      // Star: a phone dials the hub and nothing else.
      { ...createNetworkConfig(), dialPolicy: 'host' },
      DATA_CHANNEL_CONFIG,
      this.deviceId
    );

    this.session = new Session(network, {
      mode: { connectivity: 'star', authority: 'authoritative' },
      deviceId: this.deviceId,
      roles: ODD_ONE_OUT_ROLES,
      entities: this.isTable ? [{ role: 'admin' }, { role: 'table' }] : [{ role: 'player' }],
      maxEntities: { admin: 1, table: 1, player: 8 }
    });

    this.director = new OddOneOutDirector(this.session);

    this.session.onRegistry(() => {
      // Attach once, when this device's own entities first appear — a joiner
      // does not know its entity id until the host has assigned it.
      if (!this.attached && this.session!.localEntities.length > 0) {
        this.attached = true;
        this.director!.attach();
        this.director!.onPublic(() => this.render());
        this.director!.onSecret(() => this.render());
        this.showView(this.isTable ? 'tableView' : 'playerView');
      }
      this.render();
    });

    this.session.onPeerFailed(() => this.showMessage('A device could not connect. If you are on mobile data, try Wi-Fi.'));

    try {
      await this.session.initialize();
      if (this.isTable) await this.startTable();
      else await this.session.join(roomCode!.toUpperCase());
    } catch (error) {
      this.showMessage(`Could not connect: ${(error as Error).message}`);
    }

    this.wireControls();
  }

  private async startTable(): Promise<void> {
    const roomCode = await this.session!.host();
    const codeElement = document.getElementById('roomCode');
    if (codeElement) codeElement.textContent = roomCode;

    const container = document.getElementById('qrCodeContainer');
    if (!container) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    const canvas = document.createElement('canvas');
    try {
      await QRCode.toCanvas(canvas, url, { width: 200, margin: 2 });
      container.replaceChildren(canvas);
    } catch {
      container.textContent = url;
    }
  }

  private wireControls(): void {
    document.getElementById('startRoundBtn')?.addEventListener('click', () => {
      try {
        this.director?.startRound();
      } catch (error) {
        this.showMessage((error as Error).message);
      }
    });

    document.getElementById('voteList')?.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-vote]');
      if (target) this.director?.vote(target.dataset.vote!);
    });
  }

  private render(): void {
    if (!this.director) return;
    if (this.isTable) this.renderTable(this.director.publicView);
    else this.renderPlayer(this.director.publicView, this.director.secret);
  }

  private renderTable(view: PublicView): void {
    const players = this.director!.playerIds();

    const list = document.getElementById('tablePlayers');
    if (list) {
      list.innerHTML = players.length
        ? view.players.map((player, index) => {
            const voted = player.voted ? ' ✓' : '';
            const culprit = view.oddOneOut === player.entityId ? ' — the odd one out' : '';
            return `<li>Player ${index + 1}${voted}${culprit}</li>`;
          }).join('')
        : '<li class="muted">Waiting for players…</li>';
    }

    const status = document.getElementById('tableStatus');
    if (status) {
      status.textContent =
        view.phase === 'reveal' ? `The word was “${view.word}”.`
        : view.phase === 'voting' ? 'Everyone has a word — except one of you. Vote on your phone.'
        : `${players.length} player${players.length === 1 ? '' : 's'} joined.`;
    }

    const startButton = document.getElementById('startRoundBtn') as HTMLButtonElement | null;
    if (startButton) {
      startButton.disabled = players.length < MIN_PLAYERS;
      startButton.textContent = players.length < MIN_PLAYERS
        ? `Need ${MIN_PLAYERS} players`
        : view.phase === 'lobby' ? 'Start round' : 'New round';
    }
  }

  private renderPlayer(view: PublicView, secret: SecretView | null): void {
    const card = document.getElementById('secretCard');
    if (card) {
      card.textContent = !secret ? 'Waiting for the round to start…'
        : secret.oddOneOut ? 'You are the odd one out. Bluff.'
        : secret.word!;
      card.classList.toggle('odd', Boolean(secret?.oddOneOut));
    }

    const voteList = document.getElementById('voteList');
    if (!voteList) return;
    if (view.phase !== 'voting') {
      voteList.innerHTML = view.phase === 'reveal'
        ? `<li class="muted">The word was “${view.word}”.</li>`
        : '';
      return;
    }

    const me = this.director!.playerId;
    const alreadyVoted = Boolean(me && view.votes[me]);
    voteList.innerHTML = view.players
      .map((player, index) => player.entityId === me
        ? `<li class="muted">Player ${index + 1} (you)</li>`
        : `<li><button data-vote="${player.entityId}"${alreadyVoted ? ' disabled' : ''}>Player ${index + 1}</button></li>`)
      .join('');
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

export function startOddOneOut(): void {
  const manager = new OddOneOutManager();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => manager.initialize());
  } else {
    manager.initialize();
  }
}
