'use strict'
// Daftar channel wajib (fase play) untuk server kamu.
// Sumber: kode sumber Touhou Little Maid (branch 1.21, registrar versi "1.0.0")
// dan Patchouli (branch 1.21.x, registrar versi "patchouli").
// Semua didaftarkan lewat playToClient/playToServer tanpa optional(), jadi wajib.
// Kalau versi mod di server kamu berbeda, ubah nilai VERSION di bawah.

const TLM_VERSION = '1.0.0'
const PATCHOULI_VERSION = 'patchouli'

// Handler kosong: protokol lolos, tapi isi paket tidak diproses.
const ignore = () => {}

// optional: true -> bot tetap diterima walau server tidak punya channel itu (mod dilepas/diganti)
const clientbound = (version) => ({ version, flow: 'clientbound', optional: true, handler: ignore })
const serverbound = (version) => ({ version, flow: 'serverbound', optional: true })

module.exports = {
  'touhou_little_maid:maid_model': serverbound(TLM_VERSION),
  'touhou_little_maid:chair_model': serverbound(TLM_VERSION),
  'touhou_little_maid:open_chair_gui': clientbound(TLM_VERSION),
  'touhou_little_maid:maid_config': serverbound(TLM_VERSION),
  'touhou_little_maid:maid_task': serverbound(TLM_VERSION),
  'touhou_little_maid:send_name_tag': serverbound(TLM_VERSION),
  'touhou_little_maid:item_break': clientbound(TLM_VERSION),
  'touhou_little_maid:spawn_particle': clientbound(TLM_VERSION),
  'touhou_little_maid:sync_data': clientbound(TLM_VERSION),
  'touhou_little_maid:wireless_io_gui': serverbound(TLM_VERSION),
  'touhou_little_maid:wireless_slot_config': serverbound(TLM_VERSION),
  'touhou_little_maid:open_beacon_gui': clientbound(TLM_VERSION),
  'touhou_little_maid:set_beacon_potion': serverbound(TLM_VERSION),
  'touhou_little_maid:save_and_take_power': serverbound(TLM_VERSION),
  'touhou_little_maid:set_beacon_overflow': serverbound(TLM_VERSION),
  'touhou_little_maid:beacon_absorb': clientbound(TLM_VERSION),
  'touhou_little_maid:open_switcher_gui': clientbound(TLM_VERSION),
  'touhou_little_maid:save_switcher_data': serverbound(TLM_VERSION),
  'touhou_little_maid:toggle_tab': serverbound(TLM_VERSION),
  'touhou_little_maid:request_effect': serverbound(TLM_VERSION),
  'touhou_little_maid:send_effect': clientbound(TLM_VERSION),
  'touhou_little_maid:play_maid_sound': clientbound(TLM_VERSION),
  'touhou_little_maid:play_maid_sound_at_pos': clientbound(TLM_VERSION),
  'touhou_little_maid:set_maid_sound_id': serverbound(TLM_VERSION),
  'touhou_little_maid:gomoku_to_client': clientbound(TLM_VERSION),
  'touhou_little_maid:gomoku_to_server': serverbound(TLM_VERSION),
  'touhou_little_maid:fox_scroll': clientbound(TLM_VERSION),
  'touhou_little_maid:set_scroll': serverbound(TLM_VERSION),
  'touhou_little_maid:check_schedule_pos': clientbound(TLM_VERSION),
  'touhou_little_maid:sync_maid_area': clientbound(TLM_VERSION),
  'touhou_little_maid:servant_bell_set': serverbound(TLM_VERSION),
  'touhou_little_maid:set_attack_list': serverbound(TLM_VERSION),
  'touhou_little_maid:refresh_maid_brain': serverbound(TLM_VERSION),
  'touhou_little_maid:maid_sub_config': serverbound(TLM_VERSION),
  'touhou_little_maid:cchess_to_client': clientbound(TLM_VERSION),
  'touhou_little_maid:cchess_to_server': serverbound(TLM_VERSION),
  'touhou_little_maid:wchess_to_client': clientbound(TLM_VERSION),
  'touhou_little_maid:wchess_to_server': serverbound(TLM_VERSION),
  'touhou_little_maid:send_user_chat': serverbound(TLM_VERSION),
  'touhou_little_maid:tts_audio_to_client': clientbound(TLM_VERSION),
  'touhou_little_maid:ysm_maid_model': serverbound(TLM_VERSION),
  'touhou_little_maid:save_maid_ai_data': serverbound(TLM_VERSION),
  'touhou_little_maid:sync_ysm_maid_data': clientbound(TLM_VERSION),
  'touhou_little_maid:tts_system_audio_to_client': clientbound(TLM_VERSION),
  'touhou_little_maid:clear_maid_ai_data': serverbound(TLM_VERSION),
  'touhou_little_maid:open_maid_gui': serverbound(TLM_VERSION),
  'touhou_little_maid:open_player_inventory': clientbound(TLM_VERSION),
  'touhou_little_maid:dismount': serverbound(TLM_VERSION),
  'touhou_little_maid:maid_animation': clientbound(TLM_VERSION),
  'touhou_little_maid:sync_bauble': clientbound(TLM_VERSION),
  'touhou_little_maid:curios_update': clientbound(TLM_VERSION),
  'touhou_little_maid:open_maid_ai_chat': serverbound(TLM_VERSION),
  'touhou_little_maid:sync_maid_ai_data': clientbound(TLM_VERSION),
  'touhou_little_maid:open_ai_config': serverbound(TLM_VERSION),
  'touhou_little_maid:sync_ai_sites': clientbound(TLM_VERSION),
  'touhou_little_maid:save_llm_site': serverbound(TLM_VERSION),
  'touhou_little_maid:save_tts_site': serverbound(TLM_VERSION),
  'patchouli:open_book': clientbound(PATCHOULI_VERSION),
  'patchouli:reload_books': clientbound(PATCHOULI_VERSION)
}