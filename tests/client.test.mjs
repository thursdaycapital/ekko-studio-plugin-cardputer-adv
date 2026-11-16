import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { mount } from '../client.mjs'

// Minimal DOM test double for exercising the public mount/RPC boundary in Node.
// Browser layout, sandbox and accessibility checks remain in browser.test.mjs.
class Element {
  constructor(tag, ownerDocument) {
    this.tagName = tag
    this.ownerDocument = ownerDocument
    this.children = []
    this.attributes = new Map()
    this.listeners = new Map()
    this.dataset = {}
    this.value = ''
    this.text = ''
  }
  set textContent(value) { this.text = String(value); this.replaceChildren() }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('') }
  setAttribute(name, value) { this.attributes.set(name, value) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  append(...nodes) {
    for (const node of nodes) { node.remove(); node.parent = this; this.children.push(node) }
  }
  prepend(...nodes) {
    for (const node of [...nodes].reverse()) { node.remove(); node.parent = this; this.children.unshift(node) }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parent = null
    this.children = []
    this.append(...nodes)
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1)
    this.parent = null
  }
  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set())
    this.listeners.get(name).add(handler)
  }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler) }
  find(predicate) {
    if (predicate(this)) return this
    for (const child of this.children) { const found = child.find(predicate); if (found) return found }
  }
  querySelector(selector) {
    assert.equal(selector, '[data-binding]')
    return this.find(node => node.dataset.binding !== undefined) ?? null
  }
  async click() {
    for (const handler of this.listeners.get('click') ?? []) await handler({ preventDefault() {} })
  }
  async change() {
    for (const handler of this.listeners.get('change') ?? []) await handler({ preventDefault() {} })
  }
}

async function mountedClient({ view = 'preferences', failure, failOn = 'save-settings', overview,
  usbInfo = { available: true, reason: '', hostPlatform: 'fixture-server' }, usbPorts = [], usbJob, confirm = true, rpc, plugin, locale = 'zh-CN' }, verify) {
  overview ??= { ...JSON.parse(await readFile(new URL('../firmware/release.json', import.meta.url), 'utf8')), artifactVerified: true }
  const doc = {
    createElement(tag) { return new Element(tag, doc) },
    createTextNode(text) { const node = new Element('#text', doc); node.textContent = text; return node },
  }
  const root = doc.createElement('root')
  const calls = []
  const confirmations = []
  const controller = new AbortController()
  const dispose = await mount(root, {
    view, locale, plugin, signal: controller.signal, lifecycle: { add() {} },
    ui: { navigate() { assert.fail('no navigation expected') }, async confirm(message) { confirmations.push(message); return typeof confirm === 'function' ? confirm(message) : confirm } },
    rpc: { async call(name, input) {
      calls.push({ name, input })
      if (name === failOn) throw failure
      if (rpc) { const result = await rpc(name, input); if (result !== undefined) return result }
      if (name === 'get-overview') return structuredClone(overview)
      if (name === 'list-devices') return { devices: [], modelVerified: false }
      if (name === 'get-settings') return { deviceOrigin: '', preferredDeviceId: '' }
      if (name === 'usb-info') return structuredClone(usbInfo)
      if (name === 'usb-list-ports') return { ports: structuredClone(usbPorts) }
      if (name === 'usb-start-update') return structuredClone(usbJob)
      assert.fail(`unexpected RPC ${name}`)
    } },
  })
  try { await verify(root, calls, { controller, dispose, confirmations }) } finally { dispose() }
  assert.equal(root.children.length, 0)
}

test('client exports an SDK mount function without needing DOM or network at import', () => {
  assert.equal(typeof mount, 'function')
})

