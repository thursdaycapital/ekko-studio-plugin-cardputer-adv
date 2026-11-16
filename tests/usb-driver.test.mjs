import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Duplex } from 'node:stream'
import { createHash } from 'node:crypto'
import { ESPLoader, SECURITY_INFO_FLAG_MAP } from 'esptool-js'
import { createUsbSerial } from '../lib/usb-serial.mjs'

const PORT = Object.freeze({ path: '/dev/fake-cardputer', vendorId: '303a', productId: '1001', serialNumber: 'test-device' })
const MAC = '24:6f:28:01:02:03'
const code = expected => error => error?.code === expected
const securityInfo = (flags = 0, extra = {}) => ({ flags, flashCryptCnt: 0, keyPurposes: Array(7).fill(0), chipId: 9, apiVersion: 0,
  parsedFlags: Object.fromEntries(Object.entries(SECURITY_INFO_FLAG_MAP).map(([name, bit]) => [name, (flags & bit) !== 0])), ...extra })

function fixture(options = {}) {
  const calls = { native: [], reads: [], writes: [], resets: [], securityReads: [], stubUploads: 0, macReads: 0, lists: 0, openCompletions: 0 }
  class Port extends Duplex {
    constructor(settings) { super(); this.settings = settings; this.isOpen = false; this.flags = []; this.closeCalls = 0; this.bytesWritten = 0; calls.native.push(this) }
    _read() {}
    _write(bytes, _encoding, callback) { this.bytesWritten += bytes.length; callback() }
    _destroy(_error, callback) { callback() }
    open(callback) { options.onOpenStarted?.(); Promise.resolve(options.openGate).then(() => setImmediate(() => { this.isOpen = true; calls.openCompletions++; callback(); options.onOpened?.() })) }
    close(callback) { this.closeCalls++; if (!options.hangClose) { this.isOpen = false; callback?.() } }
    set(flags, callback) { this.flags.push(flags); callback() }
    update(_value, callback) { callback() }
    drain(callback) { callback() }
  }
  class Transport { constructor(device) { this.device = device; calls.device = device } }
  class Loader {
    constructor(settings) { this.settings = settings; calls.loader = this }
    async main() {
      await this.settings.transport.device.open({ baudRate: 115200 })
      this.chip = { CHIP_NAME: options.chip ?? 'ESP32-S3', IMAGE_CHIP_ID: 9, readMac: async () => {
        calls.macReads++; return typeof options.mac === 'function' ? options.mac(calls.macReads) : options.mac ?? MAC
      } }
      await options.onMain?.(this, calls)
      await this.runStub()
    }
    async getSecurityInfo(cache = true) { calls.securityReads.push(cache); await options.onSecurityInfo?.(this, calls); return Object.hasOwn(options, 'securityInfo') ? options.securityInfo : securityInfo() }
    async runStub() { calls.stubUploads++ }
    async detectFlashSize() { return options.flashSize ?? '8MB' }
    flashSizeBytes(size) { return { '8MB': 8388608, '16MB': 16777216 }[size] ?? -1 }
    async readFlash(offset, length, onPacket) {
      calls.reads.push({ offset, length }); await options.onRead?.(this, calls)
      const bytes = new Uint8Array(options.shortRead ? length - 1 : length).fill(offset / 65536 & 255)
      onPacket?.(bytes, bytes.length, length); return bytes
    }
    async writeFlash(value) { calls.writes.push(value); value.reportProgress?.(0, value.fileArray[0].data.length, value.fileArray[0].data.length); await options.onWrite?.(this, calls) }
    async flashMd5sum(offset, length) { calls.md5Range = { offset, length }; return options.md5 ?? createHash('md5').update(calls.writes.at(-1).fileArray[0].data).digest('hex') }
    async after(mode) { calls.resets.push(mode); await options.onReset?.(this, calls) }
  }
  const binding = { async list() { calls.lists++; return options.ports?.(calls.lists) ?? [PORT] } }
  return { calls, binding, SerialPortStream: Port, ESPLoader: Loader, Transport, SECURITY_INFO_FLAG_MAP }
}

