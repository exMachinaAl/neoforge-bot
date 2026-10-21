// Source agent hanya masuk QuickJS/WASM, tidak dievaluasi oleh Node atau node:vm.
const { parentPort, workerData } = require('node:worker_threads')
const { getQuickJS } = require('quickjs-emscripten')
;(async () => {
  const qjs = await getQuickJS(), runtime = qjs.newRuntime()
  runtime.setMemoryLimit(16 * 1024 * 1024)
  runtime.setMaxStackSize(256 * 1024)
  const deadline = Date.now() + 1000
  runtime.setInterruptHandler(() => Date.now() > deadline)
  const vm = runtime.newContext()
  try {
    const expression = `"use strict";\n${workerData.code}\n;JSON.stringify(run(${JSON.stringify(workerData.input)},${JSON.stringify(workerData.world)}))`
    const result = vm.evalCode(expression, 'agent-tool.js')
    if (result.error) {
      const error = vm.dump(result.error); result.error.dispose()
      throw Error(error?.message || JSON.stringify(error))
    }
    const output = vm.dump(result.value); result.value.dispose()
    if (typeof output !== 'string' || output.length > 32768) throw Error('tool harus mengembalikan JSON maksimum 32 KB')
    parentPort.postMessage({ ok: true, output: JSON.parse(output) })
  } finally { vm.dispose(); runtime.dispose() }
})().catch(error => parentPort.postMessage({ ok: false, error: String(error.message).slice(0, 1000) }))
