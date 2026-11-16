// Run separately: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
// CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chrome npm run test:browser
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

let browser, server, origin, source, overview, manifest, productIcon
const consoles = []
const csp = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'"

function fixture() {
  const data = { overview, source, csp, icon: productIcon }
  const bootstrap = `
    const fixture = ${JSON.stringify(data).replaceAll('<', '\\u003c')};
    const module = await import(URL.createObjectURL(new Blob([fixture.source], {type:'text/javascript'})));
    const root = document.getElementById('root');
    let controller, dispose;
    const state = {
      icon: fixture.icon, calls: [], navigations: [], failures: {}, pending: {}, holds: [], confirmations: [], confirmResult: true, holdConfirm: false,
      overview: structuredClone(fixture.overview),
      usbInfo: {available:true,reason:'',hostPlatform:'fixture-server'},
      usbPorts: [{id:'opaque-fixture-port',label:'Fixture USB <img src=x onerror=alert(1)>',vendorId:'303a',productId:'1001'}],
      usbJob: {id:'fixture-job-1',phase:'queued',progress:0,message:'Fixture update',createdAt:1,updatedAt:2,canCancel:true,backupSaved:false,applicationVerified:false,preservedRegionsVerified:false,resetConfirmed:false,resultUnknown:false,errorCode:''},
      settings: {deviceOrigin:'', preferredDeviceId:''},
      listing: {devices:[{id:'fixture-01',name:'Test MCU <img src=x onerror=alert(1)>',codeSuffix:'a1b2c3',lanConnected:true,desktopRelayConnected:false,official:false}],modelVerified:false},
      async open(view, locale='zh-CN') {
        if (controller) controller.abort();
        if (dispose) dispose();
        controller = new AbortController();
        const current = controller;
        const ctx = {
          locale, view, slot:view==='preferences'?'settings':'workspace',
          plugin:{id:'m5stack-cardputer-adv',icon:state.icon},identity:{userId:1,profile:'test'},
          signal:current.signal, lifecycle:{add(fn){return fn}},
          rpc:{call:async(name,input)=>{
            state.calls.push({name,input});
            if(state.holds.includes(name)) await new Promise(resolve=>state.pending[name]=resolve);
            if(state.failures[name]) throw new Error(state.failures[name]);
            if(name==='get-overview') return structuredClone(state.overview);
            if(name==='list-devices') return structuredClone(state.listing);
            if(name==='get-settings') return structuredClone(state.settings);
            if(name==='usb-info') return structuredClone(state.usbInfo);
            if(name==='usb-list-ports') return {ports:structuredClone(state.usbPorts)};
            if(name==='usb-start-update') {state.usbInfo.currentJob=structuredClone(state.usbJob);return structuredClone(state.usbJob)}
            if(name==='usb-update-status') return structuredClone(state.usbInfo.currentJob);
            if(name==='usb-cancel-update') {state.usbInfo.currentJob={...state.usbInfo.currentJob,phase:'cancelled',canCancel:false};return structuredClone(state.usbInfo.currentJob)}
            if(name==='save-settings') {
              state.settings={...input,deviceOrigin:input.deviceOrigin?new URL(input.deviceOrigin).origin:''};
              return {ok:true};
            }
            throw new Error('Unexpected RPC '+name);
          }},
          ui:{navigate(value){state.navigations.push(value)},notify(){throw new Error('Unexpected notification')},async confirm(message){state.confirmations.push(message);return state.holdConfirm?await new Promise(resolve=>state.pendingConfirm=resolve):state.confirmResult}}
        };
        const result = await module.mount(root,ctx);
        if(current===controller) dispose=result;
        return true;
      },
      abort(){controller.abort()},
      release(name){state.holds=state.holds.filter(n=>n!==name);state.pending[name]?.();delete state.pending[name]},
      releaseConfirm(answer){state.holdConfirm=false;state.pendingConfirm?.(answer);delete state.pendingConfirm},
    };
    window.__test=state;
    window.__ready=await state.open('devices');
  `
  const inner = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>:root{--text-primary:#202a29;--text-secondary:#596360;--text-muted:#707b77;--bg-card:#fbfaf5;--bg-secondary:#efeee6;--bg-input:#fffef9;--border-color:#c8cec4;--border-light:#dbe0d6;--accent-primary:#247368;--success:#2e7562;--error:#a8372d;--warning:#a67828;--font-family:'Georgia',serif;--font-size-base:14px;--line-height:1.6}body{margin:0;background:#f6f5ed}</style><main id="root"></main><script type="module">${bootstrap.replaceAll('</script', '<\\/script')}</script>`
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe title="Plugin sandbox" sandbox="allow-scripts" srcdoc="${inner.replaceAll('&','&amp;').replaceAll('"','&quot;')}"></iframe>`
}

before(async () => {
  source = await readFile(new URL('../client.mjs', import.meta.url), 'utf8')
  overview = { ...JSON.parse(await readFile(new URL('../firmware/release.json', import.meta.url), 'utf8')), artifactVerified: true }
  manifest = JSON.parse(await readFile(new URL('../plugin.json', import.meta.url), 'utf8'))
  productIcon = `data:image/webp;base64,${(await readFile(new URL('../assets/cardputer-adv.webp', import.meta.url))).toString('base64')}`
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
  assert.deepEqual(consoles, [], 'plugin sandbox must not emit uncaught page errors')
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
    assert.equal(await frame.locator('main').count(), 1)
    assert.equal(await frame.locator('main main').count(), 0)
    assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts')
    assert.equal(await frame.evaluate(() => window.origin), 'null')
    assert.equal((await frame.locator('thead').innerText()).trim(), '设备名称\t设备码末六位\t局域网')
    assert.match(await frame.locator('tbody').innerText(), /Test MCU <img src=x onerror=alert\(1\)>/)
    assert.equal(await frame.locator('tbody img').count(), 0)
    const cells = frame.locator('tbody .adv-state')
    assert.equal(await cells.nth(0).getAttribute('data-online'), 'true')
    assert.equal(await cells.count(), 1)
    assert.match(await frame.locator('.adv-content').innerText(), /当前固件不支持跨网远程/)
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
    assert.match(await frame.locator('.adv-content').innerText(), /Ctrl\/Cmd\+C 手动复制/)
    assert.equal(await frame.locator('a[download],input[type=password]').count(), 0)
    await screenshot(page, 'preferences-saved-fixture-sandbox.png')
    await frame.evaluate(() => __test.open('devices'))
    await screenshot(page, 'devices-fixture-light-sandbox.png')
  } finally { await page.close() }
})

