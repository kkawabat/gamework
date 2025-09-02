import QRCode from 'qrcode';

/**
 * Generates a random room ID for game rooms
 * @param length The length of the room ID (default: 6)
 * @returns A random room ID string
 */
export function generateRoomId(length: number = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a QR code data URL for easy room joining
 * @param roomId The room ID to encode
 * @param baseUrl The base URL for the game (default: current origin)
 * @returns A data URL containing the QR code image
 */
export async function generateQRCode(roomId: string, baseUrl?: string): Promise<string> {
  const url = baseUrl || window.location.origin;
  const joinUrl = `${url}/join?room=${roomId}`;
  
  try {
    return await QRCode.toDataURL(joinUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw error;
  }
}

/**
 * Generates a QR code SVG for easy room joining
 * @param roomId The room ID to encode
 * @param baseUrl The base URL for the game (default: current origin)
 * @returns An SVG string containing the QR code
 */
export async function generateQRCodeSVG(roomId: string, baseUrl?: string): Promise<string> {
  const url = baseUrl || window.location.origin;
  const joinUrl = `${url}/join?room=${roomId}`;
  
  try {
    return await QRCode.toString(joinUrl, {
      type: 'svg',
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (error) {
    console.error('Failed to generate QR code SVG:', error);
    throw error;
  }
}

/**
 * Validates a room ID format
 * @param roomId The room ID to validate
 * @returns True if the room ID is valid
 */
export function isValidRoomId(roomId: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(roomId);
}

/**
 * Formats a room ID for display (adds hyphens for readability)
 * @param roomId The room ID to format
 * @returns A formatted room ID string
 */
export function formatRoomId(roomId: string): string {
  if (roomId.length <= 4) return roomId;
  
  const groups = [];
  for (let i = 0; i < roomId.length; i += 3) {
    groups.push(roomId.slice(i, i + 3));
  }
  return groups.join('-');
}

