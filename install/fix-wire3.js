const fs = require('fs')
const file = 'bot.js'
let s = fs.readFileSync(file, 'utf8')
if (s.includes('./engine')) return console.log(file + ': sudah ter-fix')
function rep (a, b, opt) {
  if (!s.includes(a)) { if (opt) return; console.log(file + ': anchor tidak ditemukan: ' + a.slice(0, 40)); process.exit(1) }
  s = s.replace(a, b)
}
rep("const runner = require('./skills').createRunner(bot)\n", "const runner = require('./skills').createRunner(bot)\nconst engine = require('./engine').createEngine(bot, runner)\nif (process.env.ARCADIA_API !== '0') require('./control').start({ bot, runner, engine })\n")
rep("      case 'task':\n", "      case 'queue':\n        engine.cli(args)\n        break\n      case 'task':\n")
rep("Available commands: !help, !quit, /<mc command>, or plain chat", "Perintah: !help !quit !test [nama] !task <skill> ... !queue add|list|clear|pause|resume|cancel|kill !channels [kata] !hit, atau /<perintah mc>, atau chat biasa", true)
fs.writeFileSync(file, s)
console.log(file + ': fix terpasang')
