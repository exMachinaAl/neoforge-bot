: "${LOG:?isi dulu: LOG=/path/server/logs/latest.log bash autoserver.sh}"
prev=""
for i in $(seq 1 30); do
  mark=$(wc -l < "$LOG")
  timeout 15 node bot.js > bot.log 2>&1
  new=$(tail -n +$((mark+1)) "$LOG")
  p=$(echo "$new" | sed -n 's/.*Payload \([a-z0-9_.-]*:[a-z0-9_\/.-]*\) may not be sent to the client.*/\1/p' | head -1)
  if [ -z "$p" ]; then echo "tidak ada payload baru (putaran $i)"; break; fi
  if [ "$p" = "$prev" ]; then echo "macet di $p"; break; fi
  prev="$p"; echo "tambah $p"
  node add.js "$p"
done
echo "--- log server putaran terakhir ---"
echo "$new" | grep -E "joined|lost connection|ERROR|Payload" | head -8
