// Native adapter adapted from the user's StackChan public src/usb-serial.mjs,
// UNLICENSED at commit feb63b0c2e13e2a37327b454c3f6f1a8e458345a;
// adapted for the same author under the user's instructions for this project.
// ESP protocol remains upstream espressif/esptool-js0.7.1 (Apache-2.0).
// This module has no Pulse pairing, filesystem backup, logging or background scan.
import { createHash } from 'node:crypto'
import { ReadableStream, WritableStream } from 'node:stream/web'
import { usbError, UsbSerialError } from './usb-errors.mjs'
import { normalizePortInfo, hasStrongUsbIdentity, sameUsbDevice, normalizeRomMac, assertUnprotectedSecurity } from './usb-identity.mjs'
export { UsbSerialError }

const FLASH_BYTES = 0x800000
const APP_OFFSET = 0x10000
const APP_BYTES = 0x330000
const READ_CHUNK = 0x10000
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const checkSignal = signal => { if (signal?.aborted) throw usbError('USB_CANCELLED') }
const validPort = port => { if (!hasStrongUsbIdentity(normalizePortInfo(port))) throw usbError('USB_IDENTITY_UNAVAILABLE') }

function bounded(work, { signal, timeoutMs = 10000, onStop } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false, timer
    const finish = (error, value) => {
      if (settled) return
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort)
      if (error) reject(error); else resolve(value)
    }
    const stop = code => {
      const error = usbError(code)
      try { onStop?.(error) } catch { /* Never disclose native cleanup failures. */ }
      finish(error)
    }
    const onAbort = () => stop('USB_CANCELLED')
    if (signal?.aborted) { onAbort(); return }
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => stop('USB_TIMEOUT'), timeoutMs)
    Promise.resolve().then(() => { checkSignal(signal); return work() }).then(value => {
      if (signal?.aborted) onAbort(); else finish(null, value)
    }, error => finish(usbError(error?.code)))
  })
}

/** Owns one native handle. Reopening creates fresh streams and a fresh handle. */
class NodeSerialDevice {
  constructor(info, dependencies, options, signal, webMode = false) {
    validPort(info)
    this.info = { ...info }
    this.dependencies = dependencies
    this.options = options
    this.signal = signal
    this.webMode = webMode
    this.port = null
    this.readable = null
    this.writable = null
    this.permanentlyClosed = false
    this.failure = null
    this.flags = { dtr: false, rts: false, brk: false }
    this.onAbort = () => this.fail('USB_CANCELLED')
    signal?.addEventListener('abort', this.onAbort, { once: true })
  }

  assertOpen() {
    checkSignal(this.signal)
    if (this.failure) throw usbError(this.failure)
    if (this.permanentlyClosed || this.closing || !this.port?.isOpen) throw usbError('USB_CLOSED')
  }

  fail(code = 'USB_IO') {
    if (this.failure) return
    this.failure = code
    this.permanentlyClosed = true
    try { this.readController?.error(usbError(code)) } catch { /* Already cancelled or closed. */ }
    try { this.writeController?.error(usbError(code)) } catch { /* Already cancelled or closed. */ }
    this.onFailure?.(usbError(code))
    // SerialPortStream.destroy() does not close its native BindingPort.
    // Start explicit native release even when cancellation happens while idle.
    void this.close().catch(() => {})
  }

