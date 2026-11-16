// Run separately: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
// CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chrome npm run test:browser
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

let browser, server, origin, source, overview, manifest
const consoles = []
const csp = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'"

function fixture() {
  const data = { overview, source, csp }
  const bootstrap = `
    const fixture = ${JSON.stringify(data).replaceAll('<', '\\u003c')};
    const module = await import(URL.createObjectURL(new Blob([fixture.source], {type:'text/javascript'})));
    const root = document.getElementById('root');
    let controller, dispose;
    const state = {
      calls: [], navigations: [], failures: {}, pending: {}, holds: [],
      overview: structuredClone(fixture.overview),
      settings: {deviceOrigin:'', preferredDeviceId:''},
      listing: {devices:[{id:'fixture-01',name:'Test MCU <img src=x onerror=alert(1)>',codeSuffix:'a1b2c3',lanConnected:true,desktopRelayConnected:false,official:false}],modelVerified:false},
      async open(view, locale='zh-CN') {
        if (controller) controller.abort();
        if (dispose) dispose();
        controller = new AbortController();
        const current = controller;
        const ctx = {
          locale, view, slot:view==='preferences'?'settings':'workspace',
          plugin:{id:'m5stack-cardputer-adv'},identity:{userId:1,profile:'test'},
          signal:current.signal, lifecycle:{add(fn){return fn}},
          rpc:{call:async(name,input)=>{
            state.calls.push({name,input});
            if(state.holds.includes(name)) await new Promise(resolve=>state.pending[name]=resolve);
            if(state.failures[name]) throw new Error(state.failures[name]);
            if(name==='get-overview') return structuredClone(state.overview);
            if(name==='list-devices') return structuredClone(state.listing);
            if(name==='get-settings') return structuredClone(state.settings);
            if(name==='save-settings') {
              state.settings={...input,deviceOrigin:input.deviceOrigin?new URL(input.deviceOrigin).origin:''};
              return {ok:true};
            }
            throw new Error('Unexpected RPC '+name);
          }},
          ui:{navigate(value){state.navigations.push(value)},notify(){throw new Error('Unexpected notification')}}
        };
        const result = await module.mount(root,ctx);
        if(current===controller) dispose=result;
        return true;
      },
      abort(){controller.abort()},
      release(name){state.holds=state.holds.filter(n=>n!==name);state.pending[name]?.();delete state.pending[name]},
    };
    window.__test=state;
    window.__ready=await state.open('devices');
  `
  const inner = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>:root{--text-primary:#202a29;--text-secondary:#596360;--text-muted:#707b77;--bg-card:#fbfaf5;--bg-secondary:#efeee6;--bg-input:#fffef9;--border-color:#c8cec4;--border-light:#dbe0d6;--accent-primary:#247368;--success:#2e7562;--error:#a8372d;--warning:#a67828;--font-family:'Georgia',serif;--font-size-base:14px;--line-height:1.6}body{margin:0;background:#f6f5ed}</style><div id="root"></div><script type="module">${bootstrap.replaceAll('</script', '<\\/script')}</script>`
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe title="Plugin sandbox" sandbox="allow-scripts" srcdoc="${inner.replaceAll('&','&amp;').replaceAll('"','&quot;')}"></iframe>`
}

before(async () => {
  source = await readFile(new URL('../client.mjs', import.meta.url), 'utf8')
  overview = { ...JSON.parse(await readFile(new URL('../firmware/release.json', import.meta.url), 'utf8')), artifactVerified: true }
  manifest = JSON.parse(await readFile(new URL('../plugin.json', import.meta.url), 'utf8'))
  const moduleId = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright'
  const imported = await import(moduleId)
  const chromium = imported.chromium ?? imported.default?.chromium
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) })
  server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(fixture())
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (browser) await browser.close()
  if (server) await new Promise(resolve => server.close(resolve))
})

