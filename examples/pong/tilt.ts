/**
 * Tilt steering, ported from the portfolio's tilt_breakout
 * (portfolio/apps/tilt_breakout/static/tilt_breakout/js/tilt_breakout.js).
 *
 * Kept as a copy rather than a shared package: the original is Django-served
 * vanilla JS in another repo, and this is ~90 lines. If a third game wants it,
 * that is the point to extract it properly.
 */

const DEG = Math.PI / 180;

/** Roll at which steering saturates. ~40° of comfortable wrist travel. */
const FULL_DEFLECTION = 40 * DEG;
const DEADZONE = 0.06;

export interface TiltState {
  supported: boolean;
  needsPermission: boolean;
  receiving: boolean;
}

let listening = false;
let receiving = false;
let roll = 0;
let neutral = 0;
let awaitingCalibration = false;
let onAvailable: (() => void) | null = null;

const supported = typeof DeviceOrientationEvent !== 'undefined';
const needsPermission = supported
  && typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function';

function currentScreenAngle(): number {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof (window as unknown as { orientation?: number }).orientation === 'number'
    ? (window as unknown as { orientation: number }).orientation
    : 0;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Roll angle of the screen about its own vertical axis, in radians: negative
 * when the screen's left edge dips, positive when its right edge does.
 *
 * The orientation angles describe a Z-X'-Y'' rotation, so gravity in device
 * coordinates is (cosB sinG, -sinB, -cosB cosG). Rotating that by the screen's
 * own angle gives its horizontal component, which is the sine of the roll — so
 * one formula covers portrait and both landscape directions. Working in angle
 * rather than sine keeps the calibrated neutral symmetric: 22° of roll means
 * the same thing from any grip.
 */
export function readScreenRoll(betaDeg: number, gammaDeg: number): number {
  const beta = betaDeg * DEG;
  const gamma = gammaDeg * DEG;
  const deviceX = Math.cos(beta) * Math.sin(gamma);
  const deviceY = -Math.sin(beta);
  const angle = currentScreenAngle() * DEG;
  const horizontal = deviceX * Math.cos(angle) - deviceY * Math.sin(angle);
  return Math.asin(clamp(horizontal, -1, 1));
}

function onDeviceOrientation(event: DeviceOrientationEvent): void {
  if (event.beta === null || event.gamma === null) return;
  roll = readScreenRoll(event.beta, event.gamma);
  if (awaitingCalibration) {
    neutral = roll;
    awaitingCalibration = false;
  }
  if (!receiving) {
    receiving = true;
    onAvailable?.();
  }
}

/**
 * Must be called from a user gesture: iOS only resolves the permission prompt
 * when one is in progress, and only over HTTPS.
 */
export async function enableTilt(): Promise<boolean> {
  if (!supported) return false;
  if (needsPermission) {
    try {
      const request = (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> })
        .requestPermission;
      if (await request() !== 'granted') return false;
    } catch {
      return false;
    }
  }
  if (!listening) {
    window.addEventListener('deviceorientation', onDeviceOrientation);
    listening = true;
  }
  return true;
}

/**
 * Zero the steering on the player's current grip. On iOS the permission prompt
 * resolves before the first reading arrives, so defer to the next event rather
 * than calibrating on a roll of 0 the player never actually held.
 */
export function calibrateTilt(): void {
  if (receiving) neutral = roll;
  else awaitingCalibration = true;
}

/** Steering signal in -1..1, relative to the grip captured at calibration. */
export function tiltSteering(): number {
  if (!receiving) return 0;
  const centered = clamp((roll - neutral) / FULL_DEFLECTION, -1, 1);
  return Math.abs(centered) < DEADZONE ? 0 : centered;
}

export function tiltState(): TiltState {
  return { supported, needsPermission, receiving };
}

export function whenTiltAvailable(callback: () => void): void {
  onAvailable = callback;
}