  async open({ baudRate = 115200, dataBits = 8, stopBits = 1, parity = 'none', flowControl = 'none' } = {}) {
    if (this.closePromise) await this.closePromise
    checkSignal(this.signal)
    if (this.permanentlyClosed) throw usbError(this.failure || 'USB_CLOSED')
    if (this.port) throw usbError('USB_BUSY')
    const { binding, SerialPortStream } = this.dependencies
    let port
    try {
      port = new SerialPortStream({ binding, path: this.info.path, baudRate, dataBits, stopBits, parity, rtscts: flowControl === 'hardware', autoOpen: false, hupcl: false, highWaterMark: 65536, endOnClose: true })
    } catch { throw usbError('USB_IO') }
    this.port = port
    port.on('error', () => { if (this.port === port && !this.closing) this.fail('USB_IO') })
    port.on('close', () => { if (this.port === port && !this.closing) this.fail('USB_CLOSED') })
    port.on('end', () => { if (this.port === port && !this.closing) this.fail('USB_CLOSED') })
    if (this.onData) port.on('data', this.onData)
    try {
      let finishOpen
      this.openCompletion = new Promise(resolve => { finishOpen = resolve })
      const opening = new Promise((resolve, reject) => {
        try {
          port.open(error => {
            finishOpen()
            if (error) reject(usbError('USB_IO'))
            else if (this.permanentlyClosed || this.signal?.aborted) reject(usbError(this.signal?.aborted ? 'USB_CANCELLED' : this.failure || 'USB_CLOSED'))
            else resolve()
          })
        } catch { finishOpen(); reject(usbError('USB_IO')) }
      })
      // The abort may win before bounded() subscribes to this native operation.
      opening.catch(() => {})
      await bounded(() => opening, { signal: this.signal, timeoutMs: this.options.openTimeoutMs ?? 10000, onStop: error => this.fail(error.code) })
      this.assertOpen()
      // Enumerate after the FD exists, before any explicit modem-control/ROM write.
      const ports = await bounded(() => binding.list(), { signal: this.signal, timeoutMs: this.options.listTimeoutMs ?? 10000, onStop: error => this.fail(error.code) })
      this.assertOpen()
      const matches = Array.isArray(ports) ? ports.filter(current => current?.path === this.info.path) : []
      if (matches.length !== 1 || !sameUsbDevice(this.info, matches[0])) throw usbError('USB_IDENTITY_CHANGED')
      await this.setSignals({ dataTerminalReady: false, requestToSend: false, break: false })
      if (this.webMode) this.createWebStreams(port)
    } catch (error) {
      await this.shutdown()
      throw error
    }
  }

  getInfo() {
    const result = {}
    for (const [input, output] of [['vendorId', 'usbVendorId'], ['productId', 'usbProductId']]) {
      const value = this.info[input]
      const number = typeof value === 'string' && /^[a-f\d]{1,4}$/i.test(value) ? Number.parseInt(value, 16) : value
      if (Number.isInteger(number) && number >= 0 && number <= 65535) result[output] = number
    }
    return result
  }

  createWebStreams(port) {
    const maxBuffer = 65536
    let queuedController
    const onData = bytes => {
      if (!queuedController || this.port !== port) return
      if (bytes.length > maxBuffer) { this.fail('USB_PROTOCOL'); return }
      try {
        queuedController.enqueue(Uint8Array.from(bytes))
        if (queuedController.desiredSize <= 0) port.pause()
      } catch { this.fail('USB_IO') }
    }
    this.webData = onData
    this.readable = new ReadableStream({
      start: controller => {
        queuedController = controller
        this.readController = controller
        port.pause()
        port.on('data', onData)
      },
      pull: () => { if (this.port === port && !this.permanentlyClosed) port.resume() },
      cancel: () => {
        if (this.readController === queuedController) this.readController = null
        queuedController = null
        port.off('data', onData)
        port.pause()
      },
    }, { highWaterMark: maxBuffer, size: bytes => bytes.byteLength })
    this.writable = new WritableStream({
      start: controller => { this.writeController = controller },
      write: bytes => {
        if (!(bytes instanceof Uint8Array)) throw usbError('USB_IO')
        return this.writeBytes(bytes)
      },
      close: () => this.close(),
      abort: () => this.close(),
    }, { highWaterMark: maxBuffer, size: bytes => bytes.byteLength })
  }

  setSignals(signals) {
    const setting = (this.signalsTail ?? Promise.resolve()).then(async () => {
      this.assertOpen()
      const flags = { ...this.flags }
      for (const [webName, nodeName] of [['dataTerminalReady', 'dtr'], ['requestToSend', 'rts'], ['break', 'brk']]) {
        if (signals[webName] !== undefined) flags[nodeName] = Boolean(signals[webName])
      }
      await this.call('set', flags)
      this.flags = flags
    })
    this.signalsTail = setting.catch(() => {})
    return setting
  }

  async setBaudRate(baudRate) {
    this.assertOpen()
    await this.call('update', { baudRate })
  }

  async call(method, argument) {
    this.assertOpen()
    const port = this.port
    await bounded(() => new Promise((resolve, reject) => {
      this.assertOpen()
      if (this.port !== port) throw usbError('USB_CLOSED')
      const callback = error => error ? reject(usbError('USB_IO')) : resolve()
      if (argument === undefined) port[method](callback)
      else port[method](argument, callback)
    }), { signal: this.signal, timeoutMs: this.options.ioTimeoutMs ?? 10000, onStop: error => this.fail(error.code) })
    this.assertOpen()
    if (this.port !== port) throw usbError('USB_CLOSED')
  }

