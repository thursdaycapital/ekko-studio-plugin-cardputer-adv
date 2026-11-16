import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createUsbUpdater } from '../lib/usb-updater.mjs'

// Only synthetic Flash + injected native interfaces are used. No serial import,
// network request, account, production backup, or physical device is involved.
const FLASH = 0x800000, APP = 0x10000, FACTORY = 0x340000
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function run(userId = 1, profile = 'default', overrides = {}) {
  return { identity: { userId, profile, surface: 'ui' }, permissions: ['api.write'],
    signal: new AbortController().signal, ...overrides }
}
async function until(read, predicate, milliseconds = 4000) {
  const start = Date.now()
  while (Date.now() - start < milliseconds) {
    const result = await read()
    if (predicate(result)) return result
    await new Promise(resolve => setTimeout(resolve, 3))
  }
  throw new Error('synthetic job did not settle')
}
async function fixture(t, options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cardputer-usb-update-'))
  const events = [], port = { path: '/dev/synthetic-cardputer', vendorId: '303a', productId: '1001',
    serialNumber: `synthetic-${randomUUID()}`, manufacturer: 'Synthetic Cardputer' }
  const image = Buffer.alloc(1025, 0x72)
  image[0] = 0xe9; image[1] = 2; image[3] = 0x30; image[12] = 9; image[13] = 0
  const initial = Buffer.alloc(FLASH, 0x53)
  initial.fill(0xff, 0x8000, 0x8c00)
  const state = { flash: Buffer.from(initial), ports: [port], reads: 0, writes: 0, closes: 0, opens: 0,
    resets: 0, identities: 0, backupCheckedBeforeWrite: false }
  const firmware = { version: 'synthetic-test-not-runnable', sha256: sha(image), bytes: image,
    partitionTable: { offset: 0x8000, bytes: 3072, sha256: sha(initial.subarray(0x8000, 0x8c00)) } }
  const session = {
    chip: 'ESP32-S3', flashBytes: FLASH, romMac: '02:00:00:12:34:56',
    async assertIdentity() { state.identities++; events.push('identity'); await options.identity?.(state) },
    async readFlash(offset, length, { onProgress } = {}) {
      state.reads++; events.push(`read-${state.reads}`)
      assert.equal(offset, 0); assert.equal(length, FLASH)
      await options.read?.(state)
      onProgress?.(50); onProgress?.(100)
      return Uint8Array.from(state.flash)
    },
    async writeApplication(bytes, { onProgress } = {}) {
      state.writes++; events.push('write')
      const directories = await fs.readdir(path.join(dataDir, 'usb-backups'))
      assert.equal(directories.length, 1)
      const directory = path.join(dataDir, 'usb-backups', directories[0])
      const [saved, metadata] = await Promise.all([fs.readFile(path.join(directory, 'before.bin')),
        fs.readFile(path.join(directory, 'manifest.json'), 'utf8')])
      assert.deepEqual(saved, initial)
      assert.equal(JSON.parse(metadata).backup.sha256, sha(initial))
      state.backupCheckedBeforeWrite = true
      Buffer.from(bytes).copy(state.flash, APP)
      // Flash erase may affect unused app-sector tail, which is intentionally
      // outside the protected prefix/factory/storage ranges.
      state.flash[APP + bytes.length + 2] = 0xff
      await options.write?.(state)
      onProgress?.(100)
    },
    async reset() { state.resets++; events.push('reset'); return await options.reset?.(state) ?? { resetConfirmed: true } },
    async close() { state.closes++; events.push('close'); await options.close?.(state) },
  }
  Object.assign(session, options.session)
  const driver = {
    async availability() { events.push('availability'); return { available: true, reason: '' } },
    async listPorts() { events.push('list'); return state.ports },
    async openBootloader(value, { signal }) {
      state.opens++; events.push('open'); assert.equal(value.serialNumber, port.serialNumber)
      await options.open?.(state, signal)
      return session
    },
    ...options.driver,
  }
  const contextController = new AbortController()
  const ctx = { paths: { dataDir }, signal: contextController.signal,
    identity: { userId: 999, profile: 'activation-admin', surface: 'ui' },
    host: { request() { throw new Error('activation host must never be used') } } }
  const updater = createUsbUpdater(ctx, { driver, loadFirmware: async () => firmware, ...options.updater })
  t.after(async () => {
    try { await updater.dispose() } catch (error) {
      if (!options.expectCloseFailure || error.code !== 'USB_CLOSE_UNCONFIRMED') throw error
    } finally { await fs.rm(dataDir, { recursive: true, force: true }) }
  })
  async function select(subject = run()) { const { ports } = await updater.list(subject); assert.equal(ports.length, 1); return ports[0].id }
  async function start(subject = run(), extra = {}) {
    return updater.start({ portId: await select(subject), requestId: randomUUID(), firmwareSha256: firmware.sha256, boardConfirmed: true, ...extra }, subject)
  }
  const settled = (job, subject = run()) => until(() => updater.status({ jobId: job.id }, subject),
    value => ['completed', 'failed', 'cancelled'].includes(value.phase))
  return { updater, ctx, driver, session, firmware, state, initial, events, dataDir, port, select, start, settled, contextController }
}

