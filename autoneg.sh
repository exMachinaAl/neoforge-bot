for i in 1 2 3 4 5; do
  rm -f fail2.txt
  node probe2.js 2>&1 | grep -a "CHANNELS OK\|ALASAN"
  [ -f fail2.txt ] || break
  node fixversions.js
done