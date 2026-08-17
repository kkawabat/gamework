/**
 * DOM layer for the Odd One Out demo. All the game logic lives in
 * OddOneOutDirector, which is driven across real sessions in
 * tests/unit/OddOneOut.test.ts — this file only paints it.
 *
 * Opening the page with no room code hosts: that device brings an `admin`
 * (the referee) and a `player` (its own seat). Everyone else scans the QR
 * and brings a single `player`. Mesh, so every phone holds a channel to
 * every other phone; authoritative, so the word is a routing fact.
 */

import QRCode from 'qrcode';
import { Session, WebRTCNetworkEngine } from '../../src';
import { createNetworkConfig, DATA_CHANNEL_CONFIG } from '../shared/network-config';
import {
  MIN_PLAYERS,
  ODD_ONE_OUT_ROLES,
  OddOneOutDirector,
  PublicView,
  SecretView
} from './OddOneOutDirector';

type ViewId = 'homeView' | 'playView';
const ALL_VIEWS: ViewId[] = ['homeView', 'playView'];

class OddOneOutManager {
  private session: Session | null = null;
  private director: OddOneOutDirector | null = null;
  private readonly deviceId = `device_${Math.random().toString(36).slice(2, 11)}`;
  private attached = false;
  private isHost = false;
  private locked = false;

  async initialize(): Promise<void> {
    const roomCode = new URLSearchParams(window.location.search).get('room');
    this.isHost = !roomCode;

    const network = new WebRTCNetworkEngine(createNetworkConfig(), DATA_CHANNEL_CONFIG, this.deviceId);

    this.session = new Session(network, {
      mode: { connectivity: 'mesh', authority: 'authoritative' },
      deviceId: this.deviceId,
      roles: ODD_ONE_OUT_ROLES,
      entities: this.isHost ? [{ role: 'admin' }, { role: 'player' }] : [{ role: 'player' }],
      maxEntities: { admin: 1, player: 8 }
    });

    this.director = new OddOneOutDirector(this.session);

    this.session.onRegistry((_entities, locked) => {
      if (locked) this.session!.lock();
      if (!this.attached && this.session!.localEntityOfRole('player')) {
        this.attached = true;
        this.director!.attach();
        this.director!.onPublic(() => this.render());
        this.director!.onSecret(() => this.render());
        this.showView('playView');
      }
      this.render();
    });

    this.session.onPeerFailed(() => this.showMessage('A device could not connect. If you are on mobile data, try Wi-Fi.'));

    try {
      await this.session.initialize();
      if (this.isHost) await this.startHost();
      else await this.session.join(roomCode!.toUpperCase());
    } catch (error) {
      this.showMessage(`Could not connect: ${(error as Error).message}`);
    }

    this.wireControls();
  }

  private async startHost(): Promise<void> {
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
        if (!this.locked) {
          this.session?.lock();
          this.locked = true;
        }
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
    this.renderLobby(this.director.publicView);
    this.renderPlayer(this.director.publicView, this.director.secret);
  }

  private renderLobby(view: PublicView): void {
    const players = this.director!.playerIds();
    const invite = document.getElementById('inviteBlock');
    if (invite) invite.hidden = !this.isHost || view.phase !== 'lobby';

    const list = document.getElementById('playerList');
    if (list) {
      list.innerHTML = players.length
        ? players.map((entityId, index) => {
            const you = entityId === this.director!.playerId ? ' (you)' : '';
            const host = index === 0 ? ' — host' : '';
            const voted = view.players.find((player) => player.entityId === entityId)?.voted ? ' ✓' : '';
            return `<li>Player ${index + 1}${you}${host}${voted}</li>`;
          }).join('')
        : '<li class="muted">Waiting for players…</li>';
    }

    const status = document.getElementById('lobbyStatus');
    if (status) {
      status.textContent =
        view.phase === 'reveal' ? `The word was “${view.word}”.`
        : view.phase === 'voting' ? 'Everyone has a word — except one of you. Vote below.'
        : this.isHost
          ? `${players.length} player${players.length === 1 ? '' : 's'} joined.`
          : `${players.length} player${players.length === 1 ? '' : 's'} in the room — waiting for the host…`;
    }

    const startButton = document.getElementById('startRoundBtn') as HTMLButtonElement | null;
    if (startButton) {
      startButton.hidden = !this.isHost;
      startButton.disabled = players.length < MIN_PLAYERS;
      startButton.textContent = players.length < MIN_PLAYERS
        ? `Need ${MIN_PLAYERS} players`
        : view.phase === 'lobby' ? 'Start round' : 'New round';
    }
  }

  private renderPlayer(view: PublicView, secret: SecretView | null): void {
    const round = document.getElementById('roundBlock');
    if (round) round.hidden = view.phase === 'lobby';

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
