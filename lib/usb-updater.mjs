import { createHash, randomUUID } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import path from 'node:path'
import { validateModel } from '../sdk/harness/contracts.mjs'
import { contract } from './contracts.mjs'

const FLASH_BYTES = 0x800000
const APPLICATION_OFFSET = 0x10000
const FACTORY_OFFSET = 0x340000
const PARTITION_OFFSET = 0x8000
const PARTITION_BYTES = 3072
const SELECTION_TTL = 120000
const RECORD_TTL = 20 * 60 * 1000
// Shared by every updater instance in this Node process, including different
// Studio users. A failed native close deliberately leaves its lock poisoned.
const lockSymbol = Symbol.for('ekko.cardputer-adv.usb-locks.v1')
if (globalThis[lockSymbol] === undefined) Object.defineProperty(globalThis, lockSymbol, { value: new Map() })
const physicalLocks = globalThis[lockSymbol]
if (!(physicalLocks instanceof Map)) throw new Error('USB 全局锁注册表无效')
const messages = Object.freeze({
  USB_CANCELLED: 'USB 更新已取消；已经写入的内容不保证回滚。',
  USB_TIMEOUT: 'USB 更新超时；请先核对设备状态，不会自动重刷。',
  USB_UPDATE_FAILED: 'USB 更新未完成；请核对设备状态后明确重试。',
  USB_UNAVAILABLE: 'USB 更新组件不可用，请检查插件依赖与服务主机。',
  USB_BUSY: '此 USB 设备已有操作，或上次原生关闭未确认；未开始新写入。',
  USB_PORT_CHANGED: '选中的 USB 设备已变化，请重新扫描并确认。',
  USB_PORT_MISSING: '请先扫描并选择真实 USB 设备；选择有效期为两分钟。',
  USB_IDENTITY_MISSING: 'USB 设备缺少可核对的序列号或物理位置，未开始更新。',
  USB_IDENTITY_UNAVAILABLE: 'USB 设备缺少可核对的稳定身份，未开始更新。',
  USB_IDENTITY_CHANGED: 'USB 设备身份已变化，已停止后续操作。',
  USB_ROM_IDENTITY: '无法核对同一芯片的 ROM 身份，已停止后续操作。',
  USB_DEVICE_CHANGED: 'USB 设备身份已变化，已停止后续操作。',
  USB_CHIP_MISMATCH: '目标不是所需 ESP32-S3 芯片，未写入固件。',
  USB_FLASH_SIZE: '目标必须具有精确的 8MiB Flash，未写入固件。',
  USB_SECURITY_UNSUPPORTED: '无法确认设备安全状态，或设备启用了安全启动／Flash加密；未写入此无签名应用。',
  USB_FIRMWARE_INVALID: '随包应用镜像或摘要无效，未写入固件。',
  USB_PARTITION_MISMATCH: '原机分区布局不兼容；已保留私有备份，没有写入应用。',
  USB_BACKUP_FAILED: '私有备份未能持久保存并核对，没有写入应用。',
  USB_VERIFY_FAILED: '应用写入校验失败；已保留私有备份，没有请求重启。',
  USB_PRESERVATION_FAILED: '原厂或设置区域核对失败；已保留私有备份，没有请求重启。',
  USB_RESET_UNCONFIRMED: '应用与保留区域已校验，但未确认重启；请检查设备。',
  USB_CLOSE_UNCONFIRMED: '无法确认原生串口已关闭；此设备的后续更新已锁定。',
  USB_IO: 'USB 通信失败；已停止后续步骤，不会自动重刷。',
  USB_CLOSED: 'USB 连接已断开；请核对设备状态。',
  USB_PROTOCOL: 'USB 返回格式或长度不符合预期，已停止更新。',
  USB_INVALID_RANGE: 'USB 读写范围不符合 Cardputer 应用更新要求，已停止操作。',
  USB_DEPENDENCY_UNAVAILABLE: 'USB 原生组件不可用，请检查插件依赖和系统支持。',
})