test('availability actually loads all dependencies without enumerating or opening a port', async () => {
  const fake = fixture(); let loads = 0
  const usb = createUsbSerial({ loadDependencies: async () => { loads++; return fake } })
  assert.deepEqual(await usb.availability(), { available: true, reason: '' })
  assert.equal(loads, 1); assert.equal(fake.calls.lists, 0); assert.equal(fake.calls.native.length, 0)
})

test('unavailable native imports expose only a fixed reason and may recover on a later check', async () => {
  const fake = fixture(); let loads = 0
  const usb = createUsbSerial({ loadDependencies() { if (++loads === 1) throw new Error('private native install path'); return fake } })
  const unavailable = await usb.availability()
  assert.equal(unavailable.available, false)
  assert.doesNotMatch(unavailable.reason, /private|native install/)
  assert.deepEqual(await usb.availability(), { available: true, reason: '' })
  assert.equal(fake.calls.native.length, 0)
})

test('strong USB identity is required and selection is freshly checked before opening', async () => {
  const fake = fixture({ ports: () => [{ ...PORT, serialNumber: 'another-device' }] })
  await assert.rejects(createUsbSerial(fake).openBootloader(PORT), code('USB_IDENTITY_CHANGED'))
  assert.equal(fake.calls.native.length, 0)
  await assert.rejects(createUsbSerial(fake).openBootloader({ path: PORT.path }), code('USB_IDENTITY_UNAVAILABLE'))
})

test('identity changes after native open are rejected before explicit modem control', async () => {
  const fake = fixture({ ports: count => [count === 1 ? PORT : { ...PORT, productId: '0001' }] })
  await assert.rejects(createUsbSerial(fake).openBootloader(PORT), code('USB_IDENTITY_CHANGED'))
  assert.equal(fake.calls.native.length, 1)
  assert.equal(fake.calls.native[0].isOpen, false)
  assert.equal(fake.calls.native[0].flags.length, 0)
})

test('session requires ESP32-S3, exact8MiB and stable actual ROM MAC', async () => {
  for (const [option, expected] of [
    [{ chip: 'ESP32' }, 'USB_CHIP_MISMATCH'],
    [{ flashSize: '16MB' }, 'USB_FLASH_SIZE'],
    [{ mac: 'not-a-rom-mac' }, 'USB_ROM_IDENTITY'],
    [{ mac: '00:00:00:00:00:00' }, 'USB_ROM_IDENTITY'],
    [{ mac: 'ff:ff:ff:ff:ff:ff' }, 'USB_ROM_IDENTITY'],
    [{ mac: '25:6f:28:01:02:03' }, 'USB_ROM_IDENTITY'],
    [{ mac: count => count === 1 ? MAC : '24:6f:28:01:02:04' }, 'USB_ROM_IDENTITY'],
  ]) {
    const fake = fixture(option)
    await assert.rejects(createUsbSerial(fake).openBootloader(PORT), code(expected))
    assert.equal(fake.calls.native[0].isOpen, false)
    assert.equal(fake.calls.writes.length, 0)
  }
})

test('unsupported or unverifiable ROM security is rejected before stub upload or flash access', async () => {
  for (const value of [
    securityInfo(SECURITY_INFO_FLAG_MAP.SECURE_BOOT_EN),
    securityInfo(SECURITY_INFO_FLAG_MAP.SECURE_DOWNLOAD_ENABLE),
    securityInfo(0, { flashCryptCnt: 1 }), securityInfo(0, { flashCryptCnt: 2 }),
    null, undefined, {}, securityInfo(0, { chipId: 2 }),
    securityInfo(0, { apiVersion: null }), securityInfo(0, { flags: -1 }),
    securityInfo(0x80000000), securityInfo(0, { parsedFlags: {} }),
    securityInfo(0, { parsedFlags: { ...securityInfo().parsedFlags, SECURE_BOOT_EN: true } }),
    securityInfo(0, { keyPurposes: [] }),
  ]) {
    const fake = fixture({ securityInfo: value })
    await assert.rejects(createUsbSerial(fake).openBootloader(PORT), code('USB_SECURITY_UNSUPPORTED'))
    assert.deepEqual(fake.calls.securityReads, [false])
    assert.equal(fake.calls.stubUploads, 0); assert.equal(fake.calls.reads.length, 0); assert.equal(fake.calls.writes.length, 0)
    assert.equal(fake.calls.native[0].isOpen, false); assert.equal(fake.calls.resets.length, 0)
  }
})

