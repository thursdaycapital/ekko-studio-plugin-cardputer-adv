import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../server.mjs'
import { loadOverview, sanitizeDevices, validateEsp32S3Image, validateSettings } from '../lib/backend.mjs'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const empty = { deviceOrigin: '', preferredDeviceId: '' }
const sample = { deviceOrigin: 'http://192.168.0.102', preferredDeviceId: '7' }
const native = () => ({ devices: [{ id: 7, name: '用户登记名称', device_code: 'PRIVATE_DEVICE_123456', is_official: false,
  created_at: 100, lan_connected: true, remote_connected: false, apiKey: 'DO_NOT_RETURN' }], extra: 'DO_NOT_RETURN' })

function setup(existing = new Map()) {
  const methods = existing
  const records = new Map()
  let writes = 0
  const ctx = {
    identity: { userId: 999, profile: 'activation-profile' },
    host: { request() { throw new Error('activation host must not be used') } },
    extensions: { rpc: { register(name, handler) {
      if (methods.has(name)) throw new Error(`duplicate ${name}`)
      methods.set(name, handler)
      return () => { if (methods.get(name) === handler) methods.delete(name) }
    } } },
    state: { plugin: { namespace(...parts) {
      const key = JSON.stringify(parts) + ':settings'
      return { async get(name) { assert.equal(name, 'settings'); return records.get(key) },
        async set(name, value) { assert.equal(name, 'settings'); writes++; records.set(key, structuredClone(value)) } }
    } } },
  }
  const call = (name, input, overrides = {}) => methods.get(name)(input, {
    identity: { userId: 1, profile: 'default' }, signal: new AbortController().signal,
    host: { async request(route) { assert.equal(route, '/api/mcu-devices'); return native() } }, ...overrides,
  })
  return { ctx, methods, records, call, get writes() { return writes } }
}

test('settings use actual caller + Profile; activation identity is never borrowed', async () => {
  const s = setup(); const dispose = apply(s.ctx)
  assert.deepEqual(await s.call('get-settings', null), empty)
  assert.deepEqual(await s.call('save-settings', sample), { ok: true })
  assert.deepEqual(await s.call('get-settings', null), sample)
  assert.deepEqual(await s.call('get-settings', null, { identity: { userId: 2, profile: 'default' } }), empty)
  assert.deepEqual(await s.call('get-settings', null, { identity: { userId: 1, profile: 'other' } }), empty)
  assert.deepEqual([...s.records.keys()], ['["1","default"]:settings'])
  dispose()
})

test('invalid identity, cancelled requests, extra fields and malformed stored data do not write', async () => {
  const s = setup(); apply(s.ctx)
  for (const identity of [undefined, {}, { userId: 0, profile: 'default' }, { userId: '1', profile: 'default' },
    { userId: 1, profile: '' }, { userId: 1, profile: '  ' }, { userId: 1, profile: 'x\u0000' }]) {
    await assert.rejects(s.call('save-settings', sample, { identity }), /用户与 Profile/)
  }
  const controller = new AbortController(); controller.abort()
  await assert.rejects(s.call('save-settings', sample, { signal: controller.signal }), /取消/)
  await assert.rejects(s.call('get-settings', {}), /expected null/)
  await assert.rejects(s.call('save-settings', { ...sample, token: 'secret' }), /unknown property/)
  await assert.rejects(s.call('save-settings', { ...sample, preferredDeviceId: 'x'.repeat(129) }), /invalid length/)
  assert.equal(s.writes, 0)
  s.records.set('["1","default"]:settings', null)
  await assert.rejects(s.call('get-settings', null), /expected object/)
  s.records.set('["1","default"]:settings', { ...sample, token: 'secret' })
  await assert.rejects(s.call('get-settings', null), /unknown property/)
})

test('origin preference accepts only explicit private IPv4 or .local HTTP(S) root origins', () => {
  for (const origin of ['', 'http://10.0.0.2', 'https://172.16.0.1:443/', 'http://172.31.255.254:8080', 'http://192.168.0.3', 'https://M5.local/']) {
    const result = validateSettings({ ...empty, deviceOrigin: origin })
    assert.equal(result.deviceOrigin, origin ? new URL(origin).origin : '')
  }
  for (const origin of ['http://172.32.0.1', 'http://8.8.8.8', 'http://127.0.0.1', 'http://localhost',
    'http://[::1]', 'http://127.1', 'http://0x0a000001', 'http://010.0.0.1', 'http://192.168.0.256',
    'http://user:pass@192.168.0.2', 'http://@192.168.0.2', 'https://m5.local/device',
    'http://m5.local?', 'http://m5.local#', 'http://m5.local:0', 'http://m5.local:65536',
    'ftp://m5.local', 'http://m5.local./', ' http://m5.local', 'http://m5.local\\x', 'http://m5.local/%2e%2e/']) {
    assert.throws(() => validateSettings({ ...empty, deviceOrigin: origin }), undefined, origin)
  }
})