test('constructor/info do not enumerate or open USB; a private host data directory is required', async t => {
  const f = await fixture(t)
  assert.deepEqual(f.events, [])
  assert.equal((await f.updater.info(run())).available, true)
  assert.deepEqual(f.events, ['availability'])
  const missing = createUsbUpdater({ paths: {}, signal: new AbortController().signal }, { driver: f.driver, loadFirmware: () => f.firmware })
  assert.equal((await missing.info(run())).available, false)
  await assert.rejects(missing.list(run()), error => error.code === 'USB_UNAVAILABLE')
  await missing.dispose()
  assert.equal(f.state.opens, 0)
})

test('every method requires current real UI identity, write permission and a live request', async t => {
  const f = await fixture(t)
  const controller = new AbortController(); controller.abort()
  const invalid = [run(0), run('1'), run(1, ''), run(1, ' '), run(1, 'x\0'), run(1, 'a'.repeat(257)),
    run(1, 'default', { identity: { userId: 1, profile: 'default', surface: 'chat' } }),
    run(1, 'default', { permissions: ['api.read'] }), run(1, 'default', { signal: controller.signal })]
  for (const subject of invalid) {
    await assert.rejects(f.updater.info(subject))
    await assert.rejects(f.updater.list(subject))
    await assert.rejects(f.updater.start({}, subject))
    await assert.rejects(f.updater.status({ jobId: 'x' }, subject))
    await assert.rejects(f.updater.cancel({ jobId: 'x' }, subject))
  }
  assert.equal(f.events.length, 0)
})

test('opaque recent port selection, exact confirmation/hash and closed input schema precede native opening', async t => {
  let time = 1000
  const f = await fixture(t, { updater: { now: () => time } })
  const portId = await f.select()
  assert.match(portId, /^[a-f0-9]{64}$/)
  const good = { portId, requestId: 'intent', firmwareSha256: f.firmware.sha256, boardConfirmed: true }
  for (const value of [{ ...good, boardConfirmed: false }, { ...good, offset: 0 },
    { ...good, firmwareSha256: '0'.repeat(64) }, { ...good, portId: f.port.path }]) {
    await assert.rejects(f.updater.start(value, run()))
  }
  time += 120001
  await assert.rejects(f.updater.start(good, run()), error => error.code === 'USB_PORT_MISSING')
  assert.equal(f.state.opens, 0)
})