test('ROM security query failure is a fixed error and releases the native handle', async () => {
  const fake = fixture({ onSecurityInfo() { throw new Error('private ROM diagnostic') } })
  await assert.rejects(createUsbSerial(fake).openBootloader(PORT), error => {
    assert.equal(error.code, 'USB_SECURITY_UNSUPPORTED'); assert.doesNotMatch(error.message, /private|diagnostic/); return true
  })
  assert.equal(fake.calls.stubUploads, 0); assert.equal(fake.calls.native[0].isOpen, false)
})

test('a security rejection with unconfirmed native release preserves the poisoned-close error', async () => {
  const fake = fixture({ securityInfo: securityInfo(SECURITY_INFO_FLAG_MAP.SECURE_BOOT_EN), hangClose: true })
  await assert.rejects(createUsbSerial({ ...fake, closeTimeoutMs: 10 }).openBootloader(PORT), code('USB_CLOSE_UNCONFIRMED'))
  assert.equal(fake.calls.stubUploads, 0); assert.equal(fake.calls.native[0].isOpen, true)
})

test('known non-boot ROM flags remain allowed and security is read before each ROM stub transition', async () => {
  const fake = fixture({ securityInfo: securityInfo(SECURITY_INFO_FLAG_MAP.SOFT_DIS_JTAG), async onMain(loader) {
    await loader.runStub() // Models the upstream baud-change ROM reconnect path.
  } })
  const session = await createUsbSerial({ ...fake, baudRate: 460800 }).openBootloader(PORT)
  assert.deepEqual(fake.calls.securityReads, [false, false]); assert.equal(fake.calls.stubUploads, 2)
  await session.close()
})

test('the pinned upstream main performs the security gate before stub and baud changes', async () => {
  for (const protectedDevice of [false, true]) {
    const events = [], fake = fixture({ securityInfo: securityInfo(protectedDevice ? SECURITY_INFO_FLAG_MAP.SECURE_BOOT_EN : 0) })
    class MainLoader extends fake.ESPLoader {
      async main() { this.romBaudrate = 115200; this.baudrate = 460800; return ESPLoader.prototype.main.call(this) }
      async detectChip() {
        await this.settings.transport.device.open({ baudRate: 115200 })
        this.chip = { CHIP_NAME: 'ESP32-S3', IMAGE_CHIP_ID: 9,
          getChipDescription: async () => 'test', getChipFeatures: async () => 'test', getCrystalFreq: async () => 40,
          readMac: async () => MAC }
      }
      info() {}
      async getSecurityInfo(cache) { events.push(`security:${cache}`); return super.getSecurityInfo(cache) }
      async runStub() { events.push('stub'); return super.runStub() }
      async changeBaud() { events.push('baud'); this.securityInfoCache = null }
      async readFlashId() { return 0x1740ef }
    }
    const opening = createUsbSerial({ ...fake, ESPLoader: MainLoader, baudRate: 460800 }).openBootloader(PORT)
    if (protectedDevice) {
      await assert.rejects(opening, code('USB_SECURITY_UNSUPPORTED'))
      assert.deepEqual(events, ['security:false']); assert.equal(fake.calls.native[0].isOpen, false)
    } else {
      const session = await opening
      assert.deepEqual(events, ['security:false', 'stub', 'baud'])
      await session.close()
    }
  }
})

test('a pre-existing stub or a skipped ROM gate cannot yield an update session', async () => {
  for (const skip of [false, true]) {
    const fake = fixture({ onMain(loader) { loader.syncStubDetected = !skip } })
    if (skip) fake.ESPLoader.prototype.runStub = async function () { fake.calls.stubUploads++ }
    if (skip) fake.ESPLoader.prototype.main = async function () {
      await this.settings.transport.device.open({ baudRate: 115200 })
      this.chip = { CHIP_NAME: 'ESP32-S3', IMAGE_CHIP_ID: 9, readMac: async () => MAC }
    }
    await assert.rejects(createUsbSerial(fake).openBootloader(PORT), code('USB_SECURITY_UNSUPPORTED'))
    assert.equal(fake.calls.stubUploads, 0); assert.equal(fake.calls.native[0].isOpen, false)
  }
})