test('firmware prioritizes updating, keeps technical details collapsed, and works on narrow screens', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(() => __test.open('firmware'))
    const advanced = frame.locator('details.adv-advanced')
    assert.equal(await advanced.getAttribute('open'), null)
    assert.equal(await frame.locator('.adv-usb progress').isVisible(), false)
    const publicText = await frame.locator('.adv-content').innerText()
    assert.match(publicText, /仅适用于既有双固件布局/)
    assert.match(publicText, /预览版/)
    assert.match(publicText, /保留原厂工具与设备设置/)
    assert.doesNotMatch(publicText, /0x10000|0x330000|SHA-256|Release 尚未公开|包内源码文件|SDK|实机记录|实体测试|1 \/ 16|fixture-server/)
    assert.equal(await frame.getByRole('button', { name: '升级固件', exact: true }).isVisible(), true)
    await advanced.locator('summary').evaluate(node => node.scrollIntoView({ block: 'center' }))
    await advanced.getByText('高级与开源信息', { exact: true }).click()
    await frame.waitForFunction(() => document.querySelector('details.adv-advanced')?.open === true)
    assert.equal(await advanced.getAttribute('open'), '')
    assert.match(await advanced.innerText(), /0x10000/)
    assert.match(await advanced.innerText(), /0x330000/)
    assert.match(await advanced.innerText(), /第三方许可与重新链接说明/)
    assert.equal(await frame.getByRole('textbox', { name: 'SHA-256', exact: true }).inputValue(), overview.firmware.files[0].sha256)
    assert.equal(await frame.getByRole('textbox', { name: '公开固定下载地址' }).inputValue(), overview.firmware.files[0].downloadUrl)
    assert.equal(await frame.getByRole('textbox', { name: '重新链接说明' }).inputValue(), overview.firmware.source.relinkUrl)
    if (overview.firmware.publication === 'draft') {
      assert.equal(await frame.getByRole('textbox', { name: '发布页地址', exact: true }).count(), 0)
      assert.equal(await frame.getByRole('textbox', { name: '包内源码文件', exact: true }).count(), 0)
      assert.equal(await frame.getByRole('textbox', { name: '源码 SHA-256', exact: true }).inputValue(), overview.firmware.source.archive.sha256)
    }
    await screenshot(page, 'firmware-advanced-sandbox.png')
    await frame.evaluate(() => __test.open('guide', 'en-US'))
    assert.match(await frame.locator('.adv-content').innerText(), /Keyboard reference/)
    assert.match(await frame.locator('.adv-content').innerText(), /Fn \+ Space/)
    assert.match(await frame.locator('.adv-content').innerText(), /up to 5 seconds/)
    assert.match(await frame.locator('.adv-content').innerText(), /No SD card needed/)
    assert.match(await frame.locator('.adv-content').innerText(), /Remote access is not supported/)
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
    assert.doesNotMatch(await frame.locator('.adv-content').innerText(), /Desktop relay|Official|Unofficial|hardware model/)
    await screenshot(page, 'devices-narrow-dark-fixture-sandbox.png')
  } finally { await page.close() }
})

