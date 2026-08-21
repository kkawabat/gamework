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
 *
 * Coming back from that is the one recovery this game can do, and it rests on
 * the same fact as everything else here — it never locks, so there is still a
 * socket to reopen and a host still willing to answer a hello. A returning tab
 * has to arrive as the *same device*, or it is admitted as a new guest and the
 * old one haunts the roster forever, so the device id is kept in
 * sessionStorage against the room code. What it cannot survive is the hub's own
 * reload: the server deletes a room once its last socket closes, and CREATE_ROOM
 * always mints a new code.
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
const REJOIN_ATTEMPTS = 4;
const REJOIN_BACKOFF_MS = 1500;
const CHANNEL_WAIT_MS = 8000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const newDeviceId = (): string => `device_${Math.random().toString(36).slice(2, 11)}`;

/**
 * sessionStorage rather than localStorage: this identity should last exactly as
 * long as the tab, so a reload keeps a seat and a phone handed to someone else
 * tomorrow does not. Private modes can throw on access, and a guest who cannot
 * be remembered simply comes back as a new one.
 */
function remembered(key: string, fallback: string): string {
  try {
    const stored = sessionStorage.getItem(`wyr:${key}`);
    if (stored) return stored;
    if (fallback) sessionStorage.setItem(`wyr:${key}`, fallback);
  } catch { /* no storage: a returning tab is a new guest */ }
  return fallback;
}

function remember(key: string, value: string): void {
  try {
    sessionStorage.setItem(`wyr:${key}`, value);
  } catch { /* as above */ }
}

class WouldYouRatherManager {
  private session: Session | null = null;
  private director: WouldYouRatherDirector | null = null;
  private network: WebRTCNetworkEngine | null = null;
  private deviceId = newDeviceId();
  private isHub = false;
  private rejoining = false;
  private roomCode = '';
  private attached = false;
  private named = false;
  private qrDrawn = false;
  private passOpen = false;

  async initialize(): Promise<void> {
    const roomCode = new URLSearchParams(window.location.search).get('room');
    this.isHub = !roomCode;
    this.roomCode = roomCode?.toUpperCase() ?? '';
    // A guest reloading has a room code to key on and an entity waiting for it.
    // The hub does not: its reload makes a new room, so a remembered id would
    // only be a lie about which device this is.
    if (!this.isHub) {
      this.deviceId = remembered(`device:${this.roomCode}`, this.deviceId);
      this.named = remembered(`named:${this.roomCode}`, '') === 'yes';
    }

    const network = new WebRTCNetworkEngine(
      // Star means the joiner dials the hub and nobody else. Without this a
      // guest dials every other guest: a mesh's N² connections, and its N² TURN
      // exposure, under a session that routes as a star anyway.
      { ...createNetworkConfig(), dialPolicy: 'host' },
      DATA_CHANNEL_CONFIG,
      this.deviceId
    );
    this.network = network;

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
      if (!this.attached && this.session!.localEntityOfRole('guest')) {
        this.attached = true;
        this.director!.attach();
        this.director!.onPublic(() => this.render());
        this.director!.onTally(() => this.render());
      }
      // Also the far end of a rejoin: the host answers a returning hello with
      // the registry, and the state it needs follows immediately behind.
      this.setHidden('reconnectBanner', true);
      this.render();
    });

    this.session.onPeerFailed(() =>
      this.showMessage('A phone could not connect. If you are on mobile data, try Wi-Fi.'));

    this.watchConnection();

    this.showView(this.named ? 'playView' : 'nameView');
    // A tab that already knows its name paints the play view before the session
    // is back, so say so: an empty roster under "waiting for a question" reads
    // like a quiet room rather than like a page still finding its way home.
    if (this.named) {
      this.setHidden('reconnectBanner', false);
      this.setText('reconnectBanner', 'Getting you back into the room…');
    }
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
      if (!this.isHub) remember(`named:${this.roomCode}`, 'yes');
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

  /**
   * Nothing here polls. Each of these is a moment when coming back is plausible
   * — the tab is looked at again, the network returns, a channel gave up, or the
   * hub re-announced itself to everyone still holding a socket — and `rejoin`
   * decides whether anything is actually wrong.
   */
  private watchConnection(): void {
    const check = () => void this.rejoin();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    window.addEventListener('online', check);
    this.network?.onSignalingClosed(check);
    this.session?.onPeerFailed(check);
    this.session?.onPeerJoined((deviceId) => { if (deviceId === this.network?.getHostId()) check(); });
  }

  private async rejoin(): Promise<void> {
    const network = this.network;
    if (!network || this.rejoining || !this.roomCode) return;

    // The hub only needs its socket: a guest that dropped dials back itself,
    // and the hub cannot dial anyone. A guest needs the channel to the hub,
    // which is the only one it has.
    const hub = network.getHostId();
    const healthy = this.isHub
      ? network.isSignalingOpen()
      : Boolean(hub && network.isChannelOpen(hub));
    if (healthy) return;

    this.rejoining = true;
    this.setHidden('reconnectBanner', false);
    this.setText('reconnectBanner', 'Reconnecting…');
    try {
      for (let attempt = 1; attempt <= REJOIN_ATTEMPTS; attempt += 1) {
        try {
          await network.rejoinRoom();
          // JOIN_ROOM returning only means the room took us back; the session is
          // not usable again until the data channel is open and the host has
          // answered our hello with the registry.
          if (this.isHub || await this.channelReturns()) return;
        } catch {
          // A rejoin can fail for a moment (server waking, radio still down) or
          // for good (the room is gone). Telling those apart is what the retries
          // are; the banner below is what is left when they run out.
        }
        await delay(REJOIN_BACKOFF_MS * attempt);
      }
      this.setText('reconnectBanner', this.isHub
        ? 'Lost the room. Reload to start a new one — the code will change.'
        : 'Could not get back in. Reload this page to rejoin.');
    } finally {
      this.rejoining = false;
    }
  }

  private async channelReturns(): Promise<boolean> {
    const hub = this.network?.getHostId();
    for (let waited = 0; waited < CHANNEL_WAIT_MS; waited += 250) {
      if (hub && this.network!.isChannelOpen(hub)) return true;
      await delay(250);
    }
    return false;
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
    const progress = `${answered} of ${eligible} answered`;
    // A tab that reloaded has lost which side it took; the room has not, so say
    // that rather than inviting a second answer as though it were the first.
    const mine = view.guests.find((guest) => guest.entityId === this.director!.guestId);
    this.setText('guestStatus', chosen
      ? `You picked the ${chosen} one. ${progress} — change it if you like.`
      : mine?.answered
        ? `You already answered this one. ${progress} — pick again to change it.`
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