const usbPort = { id: 'opaque-fixture-port', label: 'Fixture USB <img src=x>', vendorId: '303a', productId: '1001' }
const usbJob = (phase = 'queued', fields = {}) => ({
  id: 'fixture-job-1', phase, progress: 0, message: 'Fixture update', createdAt: 1, updatedAt: 2,
  canCancel: ['queued', 'opening', 'checking', 'backing-up'].includes(phase), backupSaved: false,
  applicationVerified: false, preservedRegionsVerified: false, resetConfirmed: false, resultUnknown: false, errorCode: '', ...fields,
})
const findButton = (root, label) => root.find(node => node.tagName === 'button' && node.textContent === label)
const defaultVisibleText = node => node.hidden || node.tagName === 'style' ? '' : node.tagName === 'details' && !node.open ? defaultVisibleText(node.children[0]) : node.text + node.children.map(defaultVisibleText).join('')
async function prepareUsb(root) {
  await findButton(root, '扫描 USB 设备').click()
  const port = root.find(node => node.tagName === 'select')
  port.value = usbPort.id
  await port.change()
  const board = root.find(node => node.tagName === 'input' && node.type === 'checkbox')
  board.checked = true
  await board.change()
}

test('USB mount checks server capability without scanning or opening a device', async () => {
  await mountedClient({ view: 'firmware' }, async (root, calls) => {
    assert.deepEqual(calls, [{ name: 'get-overview', input: null }, { name: 'usb-info', input: null }])
    assert.match(root.textContent, /数据线接到运行 Studio 的电脑/)
    assert.match(root.textContent, /使用 NAS 版 Studio/)
    assert.match(root.textContent, /扫描结果两分钟有效，过期请重新扫描/)
    assert.equal(findButton(root, '升级固件').disabled, true)
    assert.equal(findButton(root, '刷新任务状态')?.hidden, true)
    assert.equal(findButton(root, '取消任务').hidden, true)
  })
  await mountedClient({ view: 'firmware', usbInfo: { available: false, reason: 'Fixture dependency missing', hostPlatform: 'fixture-nas' } }, async (root, calls) => {
    assert.match(root.textContent, /Fixture dependency missing/)
    assert.equal(findButton(root, '扫描 USB 设备').disabled, true)
    assert.equal(findButton(root, '升级固件').disabled, true)
    assert.equal(calls.length, 2)
  })
})

test('USB capability errors preserve firmware metadata and offer explicit retry without scanning', async () => {
  await mountedClient({ view: 'firmware', failOn: 'usb-info', failure: new Error('API Error 503: Fixture USB service unavailable') }, async (root, calls) => {
    assert.match(root.textContent, /Fixture USB service unavailable/)
    assert.doesNotMatch(root.textContent, /API Error 503:/)
    assert.match(root.textContent, /SHA-256/)
    assert.equal(findButton(root, '扫描 USB 设备').disabled, true)
    assert.equal(findButton(root, '重试').disabled, false)
    assert.deepEqual(calls.map(call => call.name), ['get-overview', 'usb-info'])
  })
})

test('USB requires opaque scanned port, board acknowledgement and SDK confirmation; cancellation writes nothing', async () => {
  await mountedClient({ view: 'firmware', usbPorts: [usbPort], confirm: false }, async (root, calls, { confirmations }) => {
    await prepareUsb(root)
    await findButton(root, '升级固件').click()
    assert.equal(confirmations.length, 1)
    assert.match(confirmations[0], /仅更新 Ekko 应用，原厂工具和设备设置会保留/)
    assert.match(confirmations[0], /版本: v[0-9]/)
    assert.doesNotMatch(confirmations[0], /SHA-256: [a-f0-9]{64}/)
    assert.match(confirmations[0], /私有完整备份/)
    assert.match(confirmations[0], /中断不会自动回滚/)
    assert.equal(calls.filter(call => call.name === 'usb-start-update').length, 0)
    assert.equal(findButton(root, '升级固件').disabled, false)
  })
})