test('guide controls follow capabilities while developer validation stays out of product pages', async () => {
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
    assert.match(await frame.locator('.adv-content').innerText(), /完成一次绑定/)
    assert.match(await frame.locator('.adv-content').innerText(), /首页选择并保存 Studio模型／原生CLI/)
    assert.match(await frame.locator('.adv-content').innerText(), /首页短按回原厂，长按说话/)
    await frame.evaluate(() => __test.open('firmware'))
    await frame.locator('details.adv-advanced summary').evaluate(node => node.scrollIntoView({ block: 'center' }))
    await frame.locator('details.adv-advanced summary').click()
    await frame.waitForFunction(() => document.querySelector('details.adv-advanced')?.open === true)
    assert.match(await frame.locator('.adv-content').innerText(), /synthetic-future-release/)
    assert.doesNotMatch(await frame.locator('.adv-content').innerText(), /此 SDK 宿主版本尚未完成|16 Agent 尚未逐一|完整恢复与异常测试矩阵尚未完成/)
    await frame.evaluate(async () => {
      delete __test.overview.capabilities.explicitAgentModes
      delete __test.overview.capabilities.shortG0Returns
      await __test.open('guide')
    })
    assert.doesNotMatch(await frame.locator('.adv-content').innerText(), /首页选择并保存 Studio模型／原生CLI|首页短按回原厂/)
    assert.match(await frame.locator('.adv-content').innerText(), /切换历史浏览/)
  } finally { await page.close() }
})

test('empty list, load failure and retry are visible; disposal ignores late RPC then remounts', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(async () => { __test.listing.devices=[]; await __test.open('devices') })
    assert.equal(await frame.getByText('还没有连接设备', { exact: true }).isVisible(), true)
    await screenshot(page, 'devices-empty-fixture-sandbox.png')
    await frame.evaluate(async () => { __test.failures['list-devices']='Fixture host offline'; await __test.open('devices') })
    assert.match(await frame.getByRole('alert').innerText(), /Fixture host offline/)
    await frame.evaluate(() => delete __test.failures['list-devices'])
    await frame.getByRole('button', { name: '重试', exact: true }).click()
    await frame.getByText('还没有连接设备', { exact: true }).waitFor()
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
    assert.equal(await frame.getByText('还没有连接设备', { exact: true }).isVisible(), true)
    assert.deepEqual(consoles, [])
  } finally { await page.close() }
})

async function prepareUsb(frame) {
  // Bring the USB section into the nested iframe viewport before pointer input.
  await frame.locator('.adv-usb').evaluate(node => node.scrollIntoView({ block: 'start' }))
  await frame.getByRole('button', { name: '扫描 USB 设备', exact: true }).click()
  await frame.waitForFunction(() => __test.calls.some(call => call.name === 'usb-list-ports'))
  await frame.getByRole('combobox', { name: 'USB 设备', exact: true }).selectOption('opaque-fixture-port')
  await frame.getByRole('checkbox').check()
}

