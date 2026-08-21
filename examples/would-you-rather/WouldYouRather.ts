/**
 * DOM layer for the Would You Rather demo. All the game logic lives in
 * WouldYouRatherDirector, which is driven across real sessions in
 * tests/unit/WouldYouRather.test.ts — this file only paints it.
 *
 * Opening the page with no room code hosts: that device brings an `admin` (the
 * reducer) and a `guest` (its own seat, and the first asker). Everyone else
 * scans the QR and brings a single `guest`. Star, so joiners dial only the hub
 * and TURN exposure is bounded to hub↔spoke pairs — which is what a party of
 * phones on cellular needs.
 *
 * The QR is drawn wherever the asking seat currently is, since the asker is the
 * one inviting people. New arrivals still reach the room through the hub's
 * signaling socket, which is why the hub's tab carries a banner asking for it
 * to be left open: a backgrounded tab freezes its keepalive and the socket dies
 * (see CONTEXT.md), and then the QR on someone else's screen leads nowhere.
 */

import QRCode from 'qrcode';
import { Session, WebRTCNetworkEngine } from '../../src';
import { createNetworkConfig, DATA_CHANNEL_CONFIG } from '../shared/network-config';
import {
  Choice,
  defaultName,
  MAX_NAME_LENGTH,
  PublicGuest,
  WOULD_YOU_RATHER_ROLES,
  WouldYouRatherDirector
} from './WouldYouRatherDirector';

type ViewId = 'homeView' | 'nameView' | 'playView';
const ALL_VIEWS: ViewId[] = ['homeView', 'nameView', 'playView'];

const MAX_GUESTS = 24;

class WouldYouRatherManager {
  private session: Session | null = null;
  private director: WouldYouRatherDirector | null = null;
  private readonly deviceId = `device_${Math.random().toString(36).slice(2, 11)}`;
  private isHub = false;
  private roomCode = '';
  private attached = false;
  private named = false;
  private qrDrawn = false;
  private passOpen = false;

  async initialize(): Promise<void> {
    const roomCode = new URLSearchParams(window.location.search).get('room');
    this.isHub = !roomCode;
    this.roomCode = roomCode?.toUpperCase() ?? '';

    const network = new WebRTCNetworkEngine(createNetworkConfig(), DATA_CHANNEL_CONFIG, this.deviceId);

    this.session = new Session(network, {
      mode: { connectivity: 'star', authority: 'authoritative' },
      deviceId: this.deviceId,
      roles: WOULD_YOU_RATHER_ROLES,
      entities: this.isHub ? [{ role: 'admin' }, { role: 'guest' }] : [{ role: 'guest' }],
      maxEntities: { admin: 1, guest: MAX_GUESTS }
      // No `unreliable` channels and, deliberately, no lock(): admission stays
      // open so latecomers can still join, all evening.
    });

    this.director = new WouldYouRatherDirector(this.session);

    this.session.onRegistry(() => {
      if (this.attached || !this.session!.localEntityOfRole('guest')) return;
      this.attached = true;
      this.director!.attach();
      this.director!.onPublic(() => this.render());
      this.director!.onTally(() => this.render());
      this.render();
    });

    this.session.onPeerFailed(() =>
      this.showMessage('A phone could not connect. If you are on mobile data, try Wi-Fi.'));

    this.showView('nameView');
    this.wireControls();

    try {
      await this.session.initialize();
      if (this.isHub) this.roomCode = await this.session.host();
      else await this.session.join(this.roomCode);
    } catch (error) {
      this.showView('homeView');
      this.showMessage(`Could not connect: ${(error as Error).message}`);
    }

    this.render();
  }

  private wireControls(): void {
    const nameInput = document.getElementById('nameInput') as HTMLInputElement | null;
    nameInput?.setAttribute('maxlength', String(MAX_NAME_LENGTH));

    document.getElementById('nameForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!this.attached) return;
      const typed = nameInput?.value.trim() ?? '';
      if (typed) this.director?.setName(typed);
      this.named = true;
      this.showView('playView');
      this.render();
    });

    document.getElementById('answerFirst')?.addEventListener('click', () => this.answer('first'));
    document.getElementById('answerSecond')?.addEventListener('click', () => this.answer('second'));

    document.getElementById('newQuestionBtn')?.addEventListener('click', () => {
      this.passOpen = false;
      this.director?.askNewQuestion();
    });

    document.getElementById('passBtn')?.addEventListener('click', () => {
      this.passOpen = !this.passOpen;
      this.render();
    });

