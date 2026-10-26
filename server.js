'use strict';

// ===== 서버 (Supabase) 연결 =====
// 공개용 키라서 게임 파일에 넣어도 괜찮다. 진짜 비밀 키(secret)는 절대 여기 넣지 않는다.
const SUPA_URL = 'https://zycnheerlcsngdtpnkhj.supabase.co';
const SUPA_KEY = 'sb_publishable_0V5WhlkuNWYr76Wy5Co_TQ_tXemKUr9';
const sb = window.supabase ? window.supabase.createClient(SUPA_URL, SUPA_KEY) : null;

// 지금 접속한 사람: { id, nickname } (없으면 null). nickname = 게임 아이디 (계정 이름).
// 구글로 처음 들어와 아직 아이디를 안 정했으면 { id, nickname: null }
let ME = null;
const ID_RULE = /^[0-9A-Za-z가-힣_]{2,8}$/;

// 로그인 상태를 읽는다. 구글 로그인에서 돌아오면 주소에 붙은 정보로 Supabase가 알아서 로그인해 둔다
async function serverInit() {
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  const u = data.session && data.session.user;
  ME = null;
  if (!u) return true;
  // 시즌 3부터 구글 로그인만: 예전 익명 계정과 아이디·비밀번호(가짜 메일) 계정은 로그아웃시킨다
  if (u.is_anonymous || String(u.email || '').endsWith('@sam.game')) { await sb.auth.signOut(); return true; }
  const { data: prof, error } = await sb.from('profiles').select('nickname').eq('id', u.id).maybeSingle();
  if (error) throw error;
  ME = { id: u.id, nickname: prof ? prof.nickname : null };
  return true;
}

// 구글 로그인: 구글 창으로 갔다가 이 페이지로 돌아온다 (그 뒤 serverInit이 로그인 상태를 읽는다)
async function signInGoogle() {
  const back = location.origin + location.pathname;
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back } });
  if (error) throw new Error(error.message);
}

// 처음 들어온 사람: 게임 아이디를 정한다 (만 14세 이상·처리방침·약관 동의를 함께 보낸다)
async function registerNickname(nickname) {
  const d = await api('register', { nickname, agree: true });
  if (d.error) throw new Error(d.error);
  await serverInit();
}

// 게임 서버(Edge Function "game")에 요청한다. 돌려받는 것: { error, view, serverNow, admin }
// error는 게임 규칙상 안 되는 이유(예: "이미 장수가 있어요"). 연결이 안 되면 예외를 던진다
async function api(action, payload = {}) {
  const { data, error } = await sb.functions.invoke('game', { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch (e) { /* 그대로 */ }
    throw new Error(msg);
  }
  return data;
}

async function serverSignOut() {
  if (sb) await sb.auth.signOut();
  ME = null;
}