test('USB confirmation and submission each exclude duplicate clicks; committed job disables new work', async () => {
  let releaseConfirm, releaseStart
  const confirming = new Promise(resolve => { releaseConfirm = resolve })
  const starting = new Promise(resolve => { releaseStart = resolve })
  await mountedClient({ view: 'firmware', usbPorts: [usbPort], confirm: () => confirming,
    rpc: async name => name === 'usb-start-update' ? starting : undefined }, async (root, calls, { confirmations }) => {
    await prepareUsb(root)
    const start = findButton(root, '升级固件')
    const pending = start.click()
    await start.click()
    assert.equal(confirmations.length, 1)
    assert.equal(calls.filter(call => call.name === 'usb-start-update').length, 0)
    releaseConfirm(true)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    assert.equal(start.disabled, true)
    await start.click()
    assert.equal(calls.filter(call => call.name === 'usb-start-update').length, 1)
    const input = calls.find(call => call.name === 'usb-start-update').input
    assert.equal(input.portId, usbPort.id)
    assert.equal(input.boardConfirmed, true)
    assert.match(input.requestId, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i)
    assert.equal(Object.hasOwn(input, 'userId'), false)
    releaseStart(usbJob('writing', { progress: 60, backupSaved: true }))
    await pending
    assert.equal(start.disabled, true)
    assert.equal(findButton(root, '扫描 USB 设备').disabled, true)
    assert.equal(findButton(root, '取消任务').disabled, true)
  })
})

test('unknown USB submission never retries until explicit current-job lookup, then requires another manual confirmation', async () => {
  let fail = true
  await mountedClient({ view: 'firmware', usbPorts: [usbPort], usbJob: usbJob(), rpc: async name => {
    if (name === 'usb-start-update' && fail) throw new Error('API Error 503: Fixture response lost')
  } }, async (root, calls, { confirmations }) => {
    await prepareUsb(root)
    const start = findButton(root, '升级固件')
    await start.click()
    assert.match(root.textContent, /提交结果未确认/)
    assert.match(root.textContent, /Fixture response lost/)
    assert.doesNotMatch(root.textContent, /API Error 503:/)
    assert.equal(start.disabled, true)
    await start.click()
    assert.equal(calls.filter(call => call.name === 'usb-start-update').length, 1)
    fail = false
    await findButton(root, '刷新任务状态').click()
    assert.match(root.textContent, /未发现已提交的任务/)
    assert.equal(calls.filter(call => call.name === 'usb-start-update').length, 1)
    await start.click()
    assert.equal(confirmations.length, 2)
    assert.equal(calls.filter(call => call.name === 'usb-start-update').length, 2)
  })
})

test('USB currentJob remount resumes observation without scanning, starting or cancellation', async () => {
  await mountedClient({ view: 'firmware', usbInfo: { available: true, reason: '', hostPlatform: 'fixture', currentJob: usbJob('backing-up') } }, async (root, calls) => {
    assert.match(root.textContent, /正在备份/)
    assert.equal(findButton(root, '升级固件').disabled, true)
    assert.equal(findButton(root, '取消任务').disabled, false)
    assert.deepEqual(calls.map(call => call.name), ['get-overview', 'usb-info'])
  })
})

test('USB disposal while confirmation is pending prevents start; closing a submitted update does not cancel it', async () => {
  let release
  const confirm = new Promise(resolve => { release = resolve })
  await mountedClient({ view: 'firmware', usbPorts: [usbPort], confirm: () => confirm }, async (root, calls, { controller }) => {
    await prepareUsb(root)
    const pending = findButton(root, '升级固件').click()
    controller.abort()
    release(true)
    await pending
    assert.equal(calls.some(call => call.name === 'usb-start-update'), false)
    assert.equal(calls.some(call => call.name === 'usb-cancel-update'), false)
  })
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture', currentJob: usbJob('writing') } }, async (_root, calls, { controller }) => {
    controller.abort()
    assert.equal(calls.some(call => call.name === 'usb-cancel-update'), false)
  })
})