test('complete private backup is durable and read back before the only app write; preserved regions match', async t => {
  const f = await fixture(t)
  const job = await f.start(), result = await f.settled(job)
  assert.equal(result.phase, 'completed')
  assert.equal(result.progress, 100)
  for (const name of ['backupSaved', 'applicationVerified', 'preservedRegionsVerified', 'resetConfirmed']) assert.equal(result[name], true)
  assert.equal(result.resultUnknown, false)
  assert.equal(result.canCancel, false)
  assert.equal(f.state.writes, 1); assert.equal(f.state.reads, 2); assert.equal(f.state.closes, 1)
  assert.equal(f.state.resets, 1); assert.equal(f.state.backupCheckedBeforeWrite, true)
  assert.deepEqual(f.state.flash.subarray(0, APP), f.initial.subarray(0, APP))
  assert.deepEqual(f.state.flash.subarray(FACTORY), f.initial.subarray(FACTORY))
  assert.ok(f.events.lastIndexOf('read-2') < f.events.indexOf('reset'))
  assert.ok(f.events.indexOf('reset') < f.events.indexOf('close'))
  const folder = path.join(f.dataDir, 'usb-backups', job.id)
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(folder)).mode & 0o777, 0o700)
    for (const name of ['before.bin', 'manifest.json']) assert.equal((await fs.stat(path.join(folder, name))).mode & 0o777, 0o600)
  }
  const publicData = JSON.stringify(result)
  for (const secret of [f.dataDir, f.session.romMac, f.port.serialNumber, 'before.bin']) assert.ok(!publicData.includes(secret))
  assert.match(result.message, /尚未验收应用启动/)
})

test('partition mismatch saves a private backup but never writes or resets', async t => {
  const f = await fixture(t)
  f.firmware.partitionTable.sha256 = '0'.repeat(64)
  const result = await f.settled(await f.start())
  assert.equal(result.phase, 'failed'); assert.equal(result.errorCode, 'USB_PARTITION_MISMATCH')
  assert.equal(result.backupSaved, true); assert.equal(result.resultUnknown, false)
  assert.equal(f.state.writes, 0); assert.equal(f.state.resets, 0)
  assert.equal((await fs.readFile(path.join(f.dataDir, 'usb-backups', result.id, 'before.bin'))).length, FLASH)
})

test('wrong chip/capacity and malformed ROM identity fail before any backup/write', async t => {
  for (const session of [{ chip: 'ESP32-C3' }, { flashBytes: 0x1000000 }, { flashBytes: 0x400000 }, { romMac: '' }]) {
    const f = await fixture(t, { session })
    const result = await f.settled(await f.start())
    assert.equal(result.phase, 'failed'); assert.equal(result.backupSaved, false)
    assert.equal(f.state.reads, 0); assert.equal(f.state.writes, 0); assert.equal(f.state.resets, 0)
  }
})

test('manager copies and hashes the exact selected image; malformed metadata and changed data cannot write', async t => {
  const f = await fixture(t)
  const portId = await f.select()
  const input = { portId, requestId: 'tamper', firmwareSha256: f.firmware.sha256, boardConfirmed: true }
  f.firmware.bytes[40] ^= 0xff
  await assert.rejects(f.updater.start(input, run()), error => error.code === 'USB_FIRMWARE_INVALID')
  f.firmware.sha256 = sha(f.firmware.bytes)
  f.firmware.partitionTable.offset = 0
  await assert.rejects(f.updater.start({ ...input, firmwareSha256: f.firmware.sha256 }, run()), error => error.code === 'USB_FIRMWARE_INVALID')
  assert.equal(f.state.opens, 0)
})

test('selected loader bytes cannot change the admitted image during asynchronous work', async t => {
  const opening = deferred()
  const f = await fixture(t, { open: () => opening.promise })
  const originalImage = Buffer.from(f.firmware.bytes)
  const job = await f.start()
  f.firmware.bytes[77] ^= 0xff
  opening.resolve()
  const result = await f.settled(job)
  assert.equal(result.phase, 'completed')
  assert.deepEqual(f.state.flash.subarray(APP, APP + originalImage.length), originalImage)
})

test('a selection expiring during catalog loading cannot start a native job', async t => {
  let time = 1000
  const f = await fixture(t, { updater: { now: () => time } })
  const updater = createUsbUpdater(f.ctx, { driver: f.driver, now: () => time, loadFirmware() {
    time += 120001
    return f.firmware
  } })
  t.after(() => updater.dispose())
  const { ports } = await updater.list(run())
  await assert.rejects(updater.start({ portId: ports[0].id, requestId: 'expired-during-read', firmwareSha256: f.firmware.sha256, boardConfirmed: true }, run()), error => error.code === 'USB_PORT_MISSING')
  assert.equal(f.state.opens, 0)
})