test('USB uses explicit scan, server-side wording and SDK confirmation; rejecting confirmation starts nothing', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(() => __test.open('firmware'))
    const initial = await frame.evaluate(() => __test.calls.filter(call => call.name.startsWith('usb-')))
    assert.deepEqual(initial, [{ name: 'usb-info', input: null }])
    assert.equal(await frame.getByRole('button', { name: '刷新任务状态', exact: true }).count(), 0)
    assert.equal(await frame.getByRole('button', { name: '取消任务', exact: true }).count(), 0)
    assert.match(await frame.locator('.adv-usb').innerText(), /数据线接到运行 Studio 的电脑/)
    assert.match(await frame.locator('.adv-usb').innerText(), /使用 NAS 版 Studio/)
    const start = frame.locator('.adv-usb .adv-primary')
    assert.equal(await start.isDisabled(), true)
    await prepareUsb(frame)
    assert.equal(await frame.locator('.adv-usb select option img').count(), 0)
    await frame.evaluate(() => { __test.confirmResult=false })
    await start.click()
    await frame.waitForFunction(() => __test.confirmations.length === 1)
    const confirmation = await frame.evaluate(() => __test.confirmations[0])
    assert.match(confirmation, /版本: v[0-9]/)
    assert.doesNotMatch(confirmation, /SHA-256: [a-f0-9]{64}/)
    assert.match(confirmation, /仅更新 Ekko 应用，原厂工具和设备设置会保留/)
    assert.match(confirmation, /中断不会自动回滚/)
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-start-update').length), 0)
    assert.equal(await start.isEnabled(), true)
    await page.setViewportSize({ width: 360, height: 780 })
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await screenshot(page, 'usb-confirmation-fixture-sandbox.png')
    const beforeRetry = await frame.evaluate(() => __test.calls.length)
    await frame.evaluate(() => { __test.failures['usb-info']='Fixture USB capability unavailable';return __test.open('firmware') })
    assert.equal(await frame.getByRole('button', { name: '重试', exact: true }).isVisible(), true)
    await frame.evaluate(() => delete __test.failures['usb-info'])
    await frame.getByRole('button', { name: '重试', exact: true }).click()
    await frame.waitForFunction(() => !Array.from(document.querySelectorAll('.adv-usb button')).some(node => node.textContent==='重试' && !node.hidden))
    assert.equal(await frame.evaluate(index => __test.calls.slice(index).some(call => ['usb-start-update','usb-list-ports'].includes(call.name)), beforeRetry), false)
  } finally { await page.close() }
})

test('USB prevents duplicate submission and restores the submitted update after leaving and remounting', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(() => __test.open('firmware'))
    await prepareUsb(frame)
    await frame.evaluate(() => { __test.holdConfirm=true })
    const start = frame.locator('.adv-usb .adv-primary')
    await start.click()
    await start.evaluate(node => node.dispatchEvent(new Event('click')))
    assert.equal(await frame.evaluate(() => __test.confirmations.length), 1)
    await frame.evaluate(() => { __test.holds.push('usb-start-update'); __test.releaseConfirm(true) })
    await frame.waitForFunction(() => __test.calls.some(call => call.name==='usb-start-update'))
    await start.evaluate(node => node.dispatchEvent(new Event('click')))
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-start-update').length), 1)
    const input = await frame.evaluate(() => __test.calls.find(call => call.name==='usb-start-update').input)
    assert.equal(input.portId, 'opaque-fixture-port')
    assert.match(input.requestId, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i)
    assert.equal(input.firmwareSha256, overview.firmware.files[0].sha256)
    assert.equal(input.boardConfirmed, true)
    // The accepted host task survives the old iframe lifecycle, even when its reply was pending.
    await frame.evaluate(() => { __test.usbInfo.currentJob={...__test.usbJob,phase:'writing',progress:45,backupSaved:true,canCancel:false}; __test.abort(); __test.release('usb-start-update') })
    await frame.waitForFunction(() => document.getElementById('root').childElementCount === 0)
    await frame.evaluate(() => __test.open('guide'))
    await frame.evaluate(() => { __test.usbInfo.currentJob={...__test.usbJob,phase:'writing',progress:45,backupSaved:true,canCancel:false}; return __test.open('firmware') })
    assert.match(await frame.locator('.adv-usb').innerText(), /正在写入 · 45%/)
    assert.equal(await frame.locator('.adv-usb .adv-primary').isDisabled(), true)
    assert.equal(await frame.getByRole('button', { name: '扫描 USB 设备', exact: true }).isDisabled(), true)
    assert.equal(await frame.getByRole('button', { name: '取消任务', exact: true, includeHidden: true }).isHidden(), true)
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-start-update').length), 1)
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-cancel-update').length), 0)
  } finally { await page.close() }
})

