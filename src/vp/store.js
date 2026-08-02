// Everything the player supplies — the photograph of their own board, where
// its corners are, and their faces — lives here.

const KEY = 'vaikuntapali.setup.v1'

/**
 * Shrink and re-encode an image before it is stored.
 *
 * A photo straight off a tablet camera is several megabytes; localStorage
 * gives about five in total, so storing the original would fail on the first
 * save. Downscaling to a sane edge and re-encoding as JPEG keeps a board
 * photo well under a megabyte while staying sharp enough to read the squares.
 */
export function shrinkImage(file, maxEdge = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not an image'))
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d')
        g.drawImage(img, 0, 0, w, h)
        resolve({ url: c.toDataURL('image/jpeg', quality), width: w, height: h })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/** Crop an image to a centred square and shrink it, for a player's face. */
export function shrinkAvatar(file, size = 220) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not an image'))
      img.onload = () => {
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        const c = document.createElement('canvas')
        c.width = c.height = size
        const g = c.getContext('2d')
        g.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        resolve(c.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export function loadSetup() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    return JSON.parse(raw) || {}
  } catch {
    return {}
  }
}

/**
 * Persist the setup. Returns false when the browser refuses — a quota error
 * is worth telling the player about rather than silently losing their board.
 */
export function saveSetup(setup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup))
    return true
  } catch {
    return false
  }
}

export function clearSetup() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