async function pageFixture() {
  const page = await browser.newPage({ viewport: { width: 1080, height: 900 } })
  page.setDefaultTimeout(8000)
  page.on('pageerror', error => consoles.push(error.message))
  await page.goto(origin)
  const frame = page.frames().find(item => item !== page.mainFrame())
  await frame.waitForFunction(() => window.__ready === true)
  return { page, frame }
}

async function screenshot(page, name) {
  if (!process.env.BROWSER_ARTIFACT_DIR) return
  await mkdir(process.env.BROWSER_ARTIFACT_DIR, { recursive: true })
  await page.frames().find(frame => frame !== page.mainFrame()).evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.screenshot({ path: path.join(process.env.BROWSER_ARTIFACT_DIR, name), fullPage: true })
}

test('opaque sandbox loads devices; native and workspace navigation use SDK paths', async () => {
  const { page, frame } = await pageFixture()
  try {
    assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts')
    assert.equal(await frame.evaluate(() => window.origin), 'null')
    assert.equal((await frame.locator('thead').innerText()).trim(), '设备名称\t设备码末六位\t局域网\t电脑中继\t登记渠道')
    assert.match(await frame.locator('tbody').innerText(), /Test MCU <img src=x onerror=alert\(1\)>/)
    assert.equal(await frame.locator('tbody img').count(), 0)
    const cells = frame.locator('tbody .adv-state')
    assert.equal(await cells.nth(0).getAttribute('data-online'), 'true')
    assert.equal(await cells.nth(1).getAttribute('data-online'), 'false')
    assert.match(await frame.locator('main').innerText(), /不能证明 M5 正在走远程/)
    await frame.getByRole('button', { name: '打开原生设备管理', exact: true }).click()
    await frame.getByRole('button', { name: '固件', exact: true }).click()
    assert.deepEqual(await frame.evaluate(() => __test.navigations), ['/hermes/connections?tab=mcu', '/studio/plugins/m5stack-cardputer-adv/firmware'])
    await frame.evaluate(() => { __test.navigations=[] })
    const views = {devices:'设备',firmware:'固件',guide:'使用说明',preferences:'偏好设置'}
    for (const [id, label] of Object.entries(views)) {
      const declared = manifest.views.find(view => view.id === id)
      assert(declared, `missing manifest view ${id}`)
      await frame.getByRole('button', { name: label, exact: true }).click()
      const actual = await frame.evaluate(() => __test.navigations.at(-1))
      assert.equal(actual, `/studio/${declared.slot==='settings'?'plugin-settings':'plugins'}/m5stack-cardputer-adv/${id}`)
    }
    const calls = await frame.evaluate(() => __test.calls)
    assert(calls.every(call => call.input === null))
  } finally { await page.close() }
})

test('preferences preserve a failed draft, discard changes, save canonical origin, and select copy text', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(() => __test.open('preferences'))
    const address = frame.getByRole('textbox', { name: 'M5 设备地址', exact: true })
    await address.fill('http://cardputer.local/')
    await frame.getByRole('combobox', { name: '选择设备' }).selectOption('fixture-01')
    await frame.evaluate(() => __test.failures['save-settings']='API Error 500: Fixture storage unavailable')
    await frame.getByRole('button', { name: '保存设置', exact: true }).click()
    await frame.getByRole('alert').waitFor()
    assert.match(await frame.getByRole('alert').innerText(), /Fixture storage unavailable/)
    assert.doesNotMatch(await frame.getByRole('alert').innerText(), /API Error 500:/)
    assert.equal(await address.inputValue(), 'http://cardputer.local/')
    await frame.getByRole('button', { name: '撤销修改', exact: true }).click()
    assert.equal(await address.inputValue(), '')
    assert.equal(await frame.getByRole('combobox').inputValue(), '')
    assert.equal(await frame.evaluate(() => __test.calls.filter(c=>c.name==='save-settings').length), 1)
    await frame.evaluate(() => delete __test.failures['save-settings'])
    await address.fill('http://cardputer.local/')
    await frame.getByRole('combobox').selectOption('fixture-01')
    await frame.getByRole('button', { name: '保存设置', exact: true }).click()
    await frame.getByText('设置已保存', { exact: true }).waitFor()
    assert.equal(await address.inputValue(), 'http://cardputer.local')
    const native = frame.getByRole('textbox', { name: '设备原生管理页' })
    assert.equal(await native.inputValue(), 'http://cardputer.local/device')
    // Rebuilding the native URL on repeated saves keeps one binding section.
    await frame.getByRole('button', { name: '保存设置', exact: true }).click()
    await frame.getByText('设置已保存', { exact: true }).waitFor()
    assert.equal(await frame.locator('[data-binding]').count(), 1)
    assert.equal(await frame.getByRole('textbox', { name: '设备原生管理页' }).count(), 1)
    await frame.getByRole('button', { name: '选中文本' }).click()
    assert.deepEqual(await native.evaluate(node => [node.selectionStart,node.selectionEnd]), [0,'http://cardputer.local/device'.length])
    assert.match(await frame.locator('main').innerText(), /Ctrl\/Cmd\+C 手动复制/)
    assert.equal(await frame.locator('a[download],input[type=password]').count(), 0)
    await screenshot(page, 'preferences-saved-fixture-sandbox.png')
    await frame.evaluate(() => __test.open('devices'))
    await screenshot(page, 'devices-fixture-light-sandbox.png')
  } finally { await page.close() }
})