test('native API uses run.host and discloses only safe fields without guessing hardware by name', async () => {
  const s = setup(); apply(s.ctx)
  const result = await s.call('list-devices', null)
  assert.deepEqual(result, { devices: [{ id: '7', name: '用户登记名称', codeSuffix: '123456',
    lanConnected: true, desktopRelayConnected: false, official: false }], modelVerified: false })
  assert.ok(!JSON.stringify(result).includes('PRIVATE_DEVICE'))
  assert.ok(!JSON.stringify(result).includes('DO_NOT_RETURN'))
  assert.deepEqual(sanitizeDevices({ devices: [] }), { devices: [], modelVerified: false })
})

test('host failure or changed native shape is surfaced, not disguised as an empty list', async () => {
  const s = setup(); apply(s.ctx)
  await assert.rejects(s.call('list-devices', null, { host: { async request() { throw new Error('Bearer PRIVATE_TOKEN') } } }),
    error => /无法读取官方/.test(error.message) && !error.message.includes('PRIVATE_TOKEN'))
  for (const response of [{}, [], { devices: null }, { devices: [{ ...native().devices[0], id: '7' }] },
    { devices: [{ ...native().devices[0], lan_connected: 'true' }] },
    { devices: [{ ...native().devices[0], remote_connected: undefined }] },
    { devices: [native().devices[0], native().devices[0]] }]) {
    await assert.rejects(s.call('list-devices', null, { host: { async request() { return response } } }), /列表格式/)
  }
})

test('cancellation during asynchronous host/read work blocks returning stale data', async () => {
  const s = setup(); apply(s.ctx)
  const controller = new AbortController()
  await assert.rejects(s.call('list-devices', null, { signal: controller.signal, host: { async request() {
    controller.abort(); return native()
  } } }), /取消/)
  assert.equal(s.writes, 0)
})

test('apply/dispose is idempotent, duplicate apply preserves existing registration, partial registration rolls back', async () => {
  const s = setup(); const dispose = apply(s.ctx)
  assert.equal(s.methods.size, 4)
  assert.throws(() => apply(s.ctx), /duplicate/)
  assert.equal(s.methods.size, 4)
  const captured = s.methods.get('save-settings')
  dispose(); dispose()
  assert.equal(s.methods.size, 0)
  await assert.rejects(captured(sample, { identity: { userId: 1, profile: 'default' }, signal: new AbortController().signal }), /释放/)
  const disposeAgain = apply(s.ctx); assert.equal(s.methods.size, 4); disposeAgain()
  const preexisting = () => null
  const partial = setup(new Map([['get-settings', preexisting]]))
  assert.throws(() => apply(partial.ctx), /duplicate/)
  assert.deepEqual([...partial.methods.entries()], [['get-settings', preexisting]])
})

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cardputer-plugin-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'firmware'))
  const manifest = JSON.parse(await readFile(path.join(projectRoot, 'firmware/release.json'), 'utf8'))
  const data = await readFile(path.join(projectRoot, manifest.firmware.files[0].path))
  const metadata = path.join(root, 'firmware/release.json')
  const image = path.join(root, manifest.firmware.files[0].path)
  const save = () => writeFile(metadata, JSON.stringify(manifest))
  await save(); await writeFile(image, data)
  if (manifest.firmware.source.archive) {
    const archive = manifest.firmware.source.archive
    await writeFile(path.join(root, archive.path), await readFile(path.join(projectRoot, archive.path)))
  }
  return { root, manifest, data, image, save }
}

