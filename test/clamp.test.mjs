import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply, Config, inject, name } from '../lib/index.js'

function context(service) {
  const cleanups = []
  return {
    sessionController: service,
    effect(setup) { cleanups.push(setup()) },
    dispose() {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup()
    },
    cleanups,
  }
}

function service() {
  const calls = []
  const promise = Promise.resolve({ records: [], hasMore: false })
  const svc = { page(request, signal) {
    calls.push({ receiver: this, request, signal })
    return promise
  } }
  return { svc, calls, promise }
}

const request = (extra = {}) => ({
  address: { kind: 'session', sessionId: 'session-test' },
  throughSeq: 100,
  ...extra,
})

test('C1: clamps an excessive safe integer with a new, non-mutating request', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx, { maxMessages: 50 })
  const input = Object.freeze(request({ maxMessages: 500, beforeSeq: 99 }))
  svc.page(input)
  assert.notEqual(calls[0].request, input)
  assert.deepEqual(calls[0].request, request({ maxMessages: 50, beforeSeq: 99 }))
  assert.equal(input.maxMessages, 500)
  ctx.dispose()
})

test('C2: clamps minMessages, preserves minTurns and leaves the nested caller object intact', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx, { maxMessages: 20 })
  const turnWindow = Object.freeze({ minMessages: 50, minTurns: 3 })
  const input = Object.freeze(request({ maxMessages: 500, turnWindow }))
  svc.page(input)
  assert.deepEqual(calls[0].request, request({
    maxMessages: 20, turnWindow: { minMessages: 20, minTurns: 3 },
  }))
  assert.notEqual(calls[0].request.turnWindow, turnWindow)
  assert.deepEqual(turnWindow, { minMessages: 50, minTurns: 3 })
  ctx.dispose()
})

test('C2: preserves smaller minMessages and absent fields', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx)
  for (const turnWindow of [{ minMessages: 10 }, { minTurns: 2 }, {}]) {
    svc.page(request({ maxMessages: 500, turnWindow }))
    assert.deepEqual(calls.at(-1).request, request({ maxMessages: 50, turnWindow }))
  }
  svc.page(request({ maxMessages: 500 }))
  assert.deepEqual(calls.at(-1).request, request({ maxMessages: 50 }))
  ctx.dispose()
})

test('C3: absent, at-cap, below-cap and invalid maxMessages pass through by identity', () => {
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx)
  const inputs = [
    request(),
    ...[undefined, 50, 1, 0, -1, 50.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '500', null]
      .map(maxMessages => request({ maxMessages, turnWindow: { minMessages: 80, minTurns: 3 } })),
  ]
  for (const input of inputs) {
    svc.page(input)
    assert.equal(calls.at(-1).request, input)
  }
  ctx.dispose()
})

test('C4: Config exposes Standard Schema defaults and apply uses the default cap', () => {
  assert.equal(Config['~standard'].version, 1)
  assert.deepEqual(Config['~standard'].validate({}), { value: { maxMessages: 50, enabled: true } })
  const { svc, calls } = service()
  const ctx = context(svc)
  apply(ctx)
  svc.page(request({ maxMessages: 500 }))
  assert.equal(calls[0].request.maxMessages, 50)
  ctx.dispose()
})

test('C4: disabled mode installs no wrapper or effect, including on a frozen service', () => {
  const { svc } = service()
  const original = svc.page
  const ctx = context(Object.freeze(svc))
  apply(ctx, { enabled: false })
  assert.equal(svc.page, original)
  assert.equal(ctx.cleanups.length, 0)
})

test('C4: invalid config fails loudly before any wrapping, including when disabled', () => {
  for (const maxMessages of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '50', null]) {
    const { svc } = service()
    const original = svc.page
    const ctx = context(svc)
    const config = { maxMessages, enabled: false }
    assert.throws(() => apply(ctx, config), /dsh-session-page-clamp.*maxMessages.*positive safe integer/)
    assert.match(Config['~standard'].validate(config).issues[0].message, /maxMessages.*positive safe integer/)
    assert.equal(svc.page, original)
    assert.equal(ctx.cleanups.length, 0)
  }
  for (const enabled of [null, 0, 'true']) {
    assert.throws(() => apply(context(service().svc), { enabled }), /enabled.*boolean/)
    assert.ok(Config['~standard'].validate({ enabled }).issues)
  }
  for (const config of [null, [], 'bad']) {
    assert.throws(() => apply(context(service().svc), config), /config.*object/)
    assert.ok(Config['~standard'].validate(config).issues)
  }
})