test('firmware and English guide render real metadata and remain usable on narrow screens', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(() => __test.open('firmware'))
    assert.match(await frame.locator('main').innerText(), /仅适用于既有双固件布局/)
    assert.match(await frame.locator('main').innerText(), /0x10000/)
    assert.match(await frame.locator('main').innerText(), /0x330000/)
    assert.equal(await frame.getByRole('textbox', { name: 'SHA-256', exact: true }).inputValue(), overview.firmware.files[0].sha256)
    assert.equal(await frame.getByRole('textbox', { name: '公开固定下载地址' }).inputValue(), overview.firmware.files[0].downloadUrl)
    if (overview.firmware.publication === 'draft') {
      assert.match(await frame.locator('main').innerText(), /Release 尚未公开/)
      assert.equal(await frame.getByRole('textbox', { name: '发布页地址', exact: true }).count(), 0)
      assert.equal(await frame.getByRole('textbox', { name: '包内源码文件', exact: true }).inputValue(), overview.firmware.source.archive.path)
      assert.equal(await frame.getByRole('textbox', { name: '源码 SHA-256', exact: true }).inputValue(), overview.firmware.source.archive.sha256)
    }
    assert((await frame.locator('main').innerText()).includes(`Studio ${overview.pluginSdk.hostVersion}`))
    assert.equal((await frame.locator('main').innerText()).includes('尚未完成 M5 实机验收'), !overview.pluginSdk.firmwareOnThisHostPhysicallyValidated)
    await screenshot(page, 'firmware-sandbox.png')
    await frame.evaluate(() => __test.open('guide', 'en-US'))
    assert.match(await frame.locator('main').innerText(), /Keyboard reference/)
    assert.match(await frame.locator('main').innerText(), /Fn \+ Space/)
    assert.match(await frame.locator('main').innerText(), /up to 5 seconds/)
    assert.match(await frame.locator('main').innerText(), /needs no SD card/)
    await page.setViewportSize({ width: 360, height: 780 })
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await frame.getByRole('button', { name: 'Preferences', exact: true }).isVisible(), true)
    await screenshot(page, 'guide-narrow-light-sandbox.png')
    await frame.evaluate(() => {
      const variables = {'--text-primary':'#e2e6dd','--text-secondary':'#b6c1b8','--text-muted':'#91a196','--bg-card':'#222e29','--bg-secondary':'#26362c','--bg-input':'#1e2b25','--border-color':'#56675d','--border-light':'#3a4c40','--accent-primary':'#84c6ad','--warning':'#d6ac66'}
      for (const [name,value] of Object.entries(variables)) document.documentElement.style.setProperty(name,value)
      document.body.style.background='#17241e'
    })
    await frame.evaluate(() => __test.open('devices', 'en-US'))
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await frame.locator('.adv').evaluate(node=>getComputedStyle(node).color), 'rgb(226, 230, 221)')
    await screenshot(page, 'devices-narrow-dark-fixture-sandbox.png')
  } finally { await page.close() }
})

