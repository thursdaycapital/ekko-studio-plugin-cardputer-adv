import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Optional integration against an explicitly supplied, unchanged official checkout.
// Runtime plugin entries never import host internals; only this test does.
const hostRoot = process.env.EKKO_STUDIO_ROOT
test('official installer + PluginRuntime load the release with caller-bound state and lifecycle', { skip: !hostRoot }, async t => {
  const requireHost = createRequire(path.join(hostRoot, 'package.json'))
  requireHost('ts-node').register({
    transpileOnly: true, skipProject: true,
    compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16', esModuleInterop: true },
  })
  const service = path.join(hostRoot, 'packages/server/src/modules/studio/services/plugins')
  const { installPackage } = requireHost(path.join(service, 'installer.ts'))
  const { PluginRuntime } = requireHost(path.join(service, 'runtime.ts'))
  const { PluginStore } = requireHost(path.join(service, 'store.ts'))
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cardputer-official-runtime-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const installed = await installPackage(path.join(temp, 'installed'), projectRoot)
  t.after(installed.dispose)
  assert.equal(installed.manifest.id, 'm5stack-cardputer-adv')
  assert.deepEqual([...installed.manifest.permissions].sort(), ['api.read', 'api.write', 'ui'])
  assert.equal(installed.manifest.views.length, 4)
  const activation = { userId: 100, profile: 'activation', surface: 'ui' }
  const caller = { userId: 7, profile: 'default', surface: 'ui' }
  const otherProfile = { ...caller, profile: 'other' }
  const otherUser = { ...caller, userId: 8 }
  const calls = [], logs = []
  let cancelledRequest
  const ports = {
    async authorize(identity) { assert.ok(Number.isSafeInteger(identity.userId) && identity.userId > 0) },
    async api(identity, route, options, signal) {
      assert.equal(route, '/api/mcu-devices')
      assert.equal(options.method ?? 'GET', 'GET')
      calls.push({ identity: { ...identity }, route })
      if (cancelledRequest) return cancelledRequest(signal)
      return { devices: [{ id: 3, name: 'M5Stack Cardputer-Adv', device_code: 'SYNTHETIC_PRIVATE_abcdef',
        is_official: false, created_at: 1, lan_connected: true, remote_connected: false,
        token: 'SYNTHETIC_SECRET_NEVER_RETURN' }] }
    },
    emit() {},
    log(_plugin, _identity, level, text) { logs.push({ level, text }) },
  }
  const record = { manifest: installed.manifest, directory: installed.directory, source: installed.source,
    installedAt: Date.now(), enabled: true, config: {}, runtimeIdentity: activation }
  const store = new PluginStore(path.join(temp, 'state'))
  let runtime = new PluginRuntime(record, activation, store, ports)
  t.after(() => runtime.close())
  await runtime.load(); runtime.activate()
  const invoke = (name, data, identity = caller, signal) => runtime.invoke('rpc', name, data, identity, signal)
  assert.deepEqual(await invoke('get-settings', null), { deviceOrigin: '', preferredDeviceId: '' })
  assert.deepEqual(await invoke('save-settings', { deviceOrigin: 'http://192.168.2.5/', preferredDeviceId: '3' }), { ok: true })
  assert.deepEqual(await invoke('get-settings', null), { deviceOrigin: 'http://192.168.2.5', preferredDeviceId: '3' })
  for (const identity of [activation, otherProfile, otherUser]) {
    assert.deepEqual(await invoke('get-settings', null, identity), { deviceOrigin: '', preferredDeviceId: '' })
  }
  const devices = await invoke('list-devices', null)
  assert.deepEqual(devices, { devices: [{ id: '3', name: 'M5Stack Cardputer-Adv', codeSuffix: 'abcdef',
    lanConnected: true, desktopRelayConnected: false, official: false }], modelVerified: false })
  assert.deepEqual(calls[0].identity, caller)
  assert.ok(!JSON.stringify(devices).includes('SYNTHETIC_PRIVATE'))
  assert.ok(!JSON.stringify(devices).includes('SYNTHETIC_SECRET'))
  const overview = await invoke('get-overview', null)
  assert.equal(overview.artifactVerified, true)
  const release = JSON.parse(await readFile(path.join(projectRoot, 'firmware/release.json'), 'utf8'))
  assert.deepEqual(overview.firmware, release.firmware)
  assert.deepEqual(overview.pluginSdk, release.pluginSdk)
  const controller = new AbortController()
  cancelledRequest = signal => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    controller.abort(new Error('synthetic cancellation'))
  })
  await assert.rejects(invoke('list-devices', null, caller, controller.signal), /synthetic cancellation/)
  cancelledRequest = undefined
  assert.ok(logs.every(entry => !entry.text.includes('SYNTHETIC_SECRET')))
  await runtime.close()
  assert.equal(runtime.rpc.size, 0)
  await assert.rejects(invoke('get-settings', null), /Plugin context has expired/)
  // A new official runtime, installed snapshot and store read the persisted preference.
  runtime = new PluginRuntime(record, activation, store, ports)
  await runtime.load(); runtime.activate()
  assert.deepEqual(await invoke('get-settings', null), { deviceOrigin: 'http://192.168.2.5', preferredDeviceId: '3' })
})