test('a cancelled or timed-out ROM security query cannot upload a late stub', async () => {
  for (const cancel of [true, false]) {
    let resume, entered
    const gate = new Promise(resolve => { resume = resolve }), started = new Promise(resolve => { entered = resolve })
    const fake = fixture({ async onSecurityInfo() { entered(); await gate } }), controller = new AbortController()
    const opening = createUsbSerial({ ...fake, openTimeoutMs: cancel ? 1000 : 20 }).openBootloader(PORT, { signal: controller.signal })
    await started
    if (cancel) controller.abort(new Error('private abort'))
    await assert.rejects(opening, code(cancel ? 'USB_CANCELLED' : 'USB_TIMEOUT'))
    resume(); await new Promise(resolve => setImmediate(resolve))
    assert.equal(fake.calls.native[0].isOpen, false); assert.equal(fake.calls.stubUploads, 0)
    assert.equal(fake.calls.reads.length, 0); assert.equal(fake.calls.writes.length, 0)
  }
})

test('readFlash uses the real0.7.1 callback shape, bounded chunks and owned exact bytes', async () => {
  const fake = fixture(), progress = []
  const session = await createUsbSerial(fake).openBootloader(PORT)
  assert.equal(session.chip, 'ESP32-S3'); assert.equal(session.flashBytes, 8388608); assert.equal(session.romMac, MAC)
  const bytes = await session.readFlash(0x10000, 0x10001, { onProgress: value => progress.push(value) })
  assert.ok(bytes instanceof Uint8Array); assert.equal(bytes.length, 0x10001)
  assert.equal(bytes[0], 1); assert.equal(bytes[0x10000], 2)
  assert.deepEqual(fake.calls.reads, [{ offset: 0x10000, length: 0x10000 }, { offset: 0x20000, length: 1 }])
  assert.equal(progress[0], 0); assert.equal(progress.at(-1), 100)
  assert.ok(progress.every((value, i) => !i || value > progress[i - 1]))
  await session.close()
})

test('full8MiB read has a complete bounded range and never writes', async () => {
  const fake = fixture(), session = await createUsbSerial(fake).openBootloader(PORT)
  assert.equal((await session.readFlash(0, 0x800000)).length, 0x800000)
  assert.equal(fake.calls.reads.length, 128)
  assert.deepEqual(fake.calls.reads.at(-1), { offset: 0x7f0000, length: 0x10000 })
  assert.equal(fake.calls.writes.length, 0)
  await session.close()
})

test('invalid read and application ranges are refused before hardware commands', async () => {
  const fake = fixture(), session = await createUsbSerial(fake).openBootloader(PORT)
  for (const range of [[-1, 1], [0, 0], [0.5, 1], [0x7fffff, 2], [0, 0x800001]])
    await assert.rejects(session.readFlash(...range), code('USB_INVALID_RANGE'))
  for (const data of [new Uint8Array(0), new Uint8Array(0x330001), 'private-not-an-image'])
    await assert.rejects(session.writeApplication(data), code('USB_INVALID_RANGE'))
  assert.equal(fake.calls.reads.length, 0); assert.equal(fake.calls.writes.length, 0)
  await session.close()
})

test('application writes have one immutable file at0x10000, exact maximum and no eraseAll', async () => {
  const fake = fixture(), session = await createUsbSerial(fake).openBootloader(PORT), progress = []
  const data = new Uint8Array(0x330000).fill(0x31)
  const writing = session.writeApplication(data, { onProgress: value => progress.push(value) })
  data.fill(0x55)
  await writing
  const [write] = fake.calls.writes
  assert.equal(write.fileArray.length, 1); assert.equal(write.fileArray[0].address, 0x10000)
  assert.equal(write.fileArray[0].data.length, 0x330000); assert.equal(write.fileArray[0].data[0], 0x31)
  assert.equal(write.eraseAll, false); assert.equal(write.flashSize, 'keep'); assert.equal(write.flashMode, 'keep')
  assert.deepEqual(fake.calls.md5Range, { offset: 0x10000, length: 0x330000 })
  assert.equal(progress.at(-1), 100)
  assert.equal(fake.calls.resets.length, 0)
  await session.close()
})

test('changed ROM identity cannot write and the native handle is released', async () => {
  const fake = fixture({ mac: count => count <= 2 ? MAC : '24:6f:28:01:02:04' })
  const session = await createUsbSerial(fake).openBootloader(PORT)
  await assert.rejects(session.writeApplication(new Uint8Array([1])), code('USB_IDENTITY_CHANGED'))
  assert.equal(fake.calls.writes.length, 0); assert.equal(fake.calls.native[0].isOpen, false)
})