test('USB completion describes verification only, and incomplete or unknown results never claim success', async () => {
  for (const [job, success] of [
    [usbJob('completed', { progress: 100, backupSaved: true, applicationVerified: true, preservedRegionsVerified: true, resetConfirmed: true }), true],
    [usbJob('completed', { progress: 100, backupSaved: true, applicationVerified: true }), false],
    [usbJob('failed', { resultUnknown: true, errorCode: 'fixture-write-interrupted' }), false],
  ]) await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture', currentJob: job } }, async root => {
    assert.equal(root.textContent.includes('固件升级完成，原厂工具和设置已保留。'), success)
    assert.doesNotMatch(root.textContent, /启动成功|语音已通过/)
    if (success) assert.match(root.textContent, /请在 M5 原厂菜单选择 EkkoStudio/)
    if (job.resultUnknown) assert.equal(findButton(root, '升级固件').disabled, true)
  })
})

test('unknown terminal results need explicit recheck confirmation before a fresh scan and board acknowledgement', async () => {
  const unknownJob = usbJob('failed', { resultUnknown: true, backupSaved: true, errorCode: 'USB_VERIFY_FAILED' })
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture', currentJob: unknownJob }, usbPorts: [usbPort], confirm: false }, async (root, calls, { confirmations }) => {
    assert.equal(findButton(root, '升级固件').disabled, true)
    await findButton(root, '重新核对并扫描').click()
    assert.equal(confirmations.length, 1)
    assert.match(confirmations[0], /结果仍未知/)
    assert.match(confirmations[0], /G0 下载模式/)
    assert.match(confirmations[0], /私有备份/)
    assert.match(confirmations[0], /不自动重试/)
    assert.equal(calls.some(call => call.name === 'usb-list-ports'), false)
    assert.equal(findButton(root, '升级固件').disabled, true)
  })
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture', currentJob: unknownJob }, usbPorts: [usbPort], usbJob: usbJob('queued', { id: 'fixture-job-2' }) }, async (root, calls, { confirmations }) => {
    await findButton(root, '重新核对并扫描').click()
    assert.equal(calls.filter(call => call.name === 'usb-list-ports').length, 1)
    assert.equal(calls.some(call => call.name === 'usb-start-update'), false)
    const port = root.find(node => node.tagName === 'select')
    const board = root.find(node => node.tagName === 'input' && node.type === 'checkbox')
    assert.equal(port.value, '')
    assert.equal(board.checked, false)
    assert.equal(findButton(root, '升级固件').disabled, true)
    assert.match(root.textContent, /上次更新结果仍未知/)
    port.value = usbPort.id; await port.change()
    board.checked = true; await board.change()
    await findButton(root, '升级固件').click()
    assert.equal(confirmations.length, 2, 'rescanning never replaces the final flash confirmation')
    assert.equal(calls.filter(call => call.name === 'usb-start-update').length, 1)
    assert.match(root.textContent, /上次更新结果仍未知/, 'a new task does not erase the previous unknown-result warning')
  })
})

test('recheck cannot bypass the server physical lock and cannot scan after its confirmation view is disposed', async () => {
  const unknownJob = usbJob('failed', { resultUnknown: true, backupSaved: true, errorCode: 'USB_CLOSE_UNCONFIRMED' })
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture', currentJob: unknownJob }, usbPorts: [usbPort], failOn: 'usb-start-update', failure: new Error('API Error 500: USB_BUSY') }, async (root, calls) => {
    await findButton(root, '重新核对并扫描').click()
    const port = root.find(node => node.tagName === 'select')
    const board = root.find(node => node.tagName === 'input' && node.type === 'checkbox')
    port.value = usbPort.id; await port.change(); board.checked = true; await board.change()
    await findButton(root, '升级固件').click()
    assert.match(root.textContent, /USB_BUSY/)
    assert.match(root.textContent, /上次更新结果仍未知/)
    assert.equal(findButton(root, '升级固件').disabled, true)
    assert.equal(calls.filter(call => call.name === 'usb-start-update').length, 1)
  })
  let release
  const pending = new Promise(resolve => { release = resolve })
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture', currentJob: unknownJob }, confirm: () => pending }, async (root, calls, { controller }) => {
    const action = findButton(root, '重新核对并扫描').click()
    controller.abort(); release(true); await action
    assert.equal(calls.some(call => call.name === 'usb-list-ports'), false)
    assert.equal(calls.some(call => call.name === 'usb-start-update'), false)
  })
})