test('backup write/sync/readback failure is sanitized and prevents all writes', async t => {
  for (const operation of ['open', 'sync', 'readback']) {
    const injected = { ...fs }
    if (operation === 'open') injected.open = async () => { throw new Error('private backup path token secret') }
    if (operation === 'sync') injected.open = async (...args) => {
      const handle = await fs.open(...args)
      return { writeFile: handle.writeFile.bind(handle), close: handle.close.bind(handle),
        async sync() { throw new Error('private volume secret') } }
    }
    if (operation === 'readback') injected.readFile = async (...args) => {
      const bytes = await fs.readFile(...args)
      if (String(args[0]).endsWith('before.bin')) bytes[0] ^= 0xff
      return bytes
    }
    const f = await fixture(t, { updater: { fs: injected } })
    const result = await f.settled(await f.start())
    assert.equal(result.errorCode, 'USB_BACKUP_FAILED'); assert.equal(result.backupSaved, false)
    assert.equal(f.state.writes, 0); assert.equal(f.state.resets, 0)
    assert.ok(!JSON.stringify(result).includes('secret'))
  }
})

test('backup directory symlink is refused before writing the device', async t => {
  const f = await fixture(t)
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'cardputer-usb-outside-'))
  t.after(() => fs.rm(outside, { recursive: true, force: true }))
  await fs.symlink(outside, path.join(f.dataDir, 'usb-backups'), process.platform === 'win32' ? 'junction' : 'dir')
  const result = await f.settled(await f.start())
  assert.equal(result.errorCode, 'USB_BACKUP_FAILED'); assert.equal(f.state.writes, 0)
  assert.deepEqual(await fs.readdir(outside), [])
})

test('application and each protected range are independently verified before reset', async t => {
  for (const offset of [APP + 100, 0x9000, FACTORY + 123]) {
    const f = await fixture(t, { write(state) { state.flash[offset] ^= 0xff } })
    const result = await f.settled(await f.start())
    assert.equal(result.phase, 'failed'); assert.equal(result.resultUnknown, true)
    assert.equal(result.backupSaved, true); assert.equal(f.state.resets, 0)
    assert.equal(result.applicationVerified, offset !== APP + 100)
    assert.equal(result.errorCode, offset === APP + 100 ? 'USB_VERIFY_FAILED' : 'USB_PRESERVATION_FAILED')
    assert.equal(result.preservedRegionsVerified, false)
  }
})

test('jobs and selections are owner/Profile scoped; identical request IDs never duplicate flash', async t => {
  const blocked = deferred()
  const f = await fixture(t, { open: () => blocked.promise })
  const portId = await f.select()
  const input = { portId, requestId: 'one-intent', firmwareSha256: f.firmware.sha256, boardConfirmed: true }
  const first = await f.updater.start(input, run()), again = await f.updater.start(input, run())
  assert.equal(first.id, again.id)
  assert.equal((await f.updater.info(run())).currentJob.id, first.id)
  assert.ok(!Object.hasOwn(await f.updater.info(run(2)), 'currentJob'))
  for (const other of [run(2), run(1, 'other')]) {
    await assert.rejects(f.updater.status({ jobId: first.id }, other))
    await assert.rejects(f.updater.cancel({ jobId: first.id }, other))
    await assert.rejects(f.updater.start({ ...input, requestId: 'other' }, other), error => error.code === 'USB_PORT_MISSING')
  }
  await assert.rejects(f.updater.start({ ...input, boardConfirmed: true, firmwareSha256: '1'.repeat(64) }, run()), /不同/)
  blocked.resolve()
  const done = await f.settled(first)
  assert.equal(done.phase, 'completed')
  assert.equal((await f.updater.start(input, run())).id, first.id)
  assert.equal(f.state.writes, 1)
})

test('physical lock spans users and separate updater/module instances', async t => {
  const opening = deferred()
  const f = await fixture(t, { open: () => opening.promise })
  const first = await f.start()
  await until(async () => f.state.opens, value => value === 1)
  const { createUsbUpdater: reloadedFactory } = await import(`../lib/usb-updater.mjs?lock-test=${randomUUID()}`)
  const other = reloadedFactory(f.ctx, { driver: f.driver, loadFirmware: () => f.firmware })
  t.after(() => other.dispose())
  const { ports } = await other.list(run(2))
  await assert.rejects(other.start({ portId: ports[0].id, requestId: 'other-owner', firmwareSha256: f.firmware.sha256, boardConfirmed: true }, run(2)), error => error.code === 'USB_BUSY')
  opening.resolve()
  await f.settled(first)
  assert.equal(f.state.writes, 1)
})