test('real bundled artifact is read from its release catalog rather than a compiled release number', async () => {
  const manifest = JSON.parse(await readFile(path.join(projectRoot, 'firmware/release.json'), 'utf8'))
  const overview = await loadOverview()
  assert.equal(overview.artifactVerified, true)
  assert.deepEqual(overview.firmware, manifest.firmware)
  assert.deepEqual(overview.pluginSdk, manifest.pluginSdk)
  const image = await readFile(path.join(projectRoot, manifest.firmware.files[0].path))
  assert.equal(overview.firmware.files[0].bytes, image.length)
  assert.equal(overview.firmware.files[0].sha256, createHash('sha256').update(image).digest('hex'))
  assert.ok(!JSON.stringify(overview).includes(projectRoot))
})

test('a different release version, image size/hash and relative filename use the same production verifier', async t => {
  const f = await fixture(t)
  // Synthetic image-format fixture only: not a runnable firmware or a claim
  // that a future release URL exists. No download is attempted by the verifier.
  const image = Buffer.alloc(96)
  image[0] = 0xe9; image[1] = 1; image[3] = 0x30; image.writeUInt16LE(9, 12); image[23] = 1
  image.writeUInt32LE(0x3c000020, 24); image.writeUInt32LE(16, 28)
  let checksum = 0xef
  for (let i = 32; i < 48; ++i) { image[i] = i; checksum ^= image[i] }
  image[63] = checksum; createHash('sha256').update(image.subarray(0, 64)).digest().copy(image, 64)
  const file = f.manifest.firmware.files[0]
  f.manifest.firmware.version = 'synthetic-test-release'
  f.manifest.firmware.releaseLabel = 'synthetic-test-label'
  file.path = 'firmware/different-application.bin'; file.bytes = image.length
  file.downloadAsset = 'different-application.bin'
  file.downloadUrl = `${f.manifest.firmware.source.repository}/releases/download/${f.manifest.firmware.releaseLabel}/${file.downloadAsset}`
  f.manifest.firmware.source.releaseUrl = `${f.manifest.firmware.source.repository}/releases/tag/${f.manifest.firmware.releaseLabel}`
  if (f.manifest.firmware.source.archive) {
    const archive = f.manifest.firmware.source.archive
    archive.downloadUrl = `${f.manifest.firmware.source.repository}/releases/download/${f.manifest.firmware.releaseLabel}/${archive.downloadAsset}`
  }
  file.sha256 = createHash('sha256').update(image).digest('hex')
  f.manifest.capabilities.explicitAgentModes = true
  f.manifest.capabilities.shortG0Returns = true
  f.manifest.pluginSdk.firmwareOnThisHostPhysicallyValidated = true
  await writeFile(path.join(f.root, file.path), image); await f.save()
  const overview = await loadOverview(f.root)
  assert.deepEqual(overview.firmware, f.manifest.firmware)
  assert.equal(overview.firmware.files[0].bytes, 96)
  assert.equal(overview.capabilities.explicitAgentModes, true)
  assert.equal(overview.pluginSdk.firmwareOnThisHostPhysicallyValidated, true)
})

test('tampered firmware fails both manifest digest and image-internal checks', async t => {
  const f = await fixture(t)
  f.data[100] ^= 1
  await writeFile(f.image, f.data)
  await assert.rejects(loadOverview(f.root), /SHA-256/)
  f.manifest.firmware.files[0].sha256 = createHash('sha256').update(f.data).digest('hex')
  await f.save()
  await assert.rejects(loadOverview(f.root), /校验/)
  const wrongChip = Buffer.from(f.data); wrongChip.writeUInt16LE(0, 12)
  assert.throws(() => validateEsp32S3Image(wrongChip), /ESP32-S3/)
})

test('catalog rejects traversal, arbitrary public URLs, mismatched offsets and symlink artifacts', async t => {
  const f = await fixture(t)
  const original = structuredClone(f.manifest)
  for (const mutate of [
    m => { m.firmware.files[0].path = '../outside.bin' },
    m => { m.firmware.files[0].path = 'firmware/../outside.bin' },
    m => { m.firmware.files[0].path = '/tmp/outside.bin' },
    m => { m.firmware.files[0].downloadUrl = 'https://example.com/image.bin' },
    m => { m.firmware.files[0].downloadUrl = m.firmware.files[0].downloadUrl.replace(m.firmware.releaseLabel, 'main') },
    m => { m.firmware.files[0].offset = 0 },
    m => { m.firmware.files[0].bytes++ },
    m => { m.firmware.files = [] },
    m => { m.firmware.stage = 'stable' },
  ]) {
    Object.assign(f.manifest, structuredClone(original)); mutate(f.manifest); await f.save()
    await assert.rejects(loadOverview(f.root))
  }
  Object.assign(f.manifest, structuredClone(original))
  f.manifest.firmware.files[0].path = 'firmware/alias.bin'; await f.save()
  await symlink(f.image, path.join(f.root, 'firmware/alias.bin'))
  await assert.rejects(loadOverview(f.root), /符号链接/)
})