test('guide and validation messages follow the bundled capabilities rather than a release number', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(async () => {
      __test.overview.firmware.version='synthetic-future-release'
      __test.overview.capabilities.explicitAgentModes=true
      __test.overview.capabilities.shortG0Returns=true
      __test.overview.pluginSdk.firmwareOnThisHostPhysicallyValidated=true
      __test.overview.firmware.validation.allAgentsPhysicallyValidated=true
      __test.overview.firmware.validation.fullMatrixComplete=true
      await __test.open('guide')
    })
    assert.match(await frame.locator('main').innerText(), /插件是可选的管理入口/)
    assert.match(await frame.locator('main').innerText(), /首页选择并保存 Studio模型／原生CLI/)
    assert.match(await frame.locator('main').innerText(), /首页短按回原厂，长按说话/)
    await frame.evaluate(() => __test.open('firmware'))
    assert.match(await frame.locator('main').innerText(), /synthetic-future-release/)
    assert.doesNotMatch(await frame.locator('main').innerText(), /此 SDK 宿主版本尚未完成|16 Agent 尚未逐一|完整恢复与异常测试矩阵尚未完成/)
    await frame.evaluate(async () => {
      delete __test.overview.capabilities.explicitAgentModes
      delete __test.overview.capabilities.shortG0Returns
      await __test.open('guide')
    })
    assert.doesNotMatch(await frame.locator('main').innerText(), /首页选择并保存 Studio模型／原生CLI|首页短按回原厂/)
    assert.match(await frame.locator('main').innerText(), /切换历史浏览/)
  } finally { await page.close() }
})

test('empty list, load failure and retry are visible; disposal ignores late RPC then remounts', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(async () => { __test.listing.devices=[]; await __test.open('devices') })
    assert.equal(await frame.getByText('还没有登记设备', { exact: true }).isVisible(), true)
    await screenshot(page, 'devices-empty-fixture-sandbox.png')
    await frame.evaluate(async () => { __test.failures['list-devices']='Fixture host offline'; await __test.open('devices') })
    assert.match(await frame.getByRole('alert').innerText(), /Fixture host offline/)
    await frame.evaluate(() => delete __test.failures['list-devices'])
    await frame.getByRole('button', { name: '重试', exact: true }).click()
    await frame.getByText('还没有登记设备', { exact: true }).waitFor()
    await frame.evaluate(() => { __test.holds.push('get-settings'); window.__pendingMount=__test.open('preferences') })
    await frame.getByText('正在读取 Studio…', { exact: true }).waitFor()
    await frame.evaluate(() => __test.abort())
    assert.equal(await frame.locator('#root').innerHTML(), '')
    await frame.evaluate(async () => { __test.release('get-settings'); await __pendingMount })
    assert.equal(await frame.locator('#root').innerHTML(), '')
    await frame.evaluate(() => __test.open('preferences'))
    assert.equal(await frame.getByRole('textbox', { name: 'M5 设备地址', exact: true }).isVisible(), true)
    // A pending write may complete in the host; it must not mutate a destroyed view.
    await frame.getByRole('textbox', { name: 'M5 设备地址', exact: true }).fill('http://cardputer.local')
    await frame.evaluate(() => __test.holds.push('save-settings'))
    await frame.getByRole('button', { name: '保存设置', exact: true }).click()
    await frame.evaluate(() => __test.abort())
    await frame.evaluate(() => __test.release('save-settings'))
    await frame.waitForFunction(() => document.getElementById('root').childElementCount === 0)
    assert.equal(await frame.locator('#root').innerHTML(), '')
    await frame.evaluate(() => __test.open('devices'))
    assert.equal(await frame.getByText('还没有登记设备', { exact: true }).isVisible(), true)
    assert.deepEqual(consoles, [])
  } finally { await page.close() }
})