    document.getElementById('passList')?.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-pass-to]');
      if (!target) return;
      this.passOpen = false;
      this.director?.passSeat(target.dataset.passTo!);
    });

    document.getElementById('takeSeatBtn')?.addEventListener('click', () => this.director?.takeSeat());
  }

  private answer(choice: Choice): void {
    this.director?.answer(choice);
    this.render();
  }

  private render(): void {
    if (!this.director) return;
    const view = this.director.publicView;

    this.setText('nameStatus', this.attached
      ? 'You are in. Pick a name, or just carry on.'
      : 'Connecting…');
    const continueBtn = document.getElementById('continueBtn') as HTMLButtonElement | null;
    if (continueBtn) continueBtn.disabled = !this.attached;
    const nameInput = document.getElementById('nameInput') as HTMLInputElement | null;
    if (nameInput && !nameInput.placeholder && this.director.guestId) {
      nameInput.placeholder = defaultName(this.director.guestId);
    }
    if (!this.named) return;

    const asking = this.director.isAsker;
    this.setHidden('askerPanel', !asking);
    this.setHidden('guestPanel', asking);
    this.renderRoster(view.guests, asking);

    // The hub is routing for everyone whether or not it holds the asking seat,
    // and nothing else in the UI would ever say so.
    this.setHidden('hubBanner', !this.isHub || asking);
    this.setText('hubRoomCode', this.roomCode);
    this.setHidden('takeSeatBtn', !this.isHub || asking);

    if (asking) this.renderAsker();
    else this.renderGuest();
  }

  private renderAsker(): void {
    const view = this.director!.publicView;
    const tally = this.director!.tally;
    this.drawQrOnce();
    this.setText('roomCode', this.roomCode);
    this.setText('askerRound', `Question ${view.round}`);

    const first = tally?.first ?? 0;
    const second = tally?.second ?? 0;
    this.setText('firstCount', String(first));
    this.setText('secondCount', String(second));

    const bar = document.getElementById('splitBar');
    if (bar) {
      const total = first + second;
      (bar as HTMLElement).style.setProperty('--first-share', `${total ? (first / total) * 100 : 50}%`);
      bar.classList.toggle('empty', total === 0);
    }

    this.setText('splitScore', tally && tally.answered > 0
      ? `Split ${tally.split} / 100${tally.best ? ` · your best ${tally.best}` : ''}`
      : 'Ask your question out loud, then watch the room take sides.');
    this.setText('askerStatus', tally
      ? `${tally.answered} of ${tally.eligible} answered`
      : 'Waiting for guests to join…');

    this.setHidden('passList', !this.passOpen);
    const passList = document.getElementById('passList');
    if (passList) {
      const others = view.guests.filter((guest) => guest.entityId !== this.director!.guestId);
      passList.innerHTML = others.length
        ? others.map((guest) =>
            `<li><button data-pass-to="${guest.entityId}">${escapeHtml(guest.name)}</button></li>`).join('')
        : '<li class="muted">Nobody to pass to yet.</li>';
    }
    const passBtn = document.getElementById('passBtn');
    if (passBtn) passBtn.textContent = this.passOpen ? 'Never mind' : 'Pass the seat';
  }

  private renderGuest(): void {
    const view = this.director!.publicView;
    const asker = view.guests.find((guest) => guest.entityId === view.asker);
    this.setText('guestRound', `Question ${view.round}`);
    this.setText('askerName', asker ? `${asker.name} is asking` : 'Waiting for a question…');

    const chosen = this.director!.myChoice;
    for (const [id, choice] of [['answerFirst', 'first'], ['answerSecond', 'second']] as const) {
      document.getElementById(id)?.classList.toggle('chosen', chosen === choice);
    }

    const answered = view.guests.filter((guest) => guest.answered).length;
    const eligible = Math.max(view.guests.length - 1, 0);
    this.setText('guestStatus', chosen
      ? `You picked the ${chosen} one. ${answered} of ${eligible} answered — change it if you like.`
      : 'Listen to the question, then pick a side.');
  }

  private renderRoster(guests: PublicGuest[], asking: boolean): void {
    const list = document.getElementById(asking ? 'askerRoster' : 'guestRoster');
    if (!list) return;
    list.innerHTML = guests.length
      ? guests.map((guest) => {
          const you = guest.entityId === this.director!.guestId ? ' (you)' : '';
          const seat = guest.entityId === this.director!.publicView.asker ? ' 🎤' : '';
          const tick = guest.answered ? ' ✓' : '';
          return `<li>${escapeHtml(guest.name)}${you}${seat}${tick}</li>`;
        }).join('')
      : '<li class="muted">Nobody here yet…</li>';
  }

  private drawQrOnce(): void {
    const container = document.getElementById('qrCodeContainer');
    if (this.qrDrawn || !container || !this.roomCode) return;
    this.qrDrawn = true;
    const url = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, url, { width: 180, margin: 2 })
      .then(() => container.replaceChildren(canvas))
      .catch(() => { container.textContent = url; });
  }

  private showView(viewId: ViewId): void {
    for (const id of ALL_VIEWS) this.setHidden(id, id !== viewId);
  }

  private setHidden(id: string, hidden: boolean): void {
    const element = document.getElementById(id);
    if (element) element.hidden = hidden;
  }

  private setText(id: string, text: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  }

  private showMessage(message: string): void {
    this.setText('message', message);
    this.setHidden('message', !message);
  }
}

/** Names are typed by guests and land in everyone else's roster. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function startWouldYouRather(): void {
  const manager = new WouldYouRatherManager();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => manager.initialize());
  } else {
    manager.initialize();
  }
}
