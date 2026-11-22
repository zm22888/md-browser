const fs = require('fs')
const a = fs.readFileSync('D:/workspace/md/.shots/before-edit.md', 'utf8').split(/\r?\n/)
const b = fs.readFileSync('D:/workspace/md/demo-docs/代码与图表.md', 'utf8').split(/\r?\n/)
console.log('before lines:', a.length, '| after lines:', b.length)
const max = Math.max(a.length, b.length)
let diffs = 0
for (let i = 0; i < max; i++) {
  if (a[i] !== b[i]) {
    diffs++
    if (diffs <= 20) console.log((i + 1) + ': [' + JSON.stringify((a[i] || '').slice(0, 60)) + '] -> [' + JSON.stringify((b[i] || '').slice(0, 60)) + ']')
  }
}
console.log('total diff lines:', diffs)
