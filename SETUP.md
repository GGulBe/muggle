# 1단계 설정: Supabase + 카카오 로그인

순서대로 하면 약 30분 걸린다. 1~3은 Supabase, 4는 카카오, 5는 앱 실행.

## 1. Supabase 프로젝트 만들기
1. https://supabase.com 가입 → New project (Region: Northeast Asia (Seoul))
2. DB 비밀번호는 따로 저장해 둔다.

## 2. 스키마와 더미데이터 넣기
Dashboard > SQL Editor에서 아래 두 파일 내용을 **순서대로** 붙여넣고 Run.
1. `supabase/migrations/20261127000000_init.sql`
2. `supabase/seed.sql`

확인: Table Editor에서 stations 30, places 150, parties 2(DEMO01, DEMO02)가 보이면 성공.

## 3. 추천 함수 배포
```bash
npx supabase login
npx supabase link --project-ref <project-ref>   # URL의 https://<project-ref>.supabase.co
npx supabase functions deploy recommend
```

## 4. 카카오 로그인 연결
**카카오 디벨로퍼스** (https://developers.kakao.com)
1. 내 애플리케이션 → 애플리케이션 추가하기
2. 앱 설정 > 앱 > 플랫폼 키 > **REST API 키** 복사 (= Client ID)
3. 같은 REST API 키 설정에서
   - 카카오 로그인 Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - 카카오 로그인 Client Secret 코드 복사, **활성화**
4. 제품 설정 > 카카오 로그인 > 일반: 상태 **ON**
5. 제품 설정 > 카카오 로그인 > 동의항목: **닉네임**, **프로필 사진** 설정
6. **이메일 동의항목 (필수 작업)**: Supabase가 `account_email`을 항상 요청하므로, 없으면 카카오가 KOE205(invalid_scope)를 낸다.
   1. 우측 상단 프로필 > 계정 설정 > **본인인증** 완료
   2. 앱 > 일반 > 비즈니스 정보 > **개인 개발자 비즈 앱** 전환 (사업자등록번호 불필요, 카카오비즈니스 통합 서비스 약관 동의)
   3. 카카오 로그인 > 동의항목 > 개인정보 탭 > **카카오계정(이메일)** 설정 > **선택 동의** 저장

**Supabase Dashboard**
1. Authentication > Sign In / Providers > Kakao: Enabled, Client ID·Client Secret 입력
2. 같은 화면에서 **Allow users without an email** 켜기
3. Authentication > URL Configuration > Redirect URLs에 추가
   - `exp://**` (Expo Go 개발용)
   - `muggle://**` (빌드한 앱용, app.json의 scheme)

## 5. 앱 실행
```bash
cp .env.local.example .env.local   # Project Settings > API의 URL과 publishable(anon) key 입력
npx expo start                     # iPhone/Android의 Expo Go로 QR 스캔
```
"카카오로 시작하기" → 카카오 로그인 → "<닉네임>님, 안녕하세요"가 나오면 1단계 완료.

## 검사
```bash
npm test   # 추천 알고리즘 + DB 규칙(블라인드·익명 투표·완료 흐름) 검사, Supabase 계정 없이 실행됨
```

## 막히면
| 증상 | 원인 |
| --- | --- |
| 카카오 화면에 KOE205 | 이메일 동의항목 미설정. 4-6 진행 |
| 로그인 후 앱으로 안 돌아옴 | Redirect URLs에 `exp://**` 누락 |
| "로그인 응답에 토큰이 없습니다" | Supabase Kakao Client Secret 오타 또는 비활성화 |