test('USB unknown submission requires explicit status lookup and never automatically resubmits', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(() => __test.open('firmware'))
    await prepareUsb(frame)
    await frame.evaluate(() => { __test.failures['usb-start-update']='API Error 503: Fixture reply lost' })
    await frame.locator('.adv-usb .adv-primary').click()
    await frame.getByRole('alert').filter({ hasText: '提交结果未确认' }).waitFor()
    assert.doesNotMatch(await frame.locator('.adv-usb').innerText(), /API Error 503:/)
    assert.equal(await frame.locator('.adv-usb .adv-primary').isDisabled(), true)
    await frame.locator('.adv-usb .adv-primary').evaluate(node => node.dispatchEvent(new Event('click')))
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-start-update').length), 1)
    await frame.evaluate(() => { delete __test.failures['usb-start-update']; __test.usbInfo.currentJob={...__test.usbJob,phase:'checking'} })
    await frame.getByRole('button', { name: '刷新任务状态', exact: true }).click()
    await frame.getByText('正在检查设备和布局 · 0%', { exact: true }).waitFor()
    assert.equal(await frame.locator('.adv-usb .adv-primary').isDisabled(), true)
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-start-update').length), 1)
    // Only the host's safe-stage cancellation is exposed.
    await frame.getByRole('button', { name: '取消任务', exact: true }).click()
    await frame.getByText('任务已取消', { exact: true }).waitFor()
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-cancel-update').length), 1)
  } finally { await page.close() }
})

test('USB polling stops after disposal and reports verified completion without claiming hardware acceptance', async () => {
  const { page, frame } = await pageFixture()
  try {
    await page.clock.install()
    await frame.evaluate(() => { __test.usbInfo.currentJob={...__test.usbJob,phase:'writing',canCancel:false}; return __test.open('firmware') })
    await frame.evaluate(() => __test.abort())
    await page.clock.runFor(5000)
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-update-status').length), 0)
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-cancel-update').length), 0)
    await frame.evaluate(() => { __test.usbInfo.currentJob={...__test.usbJob,phase:'verifying',canCancel:false,progress:90}; return __test.open('firmware','en-US') })
    await frame.evaluate(() => { __test.usbInfo.currentJob={...__test.usbJob,phase:'completed',canCancel:false,progress:100,backupSaved:true,applicationVerified:true,preservedRegionsVerified:true,resetConfirmed:true} })
    await page.clock.runFor(2100)
    await frame.getByText('Firmware updated. Factory tools and settings were preserved.', { exact: true }).waitFor()
    assert.match(await frame.locator('.adv-usb').innerText(), /Select EkkoStudio in the M5 factory menu/)
    const count = await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-update-status').length)
    await page.clock.runFor(5000)
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-update-status').length), count)
  } finally { await page.close() }
})