  async writeBytes(bytes) {
    this.assertOpen()
    const port = this.port
    await bounded(() => new Promise((resolve, reject) => {
      this.assertOpen()
      if (this.port !== port) throw usbError('USB_CLOSED')
      let callbackDone = false
      let drained = false
      let writeReturned = false
      let done = false
      const cleanup = () => { port.off('drain', onDrain); port.off('error', onError); port.off('close', onClose) }
      const finish = error => {
        if (done) return
        if (!error && (!writeReturned || !callbackDone || !drained)) return
        done = true
        cleanup()
        if (error) reject(error)
        else resolve()
      }
      const onDrain = () => { drained = true; finish() }
      const onError = () => finish(usbError('USB_IO'))
      const onClose = () => finish(usbError(this.failure || 'USB_CLOSED'))
      port.on('drain', onDrain)
      port.on('error', onError)
      port.on('close', onClose)
      try {
        const accepted = port.write(Buffer.from(bytes), error => {
          callbackDone = true
          finish(error ? usbError('USB_IO') : undefined)
        })
        writeReturned = true
        if (accepted) drained = true
        finish()
      } catch { finish(usbError('USB_IO')) }
    }), { signal: this.signal, timeoutMs: this.options.ioTimeoutMs ?? 10000, onStop: error => this.fail(error.code) })
    if (this.port !== port) throw usbError('USB_CLOSED')
    await this.call('drain')
  }

  async close() {
    if (this.closePromise) return this.closePromise
    const port = this.port
    this.closing = true
    try { this.readController?.close() } catch { /* Already cancelled or closed. */ }
    this.readController = null
    this.writeController = null
    this.readable = null
    this.writable = null
    if (!port) { this.closing = false; return }
    const nativeIsClosed = () => port.port ? port.port.isOpen === false : port.isOpen === false
    const release = async () => {
      if (this.onData) port.off('data', this.onData)
      if (this.webData) port.off('data', this.webData)
      port.pause()
      // The outer deadline may expire, but this continuation still closes a handle
      // whose native open finishes late. No set/write/reset may use that handle.
      await this.openCompletion
      if (!nativeIsClosed()) await new Promise((resolve, reject) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          port.off('close', onClose)
          port.off('error', onError)
          nativeIsClosed() ? resolve() : reject(usbError('USB_CLOSE_UNCONFIRMED'))
        }
        const onClose = () => finish()
        const onError = () => finish()
        port.on('close', onClose)
        port.on('error', onError)
        if (nativeIsClosed()) finish()
        else if (!port.closing) {
          try { port.close(() => finish()) } catch { finish() }
        }
      })
      if (!nativeIsClosed()) throw usbError('USB_CLOSE_UNCONFIRMED')
      port.destroy()
    }
    this.closePromise = bounded(release, { timeoutMs: this.options.closeTimeoutMs ?? 2000 }).then(() => {
      if (this.port === port) this.port = null
      this.closing = false
      this.closePromise = null
    }, () => {
      this.permanentlyClosed = true
      throw usbError('USB_CLOSE_UNCONFIRMED')
    })
    this.closePromise.catch(() => {})
    return this.closePromise
  }

  async shutdown() {
    this.permanentlyClosed = true
    this.signal?.removeEventListener('abort', this.onAbort)
    await this.close()
  }
}

function timeout(options, name, fallback) {
  const value = options[name] ?? fallback
  if (!Number.isSafeInteger(value) || value < 1 || value > 3600000) throw usbError('USB_PROTOCOL')
  return value
}

function progressReporter(callback, signal) {
  if (callback !== undefined && typeof callback !== 'function') throw usbError('USB_PROTOCOL')
  let previous = -1
  return value => {
    checkSignal(signal)
    const next = Math.min(100, Math.max(0, Math.floor(value)))
    if (!Number.isFinite(next) || next <= previous) return
    previous = next
    callback?.(next)
    checkSignal(signal)
  }
}

