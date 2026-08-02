// Square artwork for the board, read off the printed sheet.
//
// The printed board carries a small painting in nearly every square. These are
// stand-in glyphs for those paintings — they reproduce the *subject* where it
// is legible on the sheet, not the artwork itself.

/** The top row spells the board's name, one letter per square, 132 first. */
export const TITLE_ROW = {
  132: 'ప',
  131: 'ర',
  130: 'మ',
  129: 'ప',
  128: 'ద',
  127: 'సో',
  126: 'పా',
  125: 'న',
  124: 'ప',
  123: 'థ',
  122: 'ము',
}

/** Subject of each square's painting, where it could be made out. */
export const ART = {
  3: '🐍', 4: '📜', 5: '🏛', 6: '🐐', 7: '🌺', 8: '🦜', 9: '🐸', 10: '🐗', 11: '🌳',
  13: '🐕', 15: '🏞', 16: '🧘', 17: '👹', 18: '🐎', 20: '🌴', 21: '🐈', 22: '🕉',
  23: '🦂', 24: '🐍', 26: '💰', 28: '🎭', 29: '🤴', 30: '🧘', 32: '🦋', 33: '🐍',
  34: '🦌', 36: '🐄', 38: '🐊', 39: '🐄', 41: '🔥', 43: '🔥', 44: '🦅',
  45: '🌳', 47: '🌹', 50: '🐂', 52: '🧘', 53: '🦌', 55: '🐍',
  56: '🫏', 57: '🪷', 58: '🐢', 59: '🐍', 61: '🏰', 63: '🙏', 64: '👩', 65: '🧘', 66: '🌻',
  70: '🌻', 72: '🏛', 73: '🦊', 75: '🦚', 76: '🦆', 77: '🐆',
  79: '🌙', 80: '👶', 81: '🦋', 82: '🐦', 83: '🪷', 84: '🦌', 86: '🐍', 87: '☀️', 88: '☀️',
  89: '🐍', 90: '🐄', 92: '🐍', 93: '🏛', 95: '🦉', 96: '🦂', 97: '🦋', 98: '🦋', 99: '🏃',
  101: '🧍', 102: '📜', 104: '🐊', 105: '🏛', 106: '🐍', 107: '🛕', 108: '🐍', 109: '🐍', 110: '🐍',
  111: '🧎', 112: '🛕', 113: '🛕', 114: '🛕', 116: '🛕', 117: '🛕', 118: '🛕', 119: '🏰', 120: '🛕', 121: '😤',
}

/** The pastel wash used across the printed squares. */
export const PALETTE = [
  '#fdf3c7', // cream
  '#fbd5d5', // pink
  '#c8f0cf', // mint
  '#cfe3fb', // sky
  '#e2d8fb', // lavender
  '#fde2c0', // peach
]
