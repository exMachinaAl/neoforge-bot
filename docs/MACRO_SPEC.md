# docs/MACRO_SPEC.md - Spesifikasi Makro Deklaratif (DSL) Arcadia v1.0

Spesifikasi makro deklaratif untuk menyusun urutan skill yang sudah ada secara terstruktur, tanpa eksekusi kode JS sembarang di interpreter makro. Makro berbeda dari `tool.create/tool.run` milik [agent](AGENT_RUNTIME.md), yang memakai QuickJS terisolasi. Keberhasilan validasi contoh tidak berarti semua aksi contoh sudah terbukti di Minecraft; status implementasi dan pengujian: [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## 1. Filosofi & Batas Keamanan

1. **Deklaratif Murni**: Makro didefinisikan dalam format JSON. Tidak ada evaluasi ekspresi JavaScript (`eval`, `new Function`, `vm`).
2. **Kondisi Berbasis BotState**: Evaluasi kondisi hanya membaca nilai properti deklaratif dari `BotState` (misal: `state.health`, `state.food`, `state.time.timeOfDay`, `state.inventory.items`).
3. **Loop Berbatas Wajib (*Bounded Loops*)**: Setiap perulangan wajib memiliki `maxIterations` (maksimum 10) dan `maxDurationMs` (maksimum 600.000 ms / 10 menit) untuk mencegah loop tanpa henti.
4. **Penanganan Kegagalan Eksplisit**: Tiap langkah mendefinisikan aksi jika gagal (`onFail`): `abort` (hentikan makro), `skip` (lanjutkan ke langkah berikutnya), atau `retry` (coba ulang N kali).
5. **Variabel Keluaran Terbatas**: Nilai kembalian langkah (misal `SkillResult.data`) dapat diteruskan ke langkah berikutnya hanya melalui pencocokan kunci terdaftar (`outputs`).

---

## 2. Struktur Makro JSON

```json
{
  "id": "macro_id",
  "name": "Nama Deskriptif Makro",
  "version": "1.0",
  "category": "survive | gather | craft | social | explore | maintain",
  "limits": {
    "maxDurationMs": 180000,
    "maxSteps": 10
  },
  "prerequisites": {
    "minHp": 10,
    "safeDimension": "overworld"
  },
  "steps": [
    {
      "id": "step_1",
      "skill": "skill_name",
      "params": { ... },
      "condition": {
        "field": "health",
        "operator": ">=",
        "value": 10
      },
      "onFail": "abort | skip | retry",
      "retries": 1,
      "timeoutMs": 30000,
      "outputs": {
        "savedVariable": "result.data.fieldName"
      }
    }
  ]
}
```

---

## 3. Operator Kondisi Deklaratif
Evaluasi kondisi mendukung operator perbandingan sederhana:
- `==` / `!=`: kesetaraan nilai string/number/boolean.
- `>`, `>=`, `<`, `<=`: perbandingan numerik (misal HP, makanan, tick waktu).
- `contains`: pencarian item di dalam daftar/inventory.

---

## 4. Lima Contoh Makro Konkret

### Contoh 1: Siklus Tidur Aman (`sleep_cycle`)
*Alur:* Amankan posisi -> letakkan kasur -> tidur malam -> ambil kasur kembali.
```json
{
  "id": "sleep_cycle",
  "name": "Siklus Tidur Malam Aman",
  "version": "1.0",
  "category": "survive",
  "limits": { "maxDurationMs": 60000, "maxSteps": 3 },
  "prerequisites": { "minHp": 6, "safeDimension": "overworld" },
  "steps": [
    {
      "id": "find_safe_spot",
      "skill": "nav.goto",
      "params": { "range": 2 },
      "onFail": "skip",
      "timeoutMs": 15000
    },
    {
      "id": "execute_sleep",
      "skill": "sleep.auto",
      "params": {},
      "condition": { "field": "timeOfDay", "operator": "==", "value": "night" },
      "onFail": "abort",
      "timeoutMs": 30000
    }
  ]
}
```

### Contoh 2: Siklus Pertanian & Penyimpanan (`farm_cycle`)
*Alur:* Panen gandum matang -> simpan hasil ke peti terdekat.
```json
{
  "id": "farm_cycle",
  "name": "Panen Gandum dan Simpan Peti",
  "version": "1.0",
  "category": "maintain",
  "limits": { "maxDurationMs": 120000, "maxSteps": 3 },
  "prerequisites": { "minHp": 10, "safeDimension": "overworld" },
  "steps": [
    {
      "id": "harvest_wheat",
      "skill": "farm.harvest",
      "params": { "crops": ["wheat"], "count": 12, "replant": true },
      "onFail": "abort",
      "timeoutMs": 60000
    },
    {
      "id": "deposit_produce",
      "skill": "inv.store",
      "params": { "chest": "auto" },
      "onFail": "skip",
      "timeoutMs": 30000
    }
  ]
}
```

### Contoh 3: Rute Patroli Pos (`patrol_route`)
*Alur:* Jalan ke Pos A -> jaga 30 detik -> jalan ke Pos B -> jaga 30 detik.
```json
{
  "id": "patrol_route",
  "name": "Patroli Rute Pos Keamanan",
  "version": "1.0",
  "category": "maintain",
  "limits": { "maxDurationMs": 180000, "maxSteps": 4 },
  "prerequisites": { "minHp": 14, "safeDimension": "overworld" },
  "steps": [
    {
      "id": "goto_post_a",
      "skill": "nav.goto",
      "params": { "x": 15, "z": 20, "range": 2 },
      "onFail": "skip",
      "timeoutMs": 30000
    },
    {
      "id": "guard_post_a",
      "skill": "guard.post",
      "params": { "durationMs": 30000 },
      "onFail": "skip",
      "timeoutMs": 35000
    },
    {
      "id": "goto_post_b",
      "skill": "nav.goto",
      "params": { "x": 0, "z": 0, "range": 2 },
      "onFail": "skip",
      "timeoutMs": 30000
    },
    {
      "id": "guard_post_b",
      "skill": "guard.post",
      "params": { "durationMs": 30000 },
      "onFail": "skip",
      "timeoutMs": 35000
    }
  ]
}
```

### Contoh 4: Kumpulkan Kayu & Olah Balok (`gather_and_deposit`)
*Alur:* Tebang batang kayu pohon -> craft menjadi kayu balok (planks) -> simpan ke peti.
```json
{
  "id": "gather_and_deposit",
  "name": "Tebang Kayu Olah dan Simpan",
  "version": "1.0",
  "category": "gather",
  "limits": { "maxDurationMs": 120000, "maxSteps": 3 },
  "prerequisites": { "minHp": 12, "safeDimension": "overworld" },
  "steps": [
    {
      "id": "chop_wood",
      "skill": "mine.collect",
      "params": { "block": "oak_log", "count": 4 },
      "onFail": "abort",
      "timeoutMs": 45000
    },
    {
      "id": "craft_planks",
      "skill": "craft.item",
      "params": { "item": "oak_planks", "count": 4 },
      "onFail": "skip",
      "timeoutMs": 15000
    },
    {
      "id": "store_materials",
      "skill": "inv.store",
      "params": { "chest": "auto" },
      "onFail": "skip",
      "timeoutMs": 20000
    }
  ]
}
```

### Contoh 5: Mundur & Pemulihan Darurat (`safe_retreat`)
*Alur:* Jika HP rendah (< 10) -> lari ke koordinat aman pangkalan -> verifikasi kondisi.
```json
{
  "id": "safe_retreat",
  "name": "Mundur Darurat ke Pangkalan",
  "version": "1.0",
  "category": "survive",
  "limits": { "maxDurationMs": 60000, "maxSteps": 2 },
  "prerequisites": { "minHp": 1, "safeDimension": "overworld" },
  "steps": [
    {
      "id": "run_to_base",
      "skill": "nav.goto",
      "params": { "x": 0, "z": 0, "range": 3 },
      "condition": { "field": "health", "operator": "<", "value": 10 },
      "onFail": "retry",
      "retries": 1,
      "timeoutMs": 30000
    },
    {
      "id": "audit_status",
      "skill": "inv.snapshot",
      "params": {},
      "onFail": "skip",
      "timeoutMs": 10000
    }
  ]
}
```
