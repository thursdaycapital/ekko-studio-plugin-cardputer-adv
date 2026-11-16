import { createHash, timingSafeEqual } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerRpc, validateModel } from '../sdk/harness/contracts.mjs'
import { contract } from './contracts.mjs'
import { createUsbSerial } from './usb-serial.mjs'
import { createUsbUpdater } from './usb-updater.mjs'

export { contract } from './contracts.mjs'
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const defaults = Object.freeze({ deviceOrigin: '', preferredDeviceId: '' })
const sha256 = value => createHash('sha256').update(value).digest()
const hex = (value, bytes) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${bytes * 2}}$`).test(value)

function checkRun(run) {
  if (!run?.identity || !Number.isSafeInteger(run.identity.userId) || run.identity.userId < 1 ||
      typeof run.identity.profile !== 'string' || !run.identity.profile.trim() ||
      run.identity.profile.length > 256 || /[\u0000-\u001f\u007f]/u.test(run.identity.profile)) {
    throw new Error('需要有效的当前调用用户与 Profile')
  }
  if (!run.signal || typeof run.signal.aborted !== 'boolean') throw new Error('调用缺少取消信号')
  if (run.signal.aborted) throw new Error('调用已取消')
}

/** Stores only a preference: no device request, DNS lookup or trust assertion occurs. */
export function validateSettings(value) {
  validateModel(contract, 'settings', value)
  if (/[\u0000-\u001f\u007f]/u.test(value.preferredDeviceId)) throw new Error('设备 ID 含无效字符')
  if (value.deviceOrigin === '') return { ...value }
  const input = value.deviceOrigin
  if (input.trim() !== input || /[\\?#\s]/u.test(input)) throw new Error('设备地址必须是私有网络的根 origin')
  const match = /^(https?):\/\/([^/:@]+)(?::([0-9]+))?\/?$/u.exec(input)
  if (!match) throw new Error('设备地址不能包含凭据、路径、查询或片段')
  const host = match[2].toLowerCase()
  if (match[3] && (!/^[1-9][0-9]*$/u.test(match[3]) || Number(match[3]) > 65535)) throw new Error('设备端口无效')
  const octets = host.split('.')
  const ipv4 = octets.length === 4 && octets.every(n => /^(?:0|[1-9][0-9]{0,2})$/u.test(n) && Number(n) <= 255)
  const nums = octets.map(Number)
  const privateIpv4 = ipv4 && (nums[0] === 10 || nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31 || nums[0] === 192 && nums[1] === 168)
  const local = host.length <= 253 && host.endsWith('.local') && octets.length >= 2 &&
    octets.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
  if (!privateIpv4 && !local) throw new Error('仅接受私有 IPv4 或 .local 设备地址')
  return validateModel(contract, 'settings', { ...value, deviceOrigin: new URL(input).origin })
}

export function sanitizeDevices(value) {
  validateModel(contract, 'nativeDevices', value)
  const ids = new Set()
  const devices = value.devices.map(device => {
    if (ids.has(device.id)) throw new Error('官方设备列表含重复记录 ID')
    ids.add(device.id)
    return {
      id: String(device.id), name: device.name, codeSuffix: device.device_code.slice(-6),
      lanConnected: device.lan_connected, desktopRelayConnected: device.remote_connected, official: device.is_official,
    }
  })
  return validateModel(contract, 'devices', { devices, modelVerified: false })
}

/** Checks image segments, Espressif XOR checksum and appended SHA-256. */
export function validateEsp32S3Image(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes[0] !== 0xe9 || bytes[1] < 1 || bytes[1] > 16 ||
      bytes.readUInt16LE(12) !== 9 || bytes[3] >> 4 !== 3 || bytes[23] !== 1) {
    throw new Error('固件不是带校验摘要的 ESP32-S3 / 8MiB 应用镜像')
  }
  let cursor = 24
  let checksum = 0xef
  for (let i = 0; i < bytes[1]; i++) {
    if (cursor + 8 > bytes.length) throw new Error('固件段头超出文件')
    const size = bytes.readUInt32LE(cursor + 4)
    cursor += 8
    if (!size || size % 4 !== 0 || size > bytes.length - cursor) throw new Error('固件段长度无效')
    const end = cursor + size
    for (; cursor < end; cursor++) checksum ^= bytes[cursor]
  }
  const checksumOffset = Math.floor(cursor / 16) * 16 + 15
  if (checksumOffset + 33 !== bytes.length || bytes[checksumOffset] !== checksum ||
      bytes.subarray(cursor, checksumOffset).some(value => value !== 0)) throw new Error('固件长度或段校验失败')
  if (!timingSafeEqual(sha256(bytes.subarray(0, checksumOffset + 1)), bytes.subarray(checksumOffset + 1))) {
    throw new Error('固件内置 SHA-256 摘要不匹配')
  }
}

function checkPublicUrl(value, { pinned = false, raw = false } = {}) {
  let url
  try { url = new URL(value) } catch { throw new Error('公开来源 URL 无效') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.port || !['github.com', 'raw.githubusercontent.com'].includes(url.hostname)) throw new Error('公开来源必须是无认证的 GitHub HTTPS 链接')
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 2 || pinned && !segments.some(segment => /^[a-f0-9]{40}$/u.test(segment)) ||
      raw && (url.hostname !== 'raw.githubusercontent.com' || !/^[a-f0-9]{40}$/u.test(segments[2] ?? ''))) {
    throw new Error('固件下载与固定源码链接必须使用完整提交')
  }
}

function checkReleaseLinks(firmware) {
  const repository = new URL(firmware.source.repository)
  if (repository.hostname !== 'github.com' || !/^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/u.test(repository.pathname) ||
      repository.pathname.split('/').some(part => part === '.' || part === '..') ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(firmware.releaseLabel)) {
    throw new Error('固件来源必须是明确的 GitHub 仓库与发布标签')
  }
  const root = repository.origin + repository.pathname
  if (firmware.source.releaseUrl === undefined) {
    if (firmware.publication !== 'draft') throw new Error('已发布固件必须提供公开发布页')
  } else if (firmware.source.releaseUrl !== `${root}/releases/tag/${firmware.releaseLabel}`) throw new Error('发布页与固件仓库或标签不一致')
  for (const name of ['url', 'relinkUrl']) {
    if (!new URL(firmware.source[name]).pathname.startsWith(`${repository.pathname}/`)) throw new Error('源码链接与固件仓库不一致')
  }
  const artifacts = firmware.files.map(file => ({ file, archive: false }))
  if (firmware.source.archive) artifacts.push({ file: firmware.source.archive, archive: true })
  for (const { file, archive } of artifacts) {
    if (archive && file.downloadUrl === undefined && file.downloadAsset === undefined) continue
    if (archive && (file.downloadUrl === undefined || file.downloadAsset === undefined)) throw new Error('源码下载资产和地址必须同时提供或同时省略')
    if (file.downloadAsset !== undefined) {
      const basename = archive ? /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.tar\.gz$/u : /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.bin$/u
      if (!basename.test(file.downloadAsset) ||
          file.downloadUrl !== `${root}/releases/download/${firmware.releaseLabel}/${file.downloadAsset}`) {
        throw new Error('固件下载与仓库、发布标签或资产名不一致')
      }
    } else {
      // Older published catalogs used a full-commit raw URL. Retain that
      // exact form; a moving branch or another repository is never accepted.
      checkPublicUrl(file.downloadUrl, { pinned: true, raw: true })
      const parts = new URL(file.downloadUrl).pathname.split('/')
      if (`/${parts[1]}/${parts[2]}` !== repository.pathname || parts[3] !== firmware.source.commit) throw new Error('镜像下载链接与源码仓库或提交不一致')
    }
  }
}

async function regularFirmwareFile(root, relative, archive = false) {
  const allowed = archive ? /^firmware\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.tar\.gz$/u : /^firmware\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.bin$/u
  if (!allowed.test(relative) || relative.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error('固件或源码路径必须是 firmware 目录内的相对文件路径')
  }
  let current = root
  const parts = relative.split('/')
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i])
    const info = await lstat(current)
    if (info.isSymbolicLink() || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile())) throw new Error('固件文件不允许符号链接或特殊文件')
  }
  return current
}

/** Only tests pass a different root; the production RPC never accepts a path. */
export async function loadOverview(root = packageRoot) {
  try {
    const canonicalRoot = await realpath(root)
    const directory = await lstat(path.join(canonicalRoot, 'firmware'))
    const metadataPath = path.join(canonicalRoot, 'firmware', 'release.json')
    const metadataInfo = await lstat(metadataPath)
    if (!directory.isDirectory() || directory.isSymbolicLink() || !metadataInfo.isFile() || metadataInfo.isSymbolicLink() || metadataInfo.size > 65536) throw new Error('发布清单无效')
    const manifest = validateModel(contract, 'release', JSON.parse(await readFile(metadataPath, 'utf8')))
    if (!hex(manifest.firmware.partitionTable.sha256, 32) || !hex(manifest.firmware.source.commit, 20) ||
        !hex(manifest.pluginSdk.sourceCommit, 20)) throw new Error('发布清单摘要或提交格式无效')
    const firmware = manifest.firmware
    if (firmware.applicationOffset + firmware.applicationPartitionBytes !== firmware.factoryOffset || firmware.factoryOffset >= manifest.board.flashBytes || firmware.files.length !== 1) throw new Error('应用分区边界无效')
    for (const name of ['repository', 'url', 'releaseUrl', 'relinkUrl']) {
      if (name === 'releaseUrl' && firmware.source[name] === undefined) continue
      checkPublicUrl(firmware.source[name], { pinned: name === 'url' || name === 'relinkUrl' })
      if ((name === 'url' || name === 'relinkUrl') && !new URL(firmware.source[name]).pathname.split('/').includes(firmware.source.commit)) throw new Error('源码链接与清单提交不一致')
    }
    checkReleaseLinks(firmware)
    for (const file of firmware.files) {
      if (!hex(file.sha256, 32) || file.offset !== firmware.applicationOffset || file.bytes > firmware.applicationPartitionBytes) throw new Error('应用镜像偏移、长度或 SHA-256 格式无效')
      const filename = await regularFirmwareFile(canonicalRoot, file.path)
      const info = await lstat(filename)
      if (info.size !== file.bytes) throw new Error('固件文件大小与发布清单不匹配')
      const bytes = await readFile(filename)
      if (bytes.length !== file.bytes || !timingSafeEqual(sha256(bytes), Buffer.from(file.sha256, 'hex'))) throw new Error('固件 SHA-256 与发布清单不匹配')
      validateEsp32S3Image(bytes)
    }
    if (firmware.source.archive) {
      const archive = firmware.source.archive
      if (!hex(archive.sha256, 32)) throw new Error('源码归档 SHA-256 格式无效')
      const filename = await regularFirmwareFile(canonicalRoot, archive.path, true)
      const info = await lstat(filename)
      if (info.size !== archive.bytes) throw new Error('源码归档大小与发布清单不匹配')
      const bytes = await readFile(filename)
      if (bytes.length !== archive.bytes || !timingSafeEqual(sha256(bytes), Buffer.from(archive.sha256, 'hex'))) throw new Error('源码归档 SHA-256 与发布清单不匹配')
    }
    return validateModel(contract, 'overview', { ...manifest, artifactVerified: true })
  } catch (error) {
    // OS/JSON errors can contain local paths or raw metadata; sanitize that boundary.
    if (error?.code || error instanceof SyntaxError) throw new Error('固件交付校验失败：无法读取有效发布清单或镜像')
    throw new Error(`固件交付校验失败：${error.message}`)
  }
}

export function createBackend(ctx) {
  // Official ctx.signal is invocation-sensitive. Capture the plugin root signal
  // during apply, before a later RPC temporarily supplies its short-lived one.
  const updaterContext = { signal: ctx.signal, paths: ctx.paths }
  const disposers = []
  let disposed = false
  let disposal
  let updater
  const usb = () => updater ??= createUsbUpdater(updaterContext, {
    driver: createUsbSerial(),
    async loadFirmware() {
      const overview = await loadOverview()
      const firmware = overview.firmware
      const file = firmware.files[0]
      const bytes = await readFile(await regularFirmwareFile(packageRoot, file.path))
      if (bytes.length !== file.bytes || !timingSafeEqual(sha256(bytes), Buffer.from(file.sha256, 'hex'))) throw new Error('随包应用已变化，请重新打开固件页核对')
      validateEsp32S3Image(bytes)
      return { version: firmware.version, sha256: file.sha256, bytes, partitionTable: { ...firmware.partitionTable } }
    },
  })
  const dispose = () => {
    if (disposal) return disposal
    disposed = true
    const cleanup = []
    for (const unregister of disposers.reverse()) {
      try { cleanup.push(Promise.resolve(unregister())) } catch (error) { cleanup.push(Promise.reject(error)) }
    }
    if (updater) cleanup.push(Promise.resolve().then(() => updater.dispose()))
    disposal = Promise.allSettled(cleanup).then(results => {
      if (results.some(result => result.status === 'rejected')) throw new Error('插件资源释放未能全部确认，请检查正在进行的USB作业')
    })
    return disposal
  }
  const register = (name, handler) => {
    disposers.push(registerRpc(ctx, contract, name, async (input, run) => {
      if (disposed) throw new Error('插件已释放')
      checkRun(run)
      return handler(input, run)
    }))
  }
  const store = run => ctx.state.plugin.namespace(String(run.identity.userId), run.identity.profile)
  try {
    register('get-overview', async (_input, run) => {
      const result = await loadOverview()
      checkRun(run)
      return result
    })
    register('list-devices', async (_input, run) => {
      let result
      try { result = await run.host.request('/api/mcu-devices') }
      catch { checkRun(run); throw new Error('无法读取官方设备列表，请检查当前账号权限与 Studio 状态') }
      checkRun(run)
      try { return sanitizeDevices(result) }
      catch { throw new Error('官方设备列表格式不符合已验证契约，请检查 Studio 版本') }
    })
    register('get-settings', async (_input, run) => {
      const value = await store(run).get('settings')
      checkRun(run)
      return validateSettings(value === undefined ? { ...defaults } : value)
    })
    register('save-settings', async (input, run) => {
      const value = validateSettings(input)
      const target = store(run)
      checkRun(run)
      await target.set('settings', validateModel(contract, 'settings', value))
      checkRun(run)
      return { ok: true }
    })
    register('usb-info', (_input, run) => usb().info(run))
    register('usb-list-ports', (_input, run) => usb().list(run))
    register('usb-start-update', (input, run) => usb().start(input, run))
    register('usb-update-status', (input, run) => usb().status(input, run))
    register('usb-cancel-update', (input, run) => usb().cancel(input, run))
  } catch (error) {
    void dispose().catch(() => {})
    throw error
  }
  return dispose
}
