'use strict';

// ===== 서버 (Supabase) 연결 =====
// 공개용 키라서 게임 파일에 넣어도 괜찮다. 진짜 비밀 키(secret)는 절대 여기 넣지 않는다.
const SUPA_URL = 'https://zycnheerlcsngdtpnkhj.supabase.co';
const SUPA_KEY = 'sb_publishable_0V5WhlkuNWYr76Wy5Co_TQ_tXemKUr9';
const sb = window.supabase ? window.supabase.createClient(SUPA_URL, SUPA_KEY) : null;

// 지금 접속한 사람: { id, nickname } (없으면 null). nickname = 아이디 (계정 이름)
let ME = null;

// 로그인 = 아이디 + 비밀번호. Supabase는 이메일로 로그인하므로 아이디를 가짜 이메일로 바꿔 쓴다
// (한글 아이디도 되도록 글자를 16진수로 적는다. 진짜 메일은 보내지 않는다)
const idToEmail = id => 'u' + Array.from(new TextEncoder().encode(id.toLowerCase()), b => b.toString(16).padStart(2, '0')).join('') + '@sam.game';
const ID_RULE = /^[0-9A-Za-z가-힣_]{2,8}$/;
// Supabase는 비밀번호를 6자 이상만 받는다. 게임은 4자부터 받으므로 뒤에 정해진 글자를 붙여 넘긴다 (서버 함수의 realPw와 같아야 한다)
const realPw = pw => pw + '::sam';

async function serverInit() {
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  const u = data.session && data.session.user;
  ME = null;
  if (!u) return true;
  const { data: prof, error } = await sb.from('profiles').select('nickname').eq('id', u.id).maybeSingle();
  if (error) throw error;
  // 예전 방식(닉네임만)으로 만든 계정이나 프로필이 없는 계정은 더 쓰지 않는다
  if (!prof || u.is_anonymous) { await sb.auth.signOut(); return true; }
  ME = { id: u.id, nickname: prof.nickname };
  return true;
}

const LOGIN_FAIL = '아이디나 비밀번호가 맞지 않아요.';

async function signIn(id, pw) {
  const { data, error } = await sb.auth.signInWithPassword({ email: idToEmail(id), password: realPw(pw) });
  if (error) throw new Error(/invalid/i.test(error.message) ? LOGIN_FAIL : error.message);
  await serverInit();
  if (!ME) throw new Error(LOGIN_FAIL);
  return data;
}

// 계정 만들기는 서버 함수가 한다 (아이디 중복 검사·확인 메일 없이 바로 쓰는 계정). 만든 뒤 바로 로그인
async function signUp(id, pw) {
  const d = await api('signup', { id, pw });
  if (d.error) throw new Error(d.error);
  await signIn(id, pw);
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
