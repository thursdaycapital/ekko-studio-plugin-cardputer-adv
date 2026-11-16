import { usbError } from './usb-errors.mjs'

const text = (value, limit) => typeof value === 'string' && value.length <= limit &&
  value.length > 0 && !/[\u0000-\u001f\u007f]/u.test(value) ? value : ''
const usbId = value => {
  if (typeof value !== 'string') return ''
  const clean = value.replace(/^0x/iu, '')
  return /^[0-9a-f]{1,4}$/iu.test(clean) ? clean.toLowerCase().padStart(4, '0') : ''
}

/** A copied whitelist; callers never retain mutable native enumeration records. */
export function normalizePortInfo(value) {
  if (!value || typeof value !== 'object' || !text(value.path, 1024)) throw usbError('USB_IDENTITY_UNAVAILABLE')
  const port = { path: value.path, vendorId: usbId(value.vendorId), productId: usbId(value.productId),
    serialNumber: text(value.serialNumber, 256).trim() }
  for (const key of ['pnpId', 'locationId', 'manufacturer', 'friendlyName']) {
    const clean = text(value[key], 512)
    if (clean) port[key] = clean
  }
  return Object.freeze(port)
}

/** A reused path or physical USB location alone is not a device identity. */
export function hasStrongUsbIdentity(port) {
  return Boolean(port?.path && port.vendorId && port.productId && port.serialNumber)
}

export function sameUsbDevice(original, current) {
  try { original = normalizePortInfo(original); current = normalizePortInfo(current) } catch { return false }
  if (!hasStrongUsbIdentity(original) || !hasStrongUsbIdentity(current)) return false
  if (['path', 'vendorId', 'productId', 'serialNumber'].some(key => original[key] !== current[key])) return false
  return ['pnpId', 'locationId'].every(key => !original[key] || original[key] === current[key])
}

export function normalizeRomMac(value) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/iu.test(value)) throw usbError('USB_ROM_IDENTITY')
  const bytes = value.split(':').map(part => Number.parseInt(part, 16))
  if ((bytes[0] & 1) || bytes.every(byte => byte === 0) || bytes.every(byte => byte === 255)) throw usbError('USB_ROM_IDENTITY')
  return value.toLowerCase()
}

/** Accept only a complete upstream ROM report for an unencrypted, unsigned update. */
export function assertUnprotectedSecurity(info, chip, flagMap) {
  const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff
  const byte = value => Number.isInteger(value) && value >= 0 && value <= 255
  const flags = flagMap && typeof flagMap === 'object' ? Object.entries(flagMap) : []
  const validMap = flags.length > 0 && ['SECURE_BOOT_EN', 'SECURE_DOWNLOAD_ENABLE']
    .every(name => Object.hasOwn(flagMap, name)) && flags.every(([, bit]) => uint32(bit) && bit > 0 && (bit & (bit - 1)) === 0)
  const knownMask = flags.reduce((mask, [, bit]) => mask | bit, 0) >>> 0
  if (!validMap || !info || !uint32(info.flags) || !uint32(chip?.IMAGE_CHIP_ID) ||
      info.chipId !== chip.IMAGE_CHIP_ID || !uint32(info.apiVersion) || info.flashCryptCnt !== 0 ||
      !Array.isArray(info.keyPurposes) || info.keyPurposes.length !== 7 || !info.keyPurposes.every(byte) ||
      !info.parsedFlags || (info.flags & ~knownMask) !== 0 || flags.some(([name, bit]) =>
        typeof info.parsedFlags[name] !== 'boolean' || info.parsedFlags[name] !== ((info.flags & bit) !== 0)) ||
      info.parsedFlags.SECURE_BOOT_EN || info.parsedFlags.SECURE_DOWNLOAD_ENABLE) throw usbError('USB_SECURITY_UNSUPPORTED')
  // Even a nonzero encryption counter with even parity is refused: this updater
  // does not manage encryption provisioning or signed/encrypted image formats.
}
