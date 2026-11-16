import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contract } from '../lib/backend.mjs'
import { validateModel } from '../sdk/harness/contracts.mjs'
import { readFile } from 'node:fs/promises'

test('declared public operations and stored settings share the official contract models', () => {
  assert.deepEqual(Object.keys(contract.rpc).sort(), ['get-overview', 'get-settings', 'list-devices', 'save-settings', 'usb-cancel-update', 'usb-info', 'usb-list-ports', 'usb-start-update', 'usb-update-status'])
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


test('USB mutations require explicit board confirmation and private jobs have no backup bytes', () => {
  const input = { portId: 'opaque-selected-port', requestId: '8b017df6-89f9-4736-91db-fd2aca75d806', firmwareSha256: 'a'.repeat(64), boardConfirmed: true }
  assert.deepEqual(validateModel(contract, 'usbStartInput', input), input)
  assert.throws(() => validateModel(contract, 'usbStartInput', { ...input, boardConfirmed: false }), /not in enum/)
  assert.throws(() => validateModel(contract, 'usbStartInput', { ...input, path: '/dev/arbitrary' }), /unknown property path/)
  assert.deepEqual(Object.keys(contract.models.usbJob.properties).sort(), ['applicationVerified', 'backupSaved', 'canCancel', 'createdAt', 'errorCode', 'id', 'message', 'phase', 'preservedRegionsVerified', 'progress', 'resetConfirmed', 'resultUnknown', 'updatedAt'])
})