test('closing the page signal after job acceptance does not cancel or replay the job', async t => {
  const opening = deferred(), page = new AbortController()
  const f = await fixture(t, { open: () => opening.promise })
  const subject = run(1, 'default', { signal: page.signal })
  const job = await f.start(subject)
  page.abort(); opening.resolve()
  assert.equal((await f.settled(job)).phase, 'completed')
  assert.equal(f.state.writes, 1)
})

test('cancel before write waits for late-open cleanup and never writes or resumes afterwards', async t => {
  const opening = deferred()
  const f = await fixture(t, { open: () => opening.promise })
  const job = await f.start()
  await until(async () => f.state.opens, value => value === 1)
  const cancelling = f.updater.cancel({ jobId: job.id }, run())
  opening.resolve()
  const result = await cancelling
  assert.equal(result.phase, 'cancelled'); assert.equal(result.resultUnknown, false)
  assert.equal(f.state.writes, 0); assert.equal(f.state.resets, 0); assert.equal(f.state.closes, 1)
})

test('user cancellation during writing cannot interrupt I/O or claim cancellation', async t => {
  const writing = deferred(), reached = deferred()
  const f = await fixture(t, { async write() { reached.resolve(); await writing.promise } })
  const job = await f.start(); await reached.promise
  const result = await f.updater.cancel({ jobId: job.id }, run())
  assert.equal(result.phase, 'writing'); assert.equal(result.canCancel, false)
  assert.equal(result.resultUnknown, false); assert.equal(result.backupSaved, true)
  assert.equal(f.state.closes, 0); assert.equal(f.state.resets, 0)
  writing.resolve()
  assert.equal((await f.settled(job)).phase, 'completed')
  assert.equal(f.state.writes, 1); assert.equal(f.state.resets, 1); assert.equal(f.state.closes, 1)
  assert.equal((await fs.readFile(path.join(f.dataDir, 'usb-backups', job.id, 'before.bin'))).length, FLASH)
})

test('forced total deadline during writing reports unknown and retains backup without replay', async t => {
  const writing = deferred(), reached = deferred()
  const f = await fixture(t, { async write() { reached.resolve(); await writing.promise }, updater: { jobTimeoutMs: 500 } })
  const job = await f.start(); await reached.promise
  const result = await f.settled(job)
  assert.equal(result.phase, 'failed'); assert.equal(result.errorCode, 'USB_TIMEOUT')
  assert.equal(result.resultUnknown, true); assert.equal(result.backupSaved, true)
  writing.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.state.writes, 1); assert.equal(f.state.resets, 0); assert.equal(f.state.closes, 1)
})

test('job timeout stops before write and dispose waits for confirmed native close', async t => {
  const closeGate = deferred(), opened = deferred()
  const f = await fixture(t, { read: () => new Promise(() => {}), open() { opened.resolve() },
    close: () => closeGate.promise, updater: { jobTimeoutMs: 20, cleanupTimeoutMs: 1000 } })
  const job = await f.start(); await opened.promise
  await until(async () => f.state.closes, value => value === 1)
  let disposed = false
  const releasing = f.updater.dispose().then(() => { disposed = true })
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(disposed, false)
  closeGate.resolve(); await releasing
  assert.equal(f.state.writes, 0); assert.equal(f.state.resets, 0)
  await assert.rejects(f.updater.info(run()), error => error.code === 'USB_UNAVAILABLE')
  assert.equal(typeof job.id, 'string')
})