/** Explicit operations only. Dependency loading never enumerates or opens a port. */
export function createUsbSerial(options = {}) {
  const settings = { ...options,
    listTimeoutMs: timeout(options, 'listTimeoutMs', 10000),
    openTimeoutMs: timeout(options, 'openTimeoutMs', 120000),
    ioTimeoutMs: timeout(options, 'ioTimeoutMs', 10000),
    closeTimeoutMs: timeout(options, 'closeTimeoutMs', 5000),
    identityTimeoutMs: timeout(options, 'identityTimeoutMs', 30000),
    readTimeoutMs: timeout(options, 'readTimeoutMs', 1800000),
    writeTimeoutMs: timeout(options, 'writeTimeoutMs', 900000),
    resetTimeoutMs: timeout(options, 'resetTimeoutMs', 15000),
    dependencyTimeoutMs: timeout(options, 'dependencyTimeoutMs', 30000),
  }
  const baudRate = options.baudRate ?? 115200
  if (![115200, 460800].includes(baudRate)) throw usbError('USB_PROTOCOL')
  let dependencyPromise
  const dependencies = () => dependencyPromise ??= Promise.resolve().then(async () => {
    try {
      let loaded
      if (options.loadDependencies) loaded = await options.loadDependencies()
      else {
        // These imports execute the actual N-API binding loader; resolve() is
        // deliberately insufficient to declare a native dependency available.
        const binding = options.binding ?? (await import('@serialport/bindings-cpp')).autoDetect()
        const SerialPortStream = options.SerialPortStream ?? (await import('@serialport/stream')).SerialPortStream
        const module = options.ESPLoader && options.Transport && options.SECURITY_INFO_FLAG_MAP ? {} : await import('esptool-js')
        loaded = { binding, SerialPortStream, ESPLoader: options.ESPLoader ?? module.ESPLoader,
          Transport: options.Transport ?? module.Transport, SECURITY_INFO_FLAG_MAP: options.SECURITY_INFO_FLAG_MAP ?? module.SECURITY_INFO_FLAG_MAP }
      }
      if (typeof loaded?.binding?.list !== 'function' || typeof loaded.SerialPortStream !== 'function' ||
          typeof loaded.ESPLoader !== 'function' || typeof loaded.Transport !== 'function' ||
          !loaded.SECURITY_INFO_FLAG_MAP ||
          ['main', 'runStub', 'getSecurityInfo', 'readFlash', 'writeFlash', 'detectFlashSize', 'flashSizeBytes', 'flashMd5sum', 'after']
            .some(name => typeof loaded.ESPLoader.prototype[name] !== 'function')) throw usbError('USB_DEPENDENCY_UNAVAILABLE')
      return loaded
    } catch {
      dependencyPromise = null
      throw usbError('USB_DEPENDENCY_UNAVAILABLE')
    }
  })

  async function enumerate(binding, signal) {
    const rows = await bounded(() => binding.list(), { signal, timeoutMs: settings.listTimeoutMs })
    if (!Array.isArray(rows) || rows.length > 1024) throw usbError('USB_PROTOCOL')
    const ports = rows.map(normalizePortInfo).filter(hasStrongUsbIdentity)
    if (new Set(ports.map(port => port.path)).size !== ports.length) throw usbError('USB_IDENTITY_CHANGED')
    return ports
  }
  async function assertEnumerated(binding, expected, signal) {
    const matches = (await enumerate(binding, signal)).filter(port => port.path === expected.path)
    if (matches.length !== 1 || !sameUsbDevice(expected, matches[0])) throw usbError('USB_IDENTITY_CHANGED')
  }

  return Object.freeze({
    async availability({ signal } = {}) {
      try {
        await bounded(dependencies, { signal, timeoutMs: settings.dependencyTimeoutMs })
        return { available: true, reason: '' }
      } catch (error) {
        if (['USB_CANCELLED', 'USB_TIMEOUT'].includes(error?.code)) throw error
        return { available: false, reason: usbError('USB_DEPENDENCY_UNAVAILABLE').message }
      }
    },
    async listPorts({ signal } = {}) {
      const { binding } = await bounded(dependencies, { signal, timeoutMs: settings.dependencyTimeoutMs })
      return enumerate(binding, signal)
    },
    async openBootloader(portInfo, { signal } = {}) {
      checkSignal(signal)
      const info = normalizePortInfo(portInfo)
      if (!hasStrongUsbIdentity(info)) throw usbError('USB_IDENTITY_UNAVAILABLE')
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) controller.abort()
      let device, loader, transport, loaded, closed = false, busy = false, closePromise, resetting = false, securityAccepted = false
      let rejectDeviceFailure
      const deviceFailure = new Promise((_, reject) => { rejectDeviceFailure = reject })
      deviceFailure.catch(() => {})
      const close = () => closePromise ??= (async () => {
        closed = true
        controller.abort()
        try { await device?.shutdown() } finally { signal?.removeEventListener('abort', abort) }
      })()
      const rawIdentity = async () => {
        device.assertOpen()
        await assertEnumerated(loaded.binding, info, controller.signal)
        if (loader.chip?.CHIP_NAME !== 'ESP32-S3') throw usbError('USB_CHIP_MISMATCH')
        if (!securityAccepted || loader.secureDownloadMode) throw usbError('USB_SECURITY_UNSUPPORTED')
        if (typeof loader.chip.readMac !== 'function') throw usbError('USB_ROM_IDENTITY')
        const mac = normalizeRomMac(await loader.chip.readMac(loader))
        const size = await loader.detectFlashSize()
        const bytes = size ? loader.flashSizeBytes(size) : -1
        if (bytes !== FLASH_BYTES) throw usbError('USB_FLASH_SIZE')
        device.assertOpen()
        return { chip: 'ESP32-S3', flashBytes: bytes, romMac: mac }
      }
      let identity
      try {
        identity = await bounded(async () => {
          loaded = await dependencies()
          checkSignal(controller.signal)
          // Validate the scan selection BEFORE creating any native handle.
          await assertEnumerated(loaded.binding, info, controller.signal)
          device = new NodeSerialDevice(info, loaded, settings, controller.signal, true)
          device.onFailure = error => {
            if (resetting && error.code === 'USB_CLOSED' && !signal?.aborted) return
            rejectDeviceFailure(error)
          }
          class NodeTransport extends loaded.Transport {
            setSignals(dtr, rts, breakSignal) { return this.device.setSignals({ dataTerminalReady: dtr, requestToSend: rts, break: breakSignal }) }
            setDTR(state) { return this.device.setSignals({ dataTerminalReady: state }) }
            setRTS(state) { return this.device.setSignals({ requestToSend: state }) }
          }
          transport = new NodeTransport(device, false)
          transport.trace = () => {}
          transport.returnTrace = async () => {}
          if (typeof transport.appendArray === 'function') {
            const append = transport.appendArray.bind(transport)
            transport.appendArray = (previous, incoming) => {
              if (previous.length + incoming.length > 262144) { device.fail('USB_PROTOCOL'); throw usbError('USB_PROTOCOL') }
              return append(previous, incoming)
            }
          }
          const terminal = { clean() {}, write() {}, writeLine() {} }
          const resetConstructors = { hardReset: (target, usesUsb = false) => ({ async reset() {
            await target.setRTS(true)
            await pause(usesUsb ? 200 : 100)
            checkSignal(controller.signal)
            await target.setRTS(false)
            if (usesUsb) await pause(200)
            checkSignal(controller.signal)
          } }) }
          loader = new loaded.ESPLoader({ transport, baudrate: baudRate, romBaudrate: 115200,
            terminal, debugLogging: false, enableTracing: false, resetConstructors })
          const runStub = loader.runStub.bind(loader)
          loader.runStub = async (...args) => {
            securityAccepted = false
            device.assertOpen()
            if (loader.chip?.CHIP_NAME !== 'ESP32-S3') throw usbError('USB_CHIP_MISMATCH')
            if (loader.IS_STUB || loader.syncStubDetected) throw usbError('USB_SECURITY_UNSUPPORTED')
            let security
            try { security = await loader.getSecurityInfo(false) } catch {
              device.assertOpen()
              throw usbError('USB_SECURITY_UNSUPPORTED')
            }
            device.assertOpen()
            assertUnprotectedSecurity(security, loader.chip, loaded.SECURITY_INFO_FLAG_MAP)
            if (loader.secureDownloadMode) throw usbError('USB_SECURITY_UNSUPPORTED')
            securityAccepted = true
            // In upstream 0.7.1 main(), this hook still runs in ROM, including
            // baud-change reconnects. Querying after main() could target a stub
            // after changeBaud() has cleared the ROM security-info cache.
            return runStub(...args)
          }
          await Promise.race([loader.main(), deviceFailure])
          checkSignal(controller.signal)
          const first = await rawIdentity()
          // Read actual eFuse ROM MAC twice; USB descriptor strings are never
          // substituted for a missing or malformed ROM identity.
          if (normalizeRomMac(await loader.chip.readMac(loader)) !== first.romMac) throw usbError('USB_ROM_IDENTITY')
          return first
        }, { signal: controller.signal, timeoutMs: settings.openTimeoutMs,
          onStop: error => device?.fail(error.code) })
      } catch (error) {
        await close()
        throw usbError(error?.code)
      }

      const assertSame = async () => {
        const current = await rawIdentity()
        if (current.romMac !== identity.romMac || current.chip !== identity.chip || current.flashBytes !== identity.flashBytes)
          throw usbError('USB_IDENTITY_CHANGED')
      }
      async function operation(deadline, work) {
        checkSignal(controller.signal)
        if (closed) throw usbError('USB_CLOSED')
        if (busy) throw usbError('USB_BUSY')
        busy = true
        try {
          return await bounded(() => Promise.race([work(), deviceFailure]), { signal: controller.signal,
            timeoutMs: deadline, onStop: error => device.fail(error.code) })
        } catch (error) {
          await close()
          throw usbError(error?.code)
        } finally { busy = false }
      }
      return Object.freeze({
        ...identity,
        assertIdentity: () => operation(settings.identityTimeoutMs, async () => { await assertSame(); return { ...identity } }),
        async readFlash(offset, length, { onProgress } = {}) {
          if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 ||
              offset > FLASH_BYTES - length) throw usbError('USB_INVALID_RANGE')
          const report = progressReporter(onProgress, controller.signal)
          return operation(settings.readTimeoutMs, async () => {
            await assertSame(); report(0)
            const output = new Uint8Array(length)
            for (let cursor = 0; cursor < length;) {
              device.assertOpen()
              const size = Math.min(READ_CHUNK, length - cursor)
              const bytes = await loader.readFlash(offset + cursor, size, (packet, received, total) => {
                device.assertOpen()
                if (!(packet instanceof Uint8Array) || !Number.isSafeInteger(received) ||
                    received < packet.length || received > size || total !== size) throw usbError('USB_PROTOCOL')
                report(Math.min(99, (cursor + received) * 100 / length))
              })
              device.assertOpen()
              if (!(bytes instanceof Uint8Array) || bytes.length !== size) throw usbError('USB_PROTOCOL')
              output.set(bytes, cursor); cursor += size
            }
            await assertSame(); report(100)
            return output
          })
        },
        async writeApplication(image, { onProgress } = {}) {
          if (!(image instanceof Uint8Array) || image.length < 1 || image.length > APP_BYTES) throw usbError('USB_INVALID_RANGE')
          const owned = Uint8Array.from(image)
          const report = progressReporter(onProgress, controller.signal)
          return operation(settings.writeTimeoutMs, async () => {
            await assertSame(); report(0)
            await loader.writeFlash({ fileArray: [{ data: owned, address: APP_OFFSET }],
              flashMode: 'keep', flashFreq: 'keep', flashSize: 'keep', eraseAll: false, compress: true,
              calculateMD5Hash: bytes => createHash('md5').update(bytes).digest('hex'),
              reportProgress: (index, written, total) => {
                device.assertOpen()
                if (index !== 0 || !Number.isFinite(written) || !Number.isFinite(total) ||
                    written < 0 || total <= 0 || written > total) throw usbError('USB_PROTOCOL')
                report(Math.min(99, written * 100 / total))
              } })
            device.assertOpen()
            const md5 = await loader.flashMd5sum(APP_OFFSET, owned.length)
            if (typeof md5 !== 'string' || !/^[0-9a-f]{32}$/iu.test(md5) ||
                md5.toLowerCase() !== createHash('md5').update(owned).digest('hex')) throw usbError('USB_VERIFY_FAILED')
            await assertSame(); report(100)
          })
        },
        async reset() {
          return operation(settings.resetTimeoutMs, async () => {
            await assertSame()
            resetting = true
            try {
              await loader.after('hard_reset')
              checkSignal(controller.signal)
              return { resetConfirmed: !device.failure && Boolean(device.port?.isOpen) }
            } catch (error) {
              checkSignal(controller.signal)
              if (error?.code === 'USB_CLOSED') return { resetConfirmed: false }
              throw error
            } finally { resetting = false }
          })
        },
        close,
      })
    },
  })
}

