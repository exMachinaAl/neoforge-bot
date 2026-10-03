prev=""
for i in $(seq 1 20); do
  out=$(node probe2.js 2>&1)
  t=$(echo "$out" | sed -n 's/.*Unsupported Forge command argument type: \([a-z0-9_.:\/-]*\).*/\1/p' | head -1)
  [ -z "$t" ] && break
  if [ "$t" = "$prev" ]; then echo "macet di $t"; break; fi
  prev="$t"
  echo "tambah $t"
  sed -i "s/^const extra = \[/const extra = ['$t', /" patch-nmpf.js
  node patch-nmpf.js
done
echo "--- hasil akhir ---"
echo "$out" | tail -8