test('default total budget is bounded at 90 minutes without truncating the slow-transport allowance', async t => {
  // Only the manager's clock is advanced. The fake open stays pending; the
  // production driver independently enforces its shorter per-operation budgets.
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const opening = deferred(), reached = deferred()
  const f = await fixture(t, { open() { reached.resolve(); return opening.promise } })
  const job = await f.start(); await reached.promise
  t.mock.timers.tick(90 * 60 * 1000 - 1)
  await new Promise(resolve => setImmediate(resolve))
  const active = await f.updater.status({ jobId: job.id }, run())
  assert.equal(active.phase, 'opening'); assert.equal(active.errorCode, '')
  t.mock.timers.tick(1)
  await new Promise(resolve => setImmediate(resolve))
  opening.resolve()
  const result = await f.updater.cancel({ jobId: job.id }, run())
  assert.equal(result.phase, 'failed'); assert.equal(result.errorCode, 'USB_TIMEOUT')
  assert.equal(f.state.writes, 0); assert.equal(f.state.closes, 1)
  const explicit = createUsbUpdater(f.ctx, { driver: f.driver, loadFirmware: () => f.firmware, jobTimeoutMs: 90 * 60 * 1000 })
  await explicit.dispose()
  for (const jobTimeoutMs of [90 * 60 * 1000 + 1, 0, Infinity, 1.5]) {
    assert.throws(() => createUsbUpdater(f.ctx, { driver: f.driver, loadFirmware: () => f.firmware, jobTimeoutMs }), /超出范围/)
  }
})

test('any failed or hanging native close poisons the physical lock across reload and dispose', async t => {
  for (const hangs of [false, true]) {
    const f = await fixture(t, { close: () => hangs ? new Promise(() => {}) : Promise.reject(new Error('private native data')),
      updater: { cleanupTimeoutMs: 20 }, expectCloseFailure: true })
    const job = await f.start(), result = await f.settled(job)
    assert.equal(result.phase, 'failed'); assert.equal(result.errorCode, 'USB_CLOSE_UNCONFIRMED')
    assert.equal(result.resultUnknown, true); assert.ok(!result.message.includes('private'))
    await assert.rejects(f.updater.dispose(), error => error.code === 'USB_CLOSE_UNCONFIRMED')
    const { createUsbUpdater: reloadedFactory } = await import(`../lib/usb-updater.mjs?poison-test=${randomUUID()}`)
    const other = reloadedFactory(f.ctx, { driver: f.driver, loadFirmware: () => f.firmware })
    t.after(() => other.dispose())
    const { ports } = await other.list(run())
    await assert.rejects(other.start({ portId: ports[0].id, requestId: 'never-reuse-unconfirmed', firmwareSha256: f.firmware.sha256, boardConfirmed: true }, run()), error => error.code === 'USB_BUSY')
  }
})

test('late-open timeout remains locked until process restart even if its eventual close succeeds', async t => {
  const opening = deferred()
  const f = await fixture(t, { open: () => opening.promise,
    updater: { jobTimeoutMs: 15, cleanupTimeoutMs: 15 }, expectCloseFailure: true })
  const job = await f.start(), result = await f.settled(job)
  assert.equal(result.errorCode, 'USB_CLOSE_UNCONFIRMED')
  assert.equal(f.state.writes, 0)
  opening.resolve()
  await until(async () => f.state.closes, value => value === 1)
  const another = createUsbUpdater(f.ctx, { driver: f.driver, loadFirmware: () => f.firmware })
  t.after(() => another.dispose())
  const { ports } = await another.list(run())
  await assert.rejects(another.start({ portId: ports[0].id, requestId: 'late-open-lock', firmwareSha256: f.firmware.sha256, boardConfirmed: true }, run()), error => error.code === 'USB_BUSY')
})

test('cancel during final native cleanup preserves the already verified result and waits for release', async t => {
  const closing = deferred()
  const f = await fixture(t, { close: () => closing.promise })
  const job = await f.start()
  await until(async () => f.state.closes, value => value === 1)
  const status = await f.updater.status({ jobId: job.id }, run())
  assert.equal(status.canCancel, false)
  const cancelled = f.updater.cancel({ jobId: job.id }, run())
  assert.equal((await cancelled).phase, 'restarting')
  assert.equal(f.state.closes, 1)
  closing.resolve()
  assert.equal((await f.settled(job)).phase, 'completed')
  assert.equal(f.state.writes, 1)
})

test('remount info returns the latest retained terminal result; normal terminal results expire after 20 minutes', async t => {
  let time = 1000
  const f = await fixture(t, { updater: { now: () => time } })
  const job = await f.start(), result = await f.settled(job)
  assert.equal(result.phase, 'completed')
  assert.deepEqual((await f.updater.info(run())).currentJob, result)
  assert.ok(!Object.hasOwn(await f.updater.info(run(2)), 'currentJob'))
  time += 20 * 60 * 1000 + 1
  assert.ok(!Object.hasOwn(await f.updater.info(run()), 'currentJob'))
})