test('USB polls serially, stops on terminal state and never cancels when disposed', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let release, statusCalls = 0
  const statusResponse = new Promise(resolve => { release = resolve })
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture', currentJob: usbJob('writing') }, rpc: async name => {
    if (name === 'usb-update-status') { ++statusCalls; return statusResponse }
  } }, async (root, calls, { controller }) => {
    t.mock.timers.tick(2000)
    assert.equal(statusCalls, 1)
    t.mock.timers.tick(6000)
    assert.equal(statusCalls, 1, 'a pending status read is never overlapped')
    release(usbJob('completed', { backupSaved: true, applicationVerified: true, preservedRegionsVerified: true }))
    await new Promise(resolve => setImmediate(resolve))
    assert.match(root.textContent, /固件升级完成，原厂工具和设置已保留/)
    t.mock.timers.tick(600_000)
    assert.equal(statusCalls, 1)
    controller.abort()
    assert.equal(calls.some(call => call.name === 'usb-cancel-update'), false)
  })
})

test('USB observation has a hard time budget, supports explicit refresh, and clears its timer on exit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture', currentJob: usbJob('checking') }, rpc: async name => name === 'usb-update-status' ? usbJob('checking') : undefined }, async (root, calls, { controller }) => {
    t.mock.timers.tick(600_000)
    await new Promise(resolve => setImmediate(resolve))
    assert.match(root.textContent, /页面观察已暂停/)
    const reads = calls.filter(call => call.name === 'usb-update-status').length
    t.mock.timers.tick(600_000)
    assert.equal(calls.filter(call => call.name === 'usb-update-status').length, reads)
    await findButton(root, '刷新任务状态').click()
    t.mock.timers.tick(2000)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(calls.filter(call => call.name === 'usb-update-status').length, reads + 1)
    controller.abort()
    const count = calls.length
    t.mock.timers.tick(600_000)
    assert.equal(calls.length, count)
  })
})

test('late USB status responses cannot repopulate a disposed view or schedule another poll', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let release
  const pending = new Promise(resolve => { release = resolve })
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture', currentJob: usbJob('writing') }, rpc: async name => name === 'usb-update-status' ? pending : undefined }, async (root, calls, { controller }) => {
    t.mock.timers.tick(2000)
    assert.equal(calls.filter(call => call.name === 'usb-update-status').length, 1)
    controller.abort()
    release(usbJob('verifying', { progress: 90 }))
    await new Promise(resolve => setImmediate(resolve))
    t.mock.timers.tick(20_000)
    assert.equal(root.children.length, 0)
    assert.equal(calls.filter(call => call.name === 'usb-update-status').length, 1)
    assert.equal(calls.some(call => call.name === 'usb-cancel-update'), false)
  })
})

test('already-aborted mount leaves the supplied root unchanged and makes no SDK calls', async () => {
  const signal = AbortSignal.abort()
  let writes = 0
  const root = {
    ownerDocument: { createElement: () => ({ setAttribute() {} }) },
    append() { writes++ },
  }
  const fail = () => assert.fail('an aborted mount must not call the host')
  const dispose = await mount(root, { signal, view: 'devices', locale: 'zh-CN', lifecycle: { add: fail }, rpc: { call: fail }, ui: { navigate: fail } })
  assert.equal(writes, 0)
  dispose()
  dispose()
  assert.equal(writes, 0)
})

