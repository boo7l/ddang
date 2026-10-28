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

// 구글 로그인 (2026-10-26): 구글이 주는 로그인 단추·팝업을 이 페이지에서 바로 쓴다 (Google Identity Services).
// Supabase 주소로 다녀오지 않아서, 구글 창에 서버 주소 대신 게임 주소가 보인다. 클라이언트 ID는 공개돼도 되는 값
const GOOGLE_CLIENT_ID = '634851733129-m5cvp1dlv758c7uksngpa95u0cgi311m.apps.googleusercontent.com';
let googleNonce = null; // 이번 로그인 시도의 일회용 값 (구글에는 해시를, Supabase에는 원래 값을 준다)
async function googleNonceHash() {
  googleNonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(googleNonce));
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}
// 구글이 돌려준 신분증(credential)으로 Supabase에 로그인한다
async function signInWithGoogleCredential(credential) {
  const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: credential, nonce: googleNonce });
  if (error) throw new Error(error.message);
  await serverInit();
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
  // 요청이 몰려 서버가 저장하지 못했으면(503) 1~2초 쉬었다가 한 번 더 조용히 보낸다 (2026-10-28).
  // 503이면 서버에 아무것도 저장되지 않았으므로 다시 보내도 두 번 처리되지 않는다
  for (let attempt = 0; ; attempt++) {
    // region: 서버 함수를 DB가 있는 시드니에서 돌린다 (가까운 곳에서 돌면 DB를 오갈 때마다 한국↔호주를 오가 느렸다, 2026-10-27)
    const { data, error } = await sb.functions.invoke('game', { body: { action, ...payload }, region: 'ap-southeast-2' });
    if (!error) return data;
    const status = error.context && error.context.status;
    if (status === 503 && attempt === 0) { await new Promise(ok => setTimeout(ok, 1000 + Math.random() * 1000)); continue; }
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch (e) { /* 그대로 */ }
    throw new Error(msg);
  }
}

async function serverSignOut() {
  if (sb) await sb.auth.signOut();
  ME = null;
}
