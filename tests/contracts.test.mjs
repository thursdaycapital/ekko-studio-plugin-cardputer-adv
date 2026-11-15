import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contract } from '../lib/backend.mjs'
import { validateModel } from '../sdk/harness/contracts.mjs'
import { readFile } from 'node:fs/promises'

test('four public operations and stored settings share the official contract models', () => {
  assert.deepEqual(Object.keys(contract.rpc).sort(), ['get-overview', 'get-settings', 'list-devices', 'save-settings'])
  assert.equal(contract.rpc['save-settings'].input, contract.storage.settings.model)
  assert.equal(contract.rpc['get-settings'].output, contract.storage.settings.model)
  assert.deepEqual(validateModel(contract, 'settings', { deviceOrigin: '', preferredDeviceId: '' }), { deviceOrigin: '', preferredDeviceId: '' })
  assert.throws(() => validateModel(contract, 'settings', { greeting: 'Hello', compact: true }), /missing deviceOrigin/)
  assert.throws(() => validateModel(contract, 'saved', { ok: false }), /not in enum/)
  assert.throws(() => validateModel(contract, 'empty', {}), /expected null/)
})

test('optional interaction declarations default absent; explicit values and hardware claims stay typed', async () => {
  const release = JSON.parse(await readFile(new URL('../firmware/release.json', import.meta.url), 'utf8'))
  delete release.capabilities.explicitAgentModes; delete release.capabilities.shortG0Returns
  assert.deepEqual(validateModel(contract, 'release', release), release)
  release.capabilities.explicitAgentModes = true; release.capabilities.shortG0Returns = true
  release.pluginSdk.firmwareOnThisHostPhysicallyValidated = true
  assert.deepEqual(validateModel(contract, 'release', release), release)
  release.capabilities.shortG0Returns = 'yes'
  assert.throws(() => validateModel(contract, 'release', release), /expected boolean/)
})
