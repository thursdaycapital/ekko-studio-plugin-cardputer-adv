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
}

async function mountedClient({ view = 'preferences', failure, failOn = 'save-settings', overview }, verify) {
  overview ??= { ...JSON.parse(await readFile(new URL('../firmware/release.json', import.meta.url), 'utf8')), artifactVerified: true }
  const doc = {
    createElement(tag) { return new Element(tag, doc) },
    createTextNode(text) { const node = new Element('#text', doc); node.textContent = text; return node },
  }
  const root = doc.createElement('root')
  const calls = []
  const controller = new AbortController()
  const dispose = await mount(root, {
    view, locale: 'zh-CN', signal: controller.signal, lifecycle: { add() {} },
    ui: { navigate() { assert.fail('no navigation expected') } },
    rpc: { async call(name, input) {
      calls.push({ name, input })
      if (name === failOn) throw failure
      if (name === 'get-overview') return structuredClone(overview)
      if (name === 'list-devices') return { devices: [], modelVerified: false }
      if (name === 'get-settings') return { deviceOrigin: '', preferredDeviceId: '' }
      assert.fail(`unexpected RPC ${name}`)
    } },
  })
  try { await verify(root, calls) } finally { dispose() }
  assert.equal(root.children.length, 0)
}

test('client exports an SDK mount function without needing DOM or network at import', () => {
  assert.equal(typeof mount, 'function')
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
    assert.match(root.textContent, /插件是可选的管理入口/)
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

test('firmware details display the bundled version and recorded validation state', async () => {
  const overview = { ...JSON.parse(await readFile(new URL('../firmware/release.json', import.meta.url), 'utf8')), artifactVerified: true }
  overview.firmware.version = 'synthetic-future-release'
  overview.firmware.files[0].bytes = 123456
  overview.pluginSdk.firmwareOnThisHostPhysicallyValidated = true
  overview.firmware.validation.allAgentsPhysicallyValidated = true
  overview.firmware.validation.fullMatrixComplete = true
  await mountedClient({ view: 'firmware', overview }, async root => {
    assert.match(root.textContent, /synthetic-future-release/)
    assert.match(root.textContent, /123,456/)
    assert.doesNotMatch(root.textContent, /此 SDK 宿主版本尚未完成|16 Agent 尚未逐一|完整恢复与异常测试矩阵尚未完成/)
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
