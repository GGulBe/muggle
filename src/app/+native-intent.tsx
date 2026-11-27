// 로그인 복귀 딥링크(.../auth-callback#access_token=...)는 화면이 아니라
// _layout의 Linking 리스너가 처리하므로, 라우터는 홈으로 보낸다 (없는 경로 화면 방지)
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return path.includes('auth-callback') ? '/' : path;
}