test('C5/C6: installs on the reached instance, restores its exact own descriptor', () => {
  const { svc, calls } = service()
  const descriptor = Object.getOwnPropertyDescriptor(svc, 'page')
  const ctx = context(svc)
  apply(ctx)
  const wrapper = svc.page
  assert.notEqual(wrapper, descriptor.value)
  assert.equal(ctx.sessionController.page, wrapper)
  svc.page(request({ maxMessages: 500 }))
  assert.equal(calls[0].request.maxMessages, 50)
  ctx.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(svc, 'page'), descriptor)
})

test('C5/C6: inherited instance shadow is removed on disposal', () => {
  const { svc: proto } = service()
  const svc = Object.create(proto)
  const ctx = context(svc)
  apply(ctx)
  assert.ok(Object.hasOwn(svc, 'page'))
  assert.notEqual(svc.page, proto.page)
  ctx.dispose()
  assert.equal(Object.hasOwn(svc, 'page'), false)
  assert.equal(svc.page, proto.page)
})

test('C5/C6: frozen instance falls back to its mutable prototype and restores it', () => {
  const { svc: proto, calls } = service()
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'page')
  const svc = Object.freeze(Object.create(proto))
  const ctx = context(svc)
  apply(ctx, { maxMessages: 20 })
  assert.equal(svc.page, proto.page)
  assert.notEqual(svc.page, descriptor.value)
  svc.page(request({ maxMessages: 500 }))
  assert.equal(calls[0].request.maxMessages, 20)
  ctx.dispose()
  assert.equal(svc.page, descriptor.value)
  assert.deepEqual(Object.getOwnPropertyDescriptor(proto, 'page'), descriptor)
})

test('C5: read-back detects a proxy ignoring successful instance assignment', () => {
  const { svc: proto, calls } = service()
  const original = proto.page
  let sets = 0
  const svc = new Proxy(Object.create(proto), {
    set() { sets += 1; return true },
  })
  const ctx = context(svc)
  apply(ctx)
  assert.equal(sets, 1)
  assert.notEqual(svc.page, original)
  assert.equal(svc.page, proto.page)
  svc.page(request({ maxMessages: 500 }))
  assert.equal(calls[0].request.maxMessages, 50)
  ctx.dispose()
  assert.equal(proto.page, original)
})

test('C5: neither patch site works: fail loudly without leaving a prototype wrapper', () => {
  const { svc: proto } = service()
  const original = proto.page
  const svc = Object.freeze({ __proto__: proto, page: original })
  assert.throws(() => apply(context(svc)), /dsh-session-page-clamp.*cannot install.*sessionController.page/)
  assert.equal(proto.page, original)
  assert.equal(svc.page, original)
  Object.freeze(proto)
  assert.throws(() => apply(context(Object.freeze(Object.create(proto)))), /cannot install/)
  assert.throws(() => apply(context({})), /sessionController.page.*function/)
})

test('C6: duplicate mounts do not stack; dispose and remount wrap exactly once', () => {
  const { svc, calls } = service()
  const original = svc.page
  const first = context(svc)
  const duplicate = context(svc)
  apply(first, { maxMessages: 50 })
  const wrapper = svc.page
  assert.ok(Object.getOwnPropertySymbols(wrapper).some(symbol => typeof wrapper[symbol] === 'boolean'))
  apply(duplicate, { maxMessages: 10 })
  assert.equal(svc.page, wrapper)
  assert.equal(duplicate.cleanups.length, 0)
  svc.page(request({ maxMessages: 500 }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].request.maxMessages, 50)
  duplicate.dispose()
  first.dispose()
  assert.equal(svc.page, original)
  const remount = context(svc)
  apply(remount, { maxMessages: 25 })
  assert.notEqual(svc.page, wrapper)
  svc.page(request({ maxMessages: 500 }))
  assert.equal(calls.length, 2)
  assert.equal(calls[1].request.maxMessages, 25)
  remount.dispose()
  assert.equal(svc.page, original)
})

test('C7: forwards this and AbortSignal and returns the exact original promise', () => {
  const { svc, calls, promise } = service()
  const ctx = context(svc)
  apply(ctx)
  const receiver = { marker: true }
  const signal = new AbortController().signal
  assert.equal(svc.page.call(receiver, request({ maxMessages: 500 }), signal), promise)
  assert.equal(calls[0].receiver, receiver)
  assert.equal(calls[0].signal, signal)
  ctx.dispose()
})