test('short reads and mismatched MD5 never report completion or reset', async () => {
  for (const options of [{ shortRead: true }, { md5: '0'.repeat(32) }]) {
    const fake = fixture(options), progress = [], session = await createUsbSerial(fake).openBootloader(PORT)
    const request = options.shortRead ? session.readFlash(0, 32, { onProgress: n => progress.push(n) }) : session.writeApplication(new Uint8Array([1]), { onProgress: n => progress.push(n) })
    await assert.rejects(request, code(options.shortRead ? 'USB_PROTOCOL' : 'USB_VERIFY_FAILED'))
    assert.ok(!progress.includes(100)); assert.equal(fake.calls.resets.length, 0)
    assert.equal(fake.calls.native[0].isOpen, false)
  }
})

test('disconnect during reading is an error, not partial success', async () => {
  const fake = fixture({ onRead(_loader, calls) { calls.native[0].isOpen = false; calls.native[0].emit('close') } })
  const session = await createUsbSerial(fake).openBootloader(PORT)
  await assert.rejects(session.readFlash(0, 0x20000), code('USB_CLOSED'))
  assert.equal(fake.calls.reads.length, 1); assert.equal(fake.calls.writes.length, 0)
})

test('cancellation and deadlines close the port before rejecting; late loader work cannot write', async () => {
  for (const cancel of [true, false]) {
    let resume, entered
    const gate = new Promise(resolve => { resume = resolve }), started = new Promise(resolve => { entered = resolve })
    const fake = fixture({ async onRead() { entered(); await gate } }), controller = new AbortController()
    const session = await createUsbSerial({ ...fake, readTimeoutMs: 10 }).openBootloader(PORT, { signal: controller.signal })
    const read = session.readFlash(0, 0x20000)
    await started
    if (cancel) controller.abort(new Error('private cancellation reason'))
    await assert.rejects(read, code(cancel ? 'USB_CANCELLED' : 'USB_TIMEOUT'))
    assert.equal(fake.calls.native[0].isOpen, false)
    resume(); await new Promise(resolve => setImmediate(resolve))
    assert.equal(fake.calls.reads.length, 1); assert.equal(fake.calls.writes.length, 0)
  }
})

test('overlapping operations are refused without cancelling the owned operation', async () => {
  let resume, entered
  const gate = new Promise(resolve => { resume = resolve }), started = new Promise(resolve => { entered = resolve })
  const fake = fixture({ async onRead() { entered(); await gate } })
  const session = await createUsbSerial(fake).openBootloader(PORT), read = session.readFlash(0, 32)
  await started
  await assert.rejects(session.writeApplication(new Uint8Array([1])), code('USB_BUSY'))
  resume(); assert.equal((await read).length, 32)
  await session.close()
})

test('unconfirmed native close is bounded and remains explicitly unknown', async () => {
  const fake = fixture({ hangClose: true }), session = await createUsbSerial({ ...fake, closeTimeoutMs: 10 }).openBootloader(PORT)
  await assert.rejects(session.close(), code('USB_CLOSE_UNCONFIRMED'))
  assert.equal(fake.calls.native[0].isOpen, true)
  await assert.rejects(session.close(), code('USB_CLOSE_UNCONFIRMED'))
})

test('a native handle opening after cancellation is still closed, with no late control writes', async () => {
  let finishOpen, entered, finished
  const gate = new Promise(resolve => { finishOpen = resolve }), started = new Promise(resolve => { entered = resolve })
  const opened = new Promise(resolve => { finished = resolve })
  const fake = fixture({ openGate: gate, onOpenStarted: entered, onOpened: finished }), controller = new AbortController()
  const opening = createUsbSerial({ ...fake, closeTimeoutMs: 10 }).openBootloader(PORT, { signal: controller.signal })
  await started; controller.abort()
  await assert.rejects(opening, code('USB_CLOSE_UNCONFIRMED'))
  finishOpen(); await opened; await new Promise(resolve => setImmediate(resolve))
  assert.equal(fake.calls.openCompletions, 1); assert.equal(fake.calls.native[0].closeCalls, 1)
  assert.equal(fake.calls.native[0].isOpen, false)
  assert.equal(fake.calls.native[0].flags.length, 0); assert.equal(fake.calls.native[0].bytesWritten, 0)
})