function failure(code) {
  const safe = Object.hasOwn(messages, code) ? code : 'USB_UPDATE_FAILED'
  return Object.assign(new Error(messages[safe]), { code: safe })
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const terminal = job => ['completed', 'failed', 'cancelled'].includes(job.phase)
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 160)
const vendor = value => String(value ?? '').replace(/^0x/iu, '').toLowerCase()
function serial(value) {
  const text = String(value ?? '').trim()
  const mac = text.replace(/[:-]/gu, '')
  return /^[a-f0-9]{12}$/iu.test(mac) ? mac.toLowerCase() : text
}
function physicalKey(port) {
  if (port.serialNumber) return JSON.stringify(['serial', vendor(port.vendorId), serial(port.serialNumber)])
  if (port.locationId) return JSON.stringify(['location', String(port.locationId)])
  throw failure('USB_IDENTITY_MISSING')
}
function fingerprint(port) {
  return digest(Buffer.from(JSON.stringify([port.path, vendor(port.vendorId), vendor(port.productId),
    serial(port.serialNumber), port.locationId ?? ''])))
}
function sameDevice(original, candidate) {
  if (!candidate || original.path !== candidate.path || vendor(original.vendorId) !== vendor(candidate.vendorId)) return false
  if (original.serialNumber) return !!candidate.serialNumber && serial(original.serialNumber) === serial(candidate.serialNumber)
  return !!original.locationId && original.locationId === candidate.locationId
}
function validPort(port) {
  return port && typeof port.path === 'string' && port.path.length > 0 && port.path.length <= 1024 &&
    !/[\u0000-\u001f\u007f]/u.test(port.path) &&
    ['303a', '10c4', '1a86', '0403'].includes(vendor(port.vendorId)) &&
    ['serialNumber', 'locationId'].every(key => port[key] === undefined ||
      typeof port[key] === 'string' && port[key].length <= 256 && !/[\u0000-\u001f\u007f]/u.test(port[key]))
}
function privatePort(port) {
  return Object.fromEntries(['path', 'vendorId', 'productId', 'serialNumber', 'locationId', 'manufacturer']
    .filter(key => port[key] !== undefined).map(key => [key, port[key]]))
}
function cancelled(signal) {
  if (signal.aborted) throw failure(signal.reason?.code === 'USB_TIMEOUT' ? 'USB_TIMEOUT' : 'USB_CANCELLED')
}
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(failure(signal.reason?.code === 'USB_TIMEOUT' ? 'USB_TIMEOUT' : 'USB_CANCELLED'))
    if (signal.aborted) { Promise.resolve(promise).catch(() => {}); abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
function deadline(promise, milliseconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(failure('USB_CLOSE_UNCONFIRMED')), milliseconds)
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
function positiveOption(value, fallback, maximum, name) {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new RangeError(`${name} 超出范围`)
  return value
}
function checkedFirmware(value, expectedSha) {
  if (!value || typeof value.version !== 'string' || !value.version || value.version.length > 160 ||
      !/^[a-f0-9]{64}$/u.test(value.sha256 ?? '') || value.sha256 !== expectedSha ||
      !(value.bytes instanceof Uint8Array) || value.bytes.length < 24 ||
      value.bytes.length > FACTORY_OFFSET - APPLICATION_OFFSET ||
      value.bytes[0] !== 0xe9 || value.bytes[1] < 1 || value.bytes[1] > 16 ||
      value.bytes[12] !== 9 || value.bytes[13] !== 0 || value.bytes[3] >> 4 !== 3 ||
      value.partitionTable?.offset !== PARTITION_OFFSET || value.partitionTable?.bytes !== PARTITION_BYTES ||
      !/^[a-f0-9]{64}$/u.test(value.partitionTable?.sha256 ?? '')) throw failure('USB_FIRMWARE_INVALID')
  // Own the bytes across all asynchronous work; the loader's Buffer may be reused.
  const bytes = Buffer.from(value.bytes)
  if (digest(bytes) !== value.sha256) throw failure('USB_FIRMWARE_INVALID')
  return { version: value.version, sha256: value.sha256, bytes, partitionSha256: value.partitionTable.sha256 }
}
function checkedFlash(value) {
  if (!(value instanceof Uint8Array) || value.length !== FLASH_BYTES) throw failure('USB_PROTOCOL')
  return Buffer.from(value)
}

/** Cardputer-only update jobs. The UI cannot supply a file, path, offset or URL. */
export function createUsbUpdater(ctx, options = {}) {
  const { driver, loadFirmware } = options
  const fs = options.fs ?? nodeFs
  const now = options.now ?? Date.now
  // Bounded for the conservative 115200 transport: each complete 8MiB read
  // allows 30 minutes (before + after), app writing allows 15 minutes, and the
  // remaining 15 minutes cover ROM handshake, identity checks, private backup
  // fsync/readback and reset. Each driver step retains its own shorter deadline.
  const jobTimeoutMs = positiveOption(options.jobTimeoutMs, 90 * 60 * 1000, 90 * 60 * 1000, 'jobTimeoutMs')
  const cleanupTimeoutMs = positiveOption(options.cleanupTimeoutMs, 30000, 60000, 'cleanupTimeoutMs')
  const jobs = new Map(), requests = new Map(), selections = new Map()
  let disposed = false, disposePromise

  function owner(run) {
    if (disposed || ctx.signal?.aborted) throw failure('USB_UNAVAILABLE')
    const id = run?.identity
    if (!id || !Number.isSafeInteger(id.userId) || id.userId < 1 || typeof id.profile !== 'string' ||
        !id.profile.trim() || id.profile.length > 256 || /[\u0000-\u001f\u007f]/u.test(id.profile)) {
      throw new Error('需要有效的当前调用用户与 Profile')
    }
    if (id.surface !== 'ui' || !Array.isArray(run.permissions) || !run.permissions.includes('api.write')) {
      throw new Error('USB 更新只允许有写权限的真实用户界面明确操作')
    }
    if (!run.signal || typeof run.signal.aborted !== 'boolean') throw new Error('调用缺少取消信号')
    cancelled(run.signal)
    return JSON.stringify([id.userId, id.profile])
  }
  function snapshot(job) {
    return validateModel(contract, 'usbJob', Object.fromEntries(['id', 'phase', 'progress', 'message',
      'createdAt', 'updatedAt', 'backupSaved', 'applicationVerified', 'preservedRegionsVerified',
      'resetConfirmed', 'resultUnknown', 'errorCode'].map(key => [key, job[key]]).concat([
      ['canCancel', !terminal(job) && !job.writeStarted && !job.operationsComplete],
    ])))
  }
  function prune() {
    const time = now()
    for (const [id, job] of jobs) {
      // An uncertain write must not disappear merely because the user left the
      // page or waited. Only a newly confirmed intent may supersede that warning.
      if (terminal(job) && (!job.resultUnknown || job.unknownAcknowledged) && time - job.updatedAt > RECORD_TTL) jobs.delete(id)
    }
    for (const [key, id] of requests) if (!jobs.has(id)) requests.delete(key)
    for (const [key, selection] of selections) if (time - selection.at > SELECTION_TTL) selections.delete(key)
  }
  function update(job, phase, progress, message) {
    cancelled(job.controller.signal)
    Object.assign(job, { phase, progress: Math.max(job.progress, Math.min(99, Math.round(progress))), message, updatedAt: now() })
  }
  function progress(job, phase, from, to, message) {
    return value => {
      cancelled(job.controller.signal)
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) {
        update(job, phase, from + (to - from) * value / 100, message)
      }
    }
  }
  async function availability(signal) {
    if (!driver || typeof loadFirmware !== 'function') return { available: false, reason: messages.USB_UNAVAILABLE }
    if (typeof ctx.paths?.dataDir !== 'string' || !path.isAbsolute(ctx.paths.dataDir) || ctx.paths.dataDir.includes('\0')) {
      return { available: false, reason: '宿主未提供可用于私有备份的数据目录；没有开始更新。' }
    }
    try {
      const value = await abortable(Promise.resolve().then(() => driver.availability({ signal })), signal)
      cancelled(signal)
      if (!value || typeof value.available !== 'boolean' || typeof value.reason !== 'string') throw failure('USB_UNAVAILABLE')
      return { available: value.available, reason: value.available ? '' : messages.USB_UNAVAILABLE }
    } catch (error) {
      cancelled(signal)
      return { available: false, reason: messages.USB_UNAVAILABLE }
    }
  }
  async function info(run) {
    const who = owner(run); prune()
    const state = await availability(run.signal)
    owner(run)
    const owned = [...jobs.values()].filter(job => job.owner === who)
    // This owner can have only one active job, so insertion order also gives
    // terminal order without relying on a wall clock that may be corrected.
    const currentJob = owned.find(job => !terminal(job)) ?? owned[owned.length - 1]
    return validateModel(contract, 'usbInfo', { ...state, hostPlatform: `${process.platform} ${process.arch} / Node ${process.version}`,
      ...(currentJob ? { currentJob: snapshot(currentJob) } : {}) })
  }
  async function enumerate(signal) {
    const ports = await abortable(Promise.resolve().then(() => driver.listPorts({ signal })), signal)
    cancelled(signal)
    if (!Array.isArray(ports)) throw failure('USB_PROTOCOL')
    return ports.filter(validPort)
  }
  async function list(run) {
    const who = owner(run); prune()
    if (!(await availability(run.signal)).available) throw failure('USB_UNAVAILABLE')
    const entries = new Map()
    for (const port of await enumerate(run.signal)) {
      const id = fingerprint(port)
      if (entries.has(id)) throw failure('USB_PROTOCOL')
      entries.set(id, privatePort(port))
      if (entries.size >= 32) break
    }
    owner(run)
    selections.set(who, { at: now(), entries })
    return validateModel(contract, 'usbPorts', { ports: [...entries].map(([id, port], index) => ({
      // A native USB path/serial may embed the ROM MAC. Keep those only in the
      // private selection cache; the page receives a label and an opaque ID.
      id, label: `${clean(port.manufacturer) || 'USB 设备'} · ${vendor(port.vendorId)}:${vendor(port.productId)} · ${index + 1}`.slice(0, 240),
      vendorId: vendor(port.vendorId).slice(0, 8), productId: vendor(port.productId).slice(0, 8),
    })) })
  }
  async function writeDurable(file, bytes) {
    const handle = await fs.open(file, 'wx', 0o600)
    try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
  }
  async function syncDirectory(directory) {
    const handle = await fs.open(directory, 'r')
    try { await handle.sync() } finally { await handle.close() }
  }
  async function saveBackup(job, before, session, firmware) {
    try {
      const root = ctx.paths?.dataDir
      if (typeof root !== 'string' || !path.isAbsolute(root)) throw failure('USB_BACKUP_FAILED')
      await fs.mkdir(root, { recursive: true, mode: 0o700 })
      const backups = path.join(root, 'usb-backups')
      try { await fs.mkdir(backups, { mode: 0o700 }) } catch (error) { if (error?.code !== 'EEXIST') throw error }
      const folder = await fs.lstat(backups)
      if (!folder.isDirectory() || folder.isSymbolicLink()) throw failure('USB_BACKUP_FAILED')
      await fs.chmod(backups, 0o700)
      const directory = path.join(backups, job.id)
      await fs.mkdir(directory, { mode: 0o700 })
      const backupFile = path.join(directory, 'before.bin'), manifestFile = path.join(directory, 'manifest.json')
      const checksum = digest(before)
      const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, jobId: job.id, createdAt: job.createdAt,
        board: 'M5Stack Cardputer-Adv', chip: session.chip, flashBytes: FLASH_BYTES, romMac: session.romMac,
        backup: { file: 'before.bin', bytes: before.length, sha256: checksum },
        target: { version: firmware.version, offset: APPLICATION_OFFSET, bytes: firmware.bytes.length, sha256: firmware.sha256 },
        partitionTable: { offset: PARTITION_OFFSET, bytes: PARTITION_BYTES, sha256: digest(before.subarray(PARTITION_OFFSET, PARTITION_OFFSET + PARTITION_BYTES)) },
      }, null, 2) + '\n')
      await writeDurable(backupFile, before)
      await writeDurable(manifestFile, manifest)
      // Sync the containing directory as well as the two private files. A
      // filesystem unable to provide this guarantee is rejected before writing.
      await syncDirectory(directory)
      await syncDirectory(backups)
      await syncDirectory(root)
      const [readback, metadata] = await Promise.all([fs.readFile(backupFile), fs.readFile(manifestFile)])
      if (readback.length !== FLASH_BYTES || digest(readback) !== checksum || !Buffer.from(metadata).equals(manifest)) {
        throw failure('USB_BACKUP_FAILED')
      }
      cancelled(job.controller.signal)
      job.backupSaved = true
    } catch (error) {
      cancelled(job.controller.signal)
      throw failure('USB_BACKUP_FAILED')
    }
  }
  async function assertSession(session, signal) {
    cancelled(signal)
    if (await session.assertIdentity() === false) throw failure('USB_DEVICE_CHANGED')
    cancelled(signal)
  }
  async function execute(job) {
    let session, opening, openingFailure, work, outcome
    const signal = job.controller.signal
    const timer = setTimeout(() => job.controller.abort(failure('USB_TIMEOUT')), jobTimeoutMs)
    try {
      work = (async () => {
        update(job, 'opening', 2, '正在打开已选 USB 设备；没有写入应用。')
        const current = await enumerate(signal)
        if (current.filter(port => sameDevice(job.port, port)).length !== 1) throw failure('USB_PORT_CHANGED')
        cancelled(signal)
        opening = Promise.resolve().then(() => driver.openBootloader(job.port, { signal })).then(value => {
          session = value
          return value
        }, error => { openingFailure = error; throw error })
        session = await opening
        cancelled(signal)
        update(job, 'checking', 5, '正在核对 ESP32-S3 与精确 8MiB Flash。')
        if (session?.chip !== 'ESP32-S3') throw failure('USB_CHIP_MISMATCH')
        if (session.flashBytes !== FLASH_BYTES) throw failure('USB_FLASH_SIZE')
        if (typeof session.romMac !== 'string' || !/^(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}$|^[a-f0-9]{12}$/iu.test(session.romMac)) throw failure('USB_DEVICE_CHANGED')
        await assertSession(session, signal)
        update(job, 'backing-up', 8, '正在完整读取 8MiB Flash 并保存私有备份。')
        const before = checkedFlash(await session.readFlash(0, FLASH_BYTES, {
          onProgress: progress(job, 'backing-up', 8, 28, '正在读取完整 Flash；尚未写入应用。'),
        }))
        cancelled(signal)
        await saveBackup(job, before, session, job.firmware)
        update(job, 'checking', 40, '私有备份已保存并核对，正在检查现机分区布局。')
        if (digest(before.subarray(PARTITION_OFFSET, PARTITION_OFFSET + PARTITION_BYTES)) !== job.firmware.partitionSha256) {
          throw failure('USB_PARTITION_MISMATCH')
        }
        await assertSession(session, signal)
        update(job, 'writing', 43, '正在仅更新 0x10000 的 Ekko 应用；请保持 USB 连接。')
        job.writeStarted = true
        await session.writeApplication(job.firmware.bytes, { onProgress: progress(job, 'writing', 43, 72, '正在写入 Ekko 应用；不会自动重刷。') })
        cancelled(signal)
        await assertSession(session, signal)
        update(job, 'verifying', 75, '正在完整读回，核对应用与原厂、设置和存储区域。')
        const after = checkedFlash(await session.readFlash(0, FLASH_BYTES, {
          onProgress: progress(job, 'verifying', 75, 95, '正在完整读回并核对保留区域。'),
        }))
        cancelled(signal)
        if (!after.subarray(APPLICATION_OFFSET, APPLICATION_OFFSET + job.firmware.bytes.length).equals(job.firmware.bytes)) throw failure('USB_VERIFY_FAILED')
        job.applicationVerified = true
        if (!after.subarray(0, APPLICATION_OFFSET).equals(before.subarray(0, APPLICATION_OFFSET)) ||
            !after.subarray(FACTORY_OFFSET).equals(before.subarray(FACTORY_OFFSET))) throw failure('USB_PRESERVATION_FAILED')
        job.preservedRegionsVerified = true
        await assertSession(session, signal)
        update(job, 'restarting', 97, '应用和保留区域已校验，正在请求设备重启。')
        job.resetStarted = true
        const result = await session.reset()
        cancelled(signal)
        if (result?.resetConfirmed !== true) throw failure('USB_RESET_UNCONFIRMED')
        job.resetConfirmed = true
      })()
      await abortable(work, signal)
      job.operationsComplete = true
      outcome = { phase: 'completed', progress: 100, errorCode: '', resultUnknown: false,
        message: '应用写入及保留区域校验完成，重启已请求；尚未验收应用启动或语音。' }
    } catch (error) {
      const code = signal.aborted ? signal.reason?.code === 'USB_TIMEOUT' ? 'USB_TIMEOUT' : 'USB_CANCELLED' : failure(error?.code).code
      outcome = { phase: code === 'USB_CANCELLED' ? 'cancelled' : 'failed', errorCode: code,
        resultUnknown: job.writeStarted || job.resetStarted || error?.resultUnknown === true,
        message: messages[code] }
      job.controller.abort(failure(code))
    } finally {
      clearTimeout(timer)
      // If cancellation won an in-flight open, wait for the handle and release it
      // too. A late handle is never allowed to escape after the lock is released.
      let released = true
      try {
        if (!session && opening) {
          try { session = await deadline(opening, cleanupTimeoutMs) }
          catch (error) {
            // A driver open rejection guarantees native cleanup, except for its
            // explicit close-unknown error. A still-pending open cannot do so.
            if (!openingFailure || openingFailure.code === 'USB_CLOSE_UNCONFIRMED') throw error
          }
        }
        if (session) await deadline(Promise.resolve().then(() => session.close()), cleanupTimeoutMs)
      } catch {
        released = false
        outcome = { phase: 'failed', errorCode: 'USB_CLOSE_UNCONFIRMED', resultUnknown: true, message: messages.USB_CLOSE_UNCONFIRMED }
        // An open may finish even later; attempt native release without ever
        // granting new write access to this physical key in the current process.
        if (!session && opening) void opening.then(late => late.close()).catch(() => {})
      }
      if (released && physicalLocks.get(job.physicalKey) === job.id) physicalLocks.delete(job.physicalKey)
      else if (!released) physicalLocks.set(job.physicalKey, 'unconfirmed-close')
      job.firmware = null
      Object.assign(job, outcome, { updatedAt: now() })
      if (job.resultUnknown) selections.delete(job.owner)
    }
  }
  async function start(input, run) {
    const who = owner(run); validateModel(contract, 'usbStartInput', input); prune()
    if (input.boardConfirmed !== true || !/^[a-f0-9]{64}$/u.test(input.firmwareSha256)) throw failure('USB_FIRMWARE_INVALID')
    const requestKey = JSON.stringify([who, input.requestId])
    const intent = digest(Buffer.from(JSON.stringify([input.portId, input.firmwareSha256, input.boardConfirmed])))
    function previous() {
      const existing = jobs.get(requests.get(requestKey))
      if (!existing) return null
      if (existing.intent !== intent) throw new Error('同一请求标识已经用于不同的更新内容')
      return snapshot(existing)
    }
    const prior = previous(); if (prior) return prior
    const selected = selections.get(who)
    const port = selected && now() - selected.at <= SELECTION_TTL ? selected.entries.get(input.portId) : undefined
    if (!port) throw failure('USB_PORT_MISSING')
    const key = physicalKey(port)
    if (physicalLocks.has(key)) throw failure('USB_BUSY')
    if (!(await availability(run.signal)).available) throw failure('USB_UNAVAILABLE')
    const firmware = checkedFirmware(await abortable(Promise.resolve().then(() => loadFirmware()), run.signal), input.firmwareSha256)
    const current = await enumerate(run.signal)
    if (current.filter(candidate => sameDevice(port, candidate)).length !== 1) throw failure('USB_PORT_CHANGED')
    owner(run)
    if (now() - selected.at > SELECTION_TTL) throw failure('USB_PORT_MISSING')
    const raced = previous(); if (raced) return raced
    if (physicalLocks.has(key) || [...jobs.values()].some(job => job.owner === who && !terminal(job)) || jobs.size >= 64) throw failure('USB_BUSY')
    const time = now()
    const job = { id: randomUUID(), owner: who, physicalKey: key, port, firmware, intent,
      phase: 'queued', progress: 0, message: '更新已受理；先备份与核对布局，尚未写入。',
      createdAt: time, updatedAt: time, backupSaved: false, applicationVerified: false,
      preservedRegionsVerified: false, resetConfirmed: false, resultUnknown: false, errorCode: '',
      writeStarted: false, resetStarted: false, controller: new AbortController(), task: null }
    physicalLocks.set(key, job.id)
    for (const previousJob of jobs.values()) if (previousJob.owner === who && terminal(previousJob) && previousJob.resultUnknown) previousJob.unknownAcknowledged = true
    jobs.set(job.id, job); requests.set(requestKey, job.id)
    // No completed RunContext, caller API, credentials or page signal is retained.
    job.task = Promise.resolve().then(() => execute(job))
    return snapshot(job)
  }
  function ownJob(input, run) {
    const who = owner(run); validateModel(contract, 'usbJobInput', input); prune()
    const job = jobs.get(input.jobId)
    if (!job || job.owner !== who) throw new Error('找不到当前账号和 Profile 的 USB 更新作业')
    return job
  }
  async function status(input, run) { return snapshot(ownJob(input, run)) }
  async function cancel(input, run) {
    const job = ownJob(input, run)
    // After write admission, stopping the native stream can leave a partial
    // image. The user-facing cancel button/RPC is therefore safe-stage only.
    // Root disposal and the total operation deadline still forcibly interrupt.
    if (job.writeStarted || job.operationsComplete || terminal(job)) return snapshot(job)
    job.controller.abort(failure('USB_CANCELLED'))
    // Await cleanup before saying the operation has stopped. Already-sent writes
    // cannot be rolled back by this request.
    await job.task
    return snapshot(job)
  }
  function dispose() {
    if (disposePromise) return disposePromise
    disposed = true
    ctx.signal?.removeEventListener('abort', onAbort)
    for (const job of jobs.values()) if (!terminal(job)) job.controller.abort(failure('USB_CANCELLED'))
    disposePromise = Promise.allSettled([...jobs.values()].map(job => job.task)).then(() => {
      const unconfirmed = [...jobs.values()].some(job => job.errorCode === 'USB_CLOSE_UNCONFIRMED')
      selections.clear(); requests.clear(); jobs.clear()
      if (unconfirmed) throw failure('USB_CLOSE_UNCONFIRMED')
    })
    return disposePromise
  }
  function onAbort() { void dispose().catch(() => {}) }
  ctx.signal?.addEventListener('abort', onAbort, { once: true })
  if (ctx.signal?.aborted) onAbort()
  return { info, list, start, status, cancel, dispose }
}