test('C7: synchronous errors and rejected promises propagate unchanged without logging', async () => {
  const failure = new Error('sentinel')
  const svc = { page() { throw failure } }
  const ctx = context(svc)
  ctx.logger = { error() { assert.fail('unexpected logging') }, warn() { assert.fail('unexpected logging') } }
  apply(ctx)
  assert.throws(() => svc.page(request({ maxMessages: 500 })), error => error === failure)
  ctx.dispose()
  const rejection = Promise.reject(failure)
  svc.page = () => rejection
  apply(ctx)
  const returned = svc.page(request({ maxMessages: 500 }))
  assert.equal(returned, rejection)
  await assert.rejects(returned, error => error === failure)
  ctx.dispose()
})

test('C5 revised/C6/C7: real Cordis gateway dispatch clamps through raw service and preserves shadow helpers', async t => {
  let entry
  try {
    const profile = process.env.DSH_PROFILE_DIR ?? '/home/wilder/.dsh/profiles/web'
    entry = createRequire(join(profile, 'package.json')).resolve('@deepseek-ai/cordis')
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    t.skip('installed profile Cordis is not resolvable')
    return
  }
  const { Context, Service, resolveConfig } = await import(pathToFileURL(entry).href)
  const plugin = { name, inject, Config, apply }
  assert.deepEqual(resolveConfig(plugin, {}), { maxMessages: 50, enabled: true })
  assert.throws(() => resolveConfig(plugin, { maxMessages: 0 }), /maxMessages.*positive safe integer/)
  const ctx = new Context().extend({ testContextLabel: 'host' })
  const calls = []
  const promise = Promise.resolve({ records: [], hasMore: true })
  class SessionController extends Service {
    constructor(ctx) { super(ctx, 'sessionController') }
    helper() { return this.ctx.testContextLabel }
    page(request, signal) {
      calls.push({ request, signal, helper: this.helper() })
      return promise
    }
  }
  const raw = new SessionController(ctx)
  const original = raw.page
  const originalDescriptor = Object.getOwnPropertyDescriptor(raw, 'page')
  assert.equal(originalDescriptor, undefined)
  assert.equal(ctx.sessionController[Symbol.for('cordis.original')], raw)
  assert.notEqual(ctx.sessionController.page, ctx.sessionController.page)
  const fiber = ctx.plugin(plugin, { maxMessages: 20 })
  t.after(() => fiber.dispose())
  await fiber.await()
  assert.ok(Object.hasOwn(raw, 'page'))
  assert.notEqual(raw.page, original)
  const input = request({ maxMessages: 500, turnWindow: { minMessages: 50, minTurns: 3 } })
  const signal = new AbortController().signal
  const receiver = ctx.extend({ testContextLabel: 'gateway' }).sessionController
  const invoke = () => Reflect.apply(Reflect.get(receiver, 'page'), receiver, [input, signal])
  assert.equal(invoke(), promise)
  assert.deepEqual(calls[0], {
    request: request({ maxMessages: 20, turnWindow: { minMessages: 20, minTurns: 3 } }),
    signal,
    helper: 'gateway',
  })
  assert.equal(input.maxMessages, 500)
  await fiber.dispose()
  assert.equal(raw.page, original)
  assert.deepEqual(Object.getOwnPropertyDescriptor(raw, 'page'), originalDescriptor)
  assert.equal(invoke(), promise)
  assert.equal(calls[1].request, input)
  assert.equal(calls[1].helper, 'gateway')

  // Real raw services with an existing own descriptor must restore it too.
  Object.defineProperty(raw, 'page', {
    value: original, writable: true, enumerable: false, configurable: false,
  })
  const ownDescriptor = Object.getOwnPropertyDescriptor(raw, 'page')
  const remount = ctx.plugin(plugin, { maxMessages: 30 })
  t.after(() => remount.dispose())
  await remount.await()
  invoke()
  assert.equal(calls[2].request.maxMessages, 30)
  await remount.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(raw, 'page'), ownDescriptor)
  invoke()
  assert.equal(calls[3].request, input)
})

test('C8: host-only package has one insert row, no client half, no runtime dependencies', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.name, 'dsh-session-page-clamp')
  assert.equal(manifest.main, 'lib/index.js')
  assert.deepEqual(manifest.dsh, { bundle: { patch: './cordis.patch.yml' } })
  assert.deepEqual(manifest.dependencies ?? {}, {})
  assert.deepEqual(inject, ['sessionController'])
  assert.equal(name, 'dsh-session-page-clamp')
  assert.equal(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'),
    '- insert:\n    - id: session-page-clamp\n      name: dsh-session-page-clamp\n      config:\n        maxMessages: 50\n        enabled: true\n')
})