test('client remains self-contained and cannot silently add a network or parent-DOM path', async () => {
  const source = (await readFile(new URL('../client.mjs', import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(source, /\bimport\s*(?:\(|['"{*])/, 'runtime imports violate the single-file sandbox bundle')
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|navigator\s*\.\s*serial|window\s*\.\s*parent/, 'direct transport and parent access are forbidden')
  assert.doesNotMatch(source, /\.innerHTML\s*=|\.outerHTML\s*=/, 'host-provided device names must be rendered as text')
})

test('guide uses optional bundled capabilities without requiring plugin preferences for native pairing', async () => {
  const overview = { ...JSON.parse(await readFile(new URL('../firmware/release.json', import.meta.url), 'utf8')), artifactVerified: true }
  delete overview.capabilities.explicitAgentModes; delete overview.capabilities.shortG0Returns
  await mountedClient({ view: 'guide', overview }, async (root, calls) => {
    assert.match(root.textContent, /完成一次绑定/)
    assert.match(root.textContent, /已有有效绑定可跳过/)
    assert.doesNotMatch(root.textContent, /首页选择并保存 Studio模型/)
    assert.deepEqual(calls, [{ name: 'get-overview', input: null }])
  })
  overview.capabilities.explicitAgentModes = true; overview.capabilities.shortG0Returns = true
  await mountedClient({ view: 'guide', overview }, async root => {
    assert.match(root.textContent, /首页选择并保存 Studio模型／原生CLI/)
    assert.match(root.textContent, /首页短按回原厂，长按说话/)
  })
})

test('firmware keeps upgrade primary and source/checksum details collapsed without acceptance telemetry', async () => {
  const overview = { ...JSON.parse(await readFile(new URL('../firmware/release.json', import.meta.url), 'utf8')), artifactVerified: true }
  overview.firmware.version = 'synthetic-future-release'
  overview.firmware.files[0].bytes = 123456
  overview.pluginSdk.firmwareOnThisHostPhysicallyValidated = false
  overview.firmware.validation.allAgentsPhysicallyValidated = false
  overview.firmware.validation.fullMatrixComplete = false
  await mountedClient({ view: 'firmware', overview }, async root => {
    const advanced = root.find(node => node.tagName === 'details')
    assert(advanced)
    assert.notEqual(advanced.open, true)
    assert.equal(advanced.children[0].tagName, 'summary')
    assert.equal(advanced.children[0].textContent, '高级与开源信息')
    assert.match(advanced.textContent, /synthetic-future-release/)
    assert.match(advanced.textContent, /123,456/)
    assert.match(advanced.textContent, /第三方许可与重新链接说明/)
    assert.equal(advanced.find(node => node.getAttribute?.('aria-label') === 'SHA-256').value, overview.firmware.files[0].sha256)
    assert.doesNotMatch(root.textContent, /文字实机记录|语音实机记录|SDK 基线|实体测试|用户已确认|本版自动截止|1 \/ 16/)
    assert.doesNotMatch(defaultVisibleText(root), /SHA-256|0x10000|fixture-server/)
    assert.match(root.textContent, /预览版/)
    assert(findButton(root, '升级固件'))
  })
})

test('unpublished release links stay hidden while bundled source and LAN limitations remain accessible', async () => {
  const overview = { ...JSON.parse(await readFile(new URL('../firmware/release.json', import.meta.url), 'utf8')), artifactVerified: true }
  overview.firmware.publication = 'draft'
  delete overview.firmware.source.releaseUrl
  delete overview.firmware.source.archive.downloadUrl
  delete overview.firmware.source.archive.downloadAsset
  await mountedClient({ view: 'firmware', overview }, async root => {
    assert.match(root.textContent, /完整固件源码随安装包提供/)
    assert.doesNotMatch(root.textContent, /Release 尚未公开|凭证过期自动恢复|实体测试已按用户要求暂停|undefined/)
    assert.ok(!root.find(node => node.getAttribute?.('aria-label') === '发布页地址'))
    assert.ok(!root.find(node => node.getAttribute?.('aria-label') === '包内源码文件'))
  })
  await mountedClient({ view: 'guide', overview }, async root => {
    assert.match(root.textContent, /当前固件不支持跨网远程/)
    assert.match(root.textContent, /电脑需要保持开机/)
  })
})

test('save RPC displays the actual validation reason without the SDK HTTP envelope', async () => {
  const reason = '仅接受私有 IPv4 或 .local 设备地址'
  await mountedClient({ failure: new Error(`API Error 500: ${reason}`) }, async (root, calls) => {
    const address = root.find(node => node.tagName === 'input')
    address.value = 'https://example.com'
    await root.find(node => node.tagName === 'button' && node.textContent === '保存设置').click()
    assert.deepEqual(calls.at(-1), { name: 'save-settings', input: { deviceOrigin: 'https://example.com', preferredDeviceId: '' } })
    assert.equal(root.find(node => node.attributes.get('role') === 'alert').textContent, `保存失败，修改仍保留在表单中。 ${reason}`)
    assert.equal(address.value, 'https://example.com', 'failed draft stays available for correction')
  })
})

test('load RPC unwraps only a leading 400–599 SDK envelope with a nonempty reason', async (t) => {
  const examples = [
    ['API Error 403: 当前账号没有权限', '当前账号没有权限'],
    ['API Error 599: 后台暂时不可用\n请稍后重试', '后台暂时不可用\n请稍后重试'],
    ['Fixture host offline', 'Fixture host offline'],
    ['API Error 500:   ', 'API Error 500:   '],
    ['API Error 200: unexpected status', 'API Error 200: unexpected status'],
    ['Request failed: API Error 500: upstream issue', 'Request failed: API Error 500: upstream issue'],
    ['API Error 5000: unknown response', 'API Error 5000: unknown response'],
  ]
  for (const [input, expected] of examples) await t.test(input, async () => {
    await mountedClient({ view: 'firmware', failOn: 'get-overview', failure: new Error(input) }, async root => {
      assert.equal(root.find(node => node.attributes.get('role') === 'alert').textContent, expected)
    })
  })
})


test('product image accepts only supported host data icons and falls back to its text identity', async () => {
  const icon = 'data:image/png;base64,AAAA'
  await mountedClient({ view: 'guide', plugin: { icon } }, async root => {
    const image = root.find(node => node.tagName === 'img')
    assert.equal(image.src, icon)
    assert.equal(image.alt, 'M5Stack Cardputer-Adv')
    for (const handler of image.listeners.get('error') ?? []) handler()
    assert.equal(root.find(node => node.tagName === 'img'), undefined)
    assert.match(root.textContent, /M5Stack Cardputer-Adv/)
  })
  for (const icon of ['https://example.com/icon.png', '/assets/icon.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,?invalid', undefined]) {
    await mountedClient({ view: 'guide', plugin: { icon } }, async root => {
      assert.equal(root.find(node => node.tagName === 'img'), undefined)
      assert.match(root.textContent, /M5Stack Cardputer-Adv/)
    })
  }
})


test('USB keeps readable failure reasons visible and hides internal progress, code and platform details', async () => {
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture-server', currentJob: usbJob('backing-up', { message: 'ROM 0x10000 internal progress' }) } }, async root => {
    assert.match(defaultVisibleText(root), /正在备份/)
    assert.doesNotMatch(defaultVisibleText(root), /ROM|0x10000|fixture-server/)
  })
  const reason = '原厂或设置区域核对失败；已保留私有备份，没有请求重启。'
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture-server', currentJob: usbJob('failed', { errorCode: 'FUTURE_USB_ERROR', message: reason }) } }, async root => {
    assert.match(defaultVisibleText(root), /原厂或设置区域核对失败/)
    assert.doesNotMatch(defaultVisibleText(root), /FUTURE_USB_ERROR|fixture-server/)
    assert.match(root.find(node => node.tagName === 'details').textContent, /FUTURE_USB_ERROR|fixture-server/)
  })
  await mountedClient({ view: 'firmware', usbInfo: { available: true, hostPlatform: 'fixture-server', currentJob: usbJob('failed', { errorCode: 'FUTURE_USB_ERROR', message: '' }) } }, async root => {
    assert.match(defaultVisibleText(root), /未收到具体错误原因/)
    assert.match(root.find(node => node.tagName === 'details').textContent, /FUTURE_USB_ERROR/)
  })
})