test('unknown terminal remains visible, invalidates old selection and requires a newly confirmed intent', async t => {
  let time = 1000
  const f = await fixture(t, { write(state) { state.flash[APP + 10] ^= 0xff }, updater: { now: () => time } })
  const portId = await f.select()
  const input = { portId, requestId: 'unknown-original', firmwareSha256: f.firmware.sha256, boardConfirmed: true }
  const job = await f.updater.start(input, run()), result = await f.settled(job)
  assert.equal(result.resultUnknown, true)
  assert.deepEqual((await f.updater.info(run())).currentJob, result)
  assert.equal((await f.updater.start(input, run())).id, job.id)
  await assert.rejects(f.updater.start({ ...input, requestId: 'old-selection-new-intent' }, run()), error => error.code === 'USB_PORT_MISSING')
  time += 20 * 60 * 1000 + 1
  assert.deepEqual((await f.updater.info(run())).currentJob, result)
  const freshPort = await f.select()
  const newer = await f.updater.start({ ...input, portId: freshPort, requestId: 'freshly-confirmed-intent' }, run())
  assert.notEqual(newer.id, job.id)
  const resumed = (await f.updater.info(run())).currentJob
  assert.equal(resumed.id, newer.id)
  await f.updater.cancel({ jobId: newer.id }, run())
  assert.equal(f.state.writes, 1)
})

test('device replacement is rejected both after selection and immediately before writing', async t => {
  const selected = await fixture(t)
  const portId = await selected.select()
  selected.state.ports = [{ ...selected.port, serialNumber: 'replacement' }]
  await assert.rejects(selected.updater.start({ portId, requestId: 'replaced', firmwareSha256: selected.firmware.sha256, boardConfirmed: true }, run()), error => error.code === 'USB_PORT_CHANGED')
  assert.equal(selected.state.opens, 0)
  const beforeWrite = await fixture(t, { identity(state) { if (state.identities === 2) throw Object.assign(new Error('private ROM data'), { code: 'USB_DEVICE_CHANGED' }) } })
  const result = await beforeWrite.settled(await beforeWrite.start())
  assert.equal(result.errorCode, 'USB_DEVICE_CHANGED'); assert.equal(result.backupSaved, true)
  assert.equal(beforeWrite.state.writes, 0); assert.equal(beforeWrite.state.resets, 0)
})

test('driver open failures retain only fixed public codes and release a confirmed-closed physical lock', async t => {
  for (const code of ['USB_IDENTITY_UNAVAILABLE', 'USB_IDENTITY_CHANGED', 'USB_ROM_IDENTITY', 'USB_INVALID_RANGE', 'USB_SECURITY_UNSUPPORTED']) {
    let failed = false
    const f = await fixture(t, { open() {
      if (!failed) { failed = true; throw Object.assign(new Error('private ROM MAC / private path / credentials'), { code }) }
    } })
    const result = await f.settled(await f.start())
    assert.equal(result.errorCode, code)
    assert.equal(result.phase, 'failed'); assert.equal(result.resultUnknown, false)
    assert.equal(f.state.writes, 0); assert.ok(!JSON.stringify(result).includes('private'))
    // The driver guarantees a rejected open is closed unless it reports the
    // explicit USB_CLOSE_UNCONFIRMED code. A new explicit intent may retry.
    assert.equal((await f.settled(await f.start())).phase, 'completed')
    assert.equal(f.state.writes, 1)
  }
})

test('a reset without confirmation never claims complete application startup', async t => {
  const f = await fixture(t, { reset: () => ({ resetConfirmed: false }) })
  const result = await f.settled(await f.start())
  assert.equal(result.phase, 'failed'); assert.equal(result.errorCode, 'USB_RESET_UNCONFIRMED')
  assert.equal(result.applicationVerified, true); assert.equal(result.preservedRegionsVerified, true)
  assert.equal(result.resetConfirmed, false); assert.equal(result.resultUnknown, true)
})