test('USB unknown-result recovery only rescans after explicit review and still needs a new flash confirmation', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(() => { __test.usbInfo.currentJob={...__test.usbJob,phase:'failed',resultUnknown:true,backupSaved:true,errorCode:'USB_VERIFY_FAILED'}; return __test.open('firmware') })
    await frame.locator('.adv-usb').evaluate(node => node.scrollIntoView({ block: 'start' }))
    assert.equal(await frame.locator('.adv-usb .adv-primary').isDisabled(), true)
    assert.match(await frame.locator('.adv-usb').innerText(), /慢速连接耗时更长/)
    const recheck = frame.getByRole('button', { name: '重新核对并扫描', exact: true })
    await frame.evaluate(() => { __test.confirmResult=false })
    await recheck.click()
    assert.equal(await frame.evaluate(() => __test.calls.some(call => call.name==='usb-list-ports')), false)
    assert.match(await frame.evaluate(() => __test.confirmations[0]), /G0 下载模式/)
    await frame.evaluate(() => { __test.confirmResult=true })
    await recheck.click()
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-list-ports').length), 1)
    assert.equal(await frame.getByRole('combobox', { name: 'USB 设备', exact: true }).inputValue(), '')
    assert.equal(await frame.getByRole('checkbox').isChecked(), false)
    assert.equal(await frame.locator('.adv-usb .adv-primary').isDisabled(), true)
    assert.match(await frame.locator('.adv-usb').innerText(), /上次更新结果仍未知/)
    await frame.getByRole('combobox', { name: 'USB 设备', exact: true }).selectOption('opaque-fixture-port')
    await frame.getByRole('checkbox').check()
    await frame.locator('.adv-usb .adv-primary').click()
    assert.equal(await frame.evaluate(() => __test.confirmations.length), 3)
    assert.equal(await frame.evaluate(() => __test.calls.filter(call => call.name==='usb-start-update').length), 1)
    assert.match(await frame.locator('.adv-usb').innerText(), /上次更新结果仍未知/)
    await frame.evaluate(() => { __test.usbInfo.currentJob={...__test.usbJob,phase:'failed',resultUnknown:true,errorCode:'USB_CLOSE_UNCONFIRMED'}; return __test.open('firmware','en-US') })
    await frame.locator('.adv-usb').evaluate(node => node.scrollIntoView({ block: 'start' }))
    await frame.getByRole('button', { name: 'Recheck and scan again', exact: true }).click()
    assert.match(await frame.locator('.adv-usb').innerText(), /previous result remains unknown/)
    assert.match(await frame.locator('.adv-usb').innerText(), /Scan results are valid for two minutes/)
    assert.match(await frame.evaluate(() => __test.confirmations.at(-1)), /not bypassed/)
    assert.deepEqual(consoles, [])
  } finally { await page.close() }
})


test('host product image loads under the real iframe CSP and falls back without requesting arbitrary URLs', async () => {
  const { page, frame } = await pageFixture()
  try {
    const image = frame.getByRole('img', { name: 'M5Stack Cardputer-Adv', exact: true })
    await image.waitFor({ state: 'visible' })
    await frame.waitForFunction(() => document.querySelector('.adv-product-image')?.naturalWidth > 0)
    assert.equal(await image.evaluate(node => node.src.startsWith('data:image/webp;base64,')), true)
    for (const icon of ['https://example.invalid/icon.png', '/assets/icon.png', 'data:image/svg+xml;base64,PHN2Zy8+']) {
      await frame.evaluate(icon => { __test.icon=icon;return __test.open('devices') }, icon)
      assert.equal(await frame.locator('.adv-product-image').count(), 0)
      assert.equal(await frame.getByRole('heading', { name: 'M5Stack Cardputer-Adv', exact: true }).isVisible(), true)
    }
    await frame.evaluate(() => { __test.icon='data:image/png;base64,AAAA';return __test.open('devices') })
    await frame.waitForFunction(() => !document.querySelector('.adv-product-image'))
    assert.equal(await frame.getByRole('heading', { name: 'M5Stack Cardputer-Adv', exact: true }).isVisible(), true)
  } finally { await page.close() }
})


test('USB failure explains the actual problem while diagnostic codes remain behind the disclosure', async () => {
  const { page, frame } = await pageFixture()
  try {
    await frame.evaluate(() => {
      __test.usbInfo.currentJob={...__test.usbJob,phase:'failed',canCancel:false,message:'私有备份未能保存，没有写入应用。',errorCode:'FUTURE_USB_ERROR'}
      return __test.open('firmware')
    })
    assert.match(await frame.locator('.adv-usb').innerText(), /私有备份未能保存，没有写入应用/)
    assert.doesNotMatch(await frame.locator('.adv-content').innerText(), /FUTURE_USB_ERROR|fixture-server/)
    const summary=frame.locator('details.adv-advanced summary')
    await summary.evaluate(node => node.scrollIntoView({block:'center'}))
    await summary.click()
    await frame.waitForFunction(() => document.querySelector('details.adv-advanced')?.open === true)
    assert.match(await frame.locator('details.adv-advanced').innerText(), /FUTURE_USB_ERROR/)
  } finally { await page.close() }
})