test('Release downloads require the exact catalog repository, tag and unencoded asset basename', async t => {
  const f = await fixture(t)
  const original = structuredClone(f.manifest)
  for (const mutate of [
    m => { m.firmware.files[0].downloadUrl = m.firmware.files[0].downloadUrl.replace('/thursdaycapital/', '/another-owner/') },
    m => { m.firmware.files[0].downloadUrl = m.firmware.files[0].downloadUrl.replace('/ekko-cardputer-adv-stock-lan/', '/another-repository/') },
    m => { m.firmware.files[0].downloadUrl = m.firmware.files[0].downloadUrl.replace(m.firmware.releaseLabel, 'v0.0.0-wrong') },
    m => { m.firmware.files[0].downloadUrl = m.firmware.files[0].downloadUrl.replace(m.firmware.files[0].downloadAsset, 'different.bin') },
    m => { m.firmware.files[0].downloadAsset = 'nested/application.bin' },
    m => { m.firmware.files[0].downloadAsset = 'application%2ebin' },
    m => { m.firmware.files[0].downloadUrl += '?download=1' },
    m => { m.firmware.files[0].downloadUrl += '#fragment' },
    m => { m.firmware.source.releaseUrl = m.firmware.source.releaseUrl.replace(m.firmware.releaseLabel, 'v0.0.0-wrong') },
  ]) {
    Object.assign(f.manifest, structuredClone(original)); mutate(f.manifest); await f.save()
    await assert.rejects(loadOverview(f.root))
  }
  // Schema compatibility only: these fixtures never claim a remote URL exists.
  Object.assign(f.manifest, structuredClone(original))
  delete f.manifest.firmware.files[0].downloadAsset
  const repo = new URL(f.manifest.firmware.source.repository).pathname
  f.manifest.firmware.files[0].downloadUrl = `https://raw.githubusercontent.com${repo}/${f.manifest.firmware.source.commit}/firmware/application.bin`
  await f.save(); assert.equal((await loadOverview(f.root)).artifactVerified, true)
  f.manifest.firmware.files[0].downloadUrl = f.manifest.firmware.files[0].downloadUrl.replace(f.manifest.firmware.source.commit, 'main')
  await f.save(); await assert.rejects(loadOverview(f.root))
})

test('filesystem errors do not expose local absolute paths', async t => {
  const f = await fixture(t)
  f.manifest.firmware.files[0].path = 'firmware/missing.bin'; await f.save()
  await assert.rejects(loadOverview(f.root), error => !error.message.includes(f.root) && /无法读取/.test(error.message))
})

test('bundled source archive has exact bytes/hash and a same-release safe download identity', async t => {
  const f = await fixture(t), original = structuredClone(f.manifest)
  const archive = f.manifest.firmware.source.archive
  assert(archive)
  for (const mutate of [
    m => { m.firmware.source.archive.bytes++ },
    m => { m.firmware.source.archive.sha256 = '0'.repeat(64) },
    m => { m.firmware.source.archive.path = '../source.tar.gz' },
    m => { m.firmware.source.archive.downloadAsset = 'nested/source.tar.gz' },
    m => { m.firmware.source.archive.downloadAsset = 'source%2Etar.gz' },
    m => { m.firmware.source.archive.downloadUrl = m.firmware.source.archive.downloadUrl.replace(m.firmware.releaseLabel, 'wrong-tag') },
    m => { m.firmware.source.archive.downloadUrl = m.firmware.source.archive.downloadUrl.replace(m.firmware.source.archive.downloadAsset, 'wrong-source.tar.gz') },
  ]) {
    Object.assign(f.manifest, structuredClone(original)); mutate(f.manifest); await f.save()
    await assert.rejects(loadOverview(f.root))
  }
  Object.assign(f.manifest, structuredClone(original)); delete f.manifest.firmware.source.archive; await f.save()
  assert.equal((await loadOverview(f.root)).artifactVerified, true) // Old catalogs remain supported.
})