test('reset and idempotent close do not claim an application boot', async () => {
  const fake = fixture(), session = await createUsbSerial(fake).openBootloader(PORT)
  assert.deepEqual(await session.reset(), { resetConfirmed: true })
  assert.deepEqual(fake.calls.resets, ['hard_reset'])
  await session.close(); await session.close()
  assert.equal(fake.calls.native[0].isOpen, false)
})

test('pre-cancelled calls neither load dependencies nor enumerate or open a port', async () => {
  const fake = fixture(), controller = new AbortController(); controller.abort(new Error('private abort'))
  let loads = 0
  const usb = createUsbSerial({ loadDependencies: async () => { loads++; return fake } })
  await assert.rejects(usb.availability({ signal: controller.signal }), code('USB_CANCELLED'))
  await assert.rejects(usb.listPorts({ signal: controller.signal }), code('USB_CANCELLED'))
  await assert.rejects(usb.openBootloader(PORT, { signal: controller.signal }), code('USB_CANCELLED'))
  assert.equal(loads, 0); assert.equal(fake.calls.lists, 0); assert.equal(fake.calls.native.length, 0)
})

test('USB disappearance during reset is reported as unconfirmed, not boot success', async () => {
  const fake = fixture({ onReset(_loader, calls) { calls.native[0].isOpen = false; calls.native[0].emit('close') } })
  const session = await createUsbSerial(fake).openBootloader(PORT)
  assert.deepEqual(await session.reset(), { resetConfirmed: false })
  await session.close()
})

test('cancelled application writes cannot subsequently verify, reset or send late serial data', async () => {
  let resume, entered
  const gate = new Promise(resolve => { resume = resolve }), started = new Promise(resolve => { entered = resolve })
  const fake = fixture({ async onWrite(loader) { entered(); await gate; await loader.settings.transport.device.writeBytes(new Uint8Array([1, 2])) } })
  const controller = new AbortController(), session = await createUsbSerial(fake).openBootloader(PORT, { signal: controller.signal })
  const writing = session.writeApplication(new Uint8Array([1]))
  await started; controller.abort(new Error('private abort reason'))
  await assert.rejects(writing, code('USB_CANCELLED'))
  resume(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(fake.calls.native[0].isOpen, false); assert.equal(fake.calls.native[0].bytesWritten, 0)
  assert.equal(fake.calls.md5Range, undefined); assert.equal(fake.calls.resets.length, 0)
})

function nativeBinding({ hangClose = false } = {}) {
  const natives = []
  return { natives, binding: {
    async list() { return [PORT] },
    async open() {
      const readers = []
      const native = { isOpen: true, closes: 0,
        async close() {
          this.closes++
          if (hangClose) await new Promise(() => {})
          this.isOpen = false
          for (const reject of readers.splice(0)) reject(Object.assign(new Error('private cancelled read'), { canceled: true }))
        },
        async set() {}, async update() {}, async drain() {}, async flush() {}, async write() {},
        async read() { return new Promise((_, reject) => readers.push(reject)) },
      }
      natives.push(native); return native
    },
  } }
}

test('the real SerialPortStream adapter explicitly releases its injected native BindingPort', async () => {
  const { SerialPortStream } = await import('@serialport/stream')
  const fake = fixture(), native = nativeBinding()
  const session = await createUsbSerial({ ...fake, ...native, SerialPortStream }).openBootloader(PORT)
  await session.close()
  assert.equal(native.natives[0].closes, 1); assert.equal(native.natives[0].isOpen, false)
})

test('a stuck injected real BindingPort close poisons release despite stream destroy', async () => {
  const { SerialPortStream } = await import('@serialport/stream')
  const fake = fixture(), native = nativeBinding({ hangClose: true })
  const session = await createUsbSerial({ ...fake, ...native, SerialPortStream, closeTimeoutMs: 10 }).openBootloader(PORT)
  await assert.rejects(session.close(), code('USB_CLOSE_UNCONFIRMED'))
  assert.equal(native.natives[0].closes, 1); assert.equal(native.natives[0].isOpen, true)
})
