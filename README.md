# trash-map-demo · 캠퍼스 순환지도

인하대학교 창의융합세미나 체험 부스에서 쓰는 학생 참여형 분리수거 지도입니다. 스마트폰으로 수거함을 찾아 품목별 포화도를 보고 설치를 건의할 수 있습니다. 운영자는 노트북에서 건의·신고를 검토하고, 직접 고른 위치에 설치를 승인합니다. 건물은 용현캠퍼스의 실제 건물을 기준으로 하고, 수거함·관리 구역·센서값·학생 의견은 모두 시연용입니다.

| 경로 | 용도 |
| --- | --- |
| `/` | 지도, 검색, 품목 필터, 품목별 신고, 위치 지정 건의 |
| `/requests` | 현재 방문자 쿠키로 접수한 건의의 처리 현황 |
| `/guide` | 6종 품목 분리배출 안내 |
| `/admin` | 서버 PIN 로그인, 적재 통계, 건물별 수요, 승인·설치, 센서 및 초기화 |

## 부스 접속

- [학생용 지도](https://trash-map-demo.vercel.app/)
- [관리자 대시보드](https://trash-map-demo.vercel.app/admin)
- [인쇄용 학생 QR](public/booth-qr.png) · 720 × 720 PNG, 학생용 루트 URL로 디코딩 검증
- Production 관리자 PIN은 운영자에게 별도로 전달합니다. 로컬 시연 PIN은 `1234`입니다.

## 로컬 실행

Node 24, npm, Docker를 사용합니다. 패키지와 Supabase CLI 버전은 lockfile에 고정했습니다.

```sh
npm ci
npx supabase start
npx supabase status
cp .env.example .env.local
```

CLI가 전용 로컬 PostgreSQL에 마이그레이션과 `supabase/seed.sql`을 적용합니다. 출력된 로컬 URL, 공개 키, 서버 키를 아래 표에 맞게 `.env.local`에 입력하세요. 인스턴스 메모리나 브라우저 저장소에 공유 업무 데이터를 두지 않습니다. 대시보드, 메일, 저장소가 필요 없는 테스트에서는 다음 명령으로 필수 서비스만 시작할 수 있습니다.

```sh
npx supabase start -x studio,postgres-meta,mailpit,imgproxy,logflare,vector,supavisor,storage-api,edge-runtime
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. 브라우저에서 카카오 SDK를 사용할 로컬 출처도 등록하세요. 카카오 설정 없이도 실제 DB에 연결된 가상 배치도에서 좌표를 선택할 수 있습니다.

| 환경변수 | 설정 |
| --- | --- |
| `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` | Kakao Developers 앱의 **JavaScript 키** |
| `NEXT_PUBLIC_SUPABASE_URL` | 전용 프로젝트 URL 또는 로컬 API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable 키. 로컬 CLI의 anon 키도 지원 |
| `SUPABASE_SECRET_KEY` | 서버 전용 Supabase secret 키. 로컬에서는 service_role 키도 지원 |
| `SUPABASE_BOOTH_RPC_TOKEN` | 서버 전용 대체 경로. 전용 Edge Function을 사용하는 배포에서는 이 값으로 위 서버 키를 대신함 |
| `DEMO_ADMIN_PASSWORD` | 부스 로컬 시연 PIN은 `1234`. Production은 별도 난수 PIN을 Vercel Sensitive 변수로 관리 |
| `DEMO_SESSION_SECRET` | `openssl rand -hex 32`로 생성한 독립 난수. 변경하면 기존 쿠키가 만료됨 |

## Supabase 배포

1. 프로젝트 이름과 **project ref**를 함께 대조합니다. 이 부스 전용 프로젝트는 `trash-map-demo` (`akjarnmussionamvypes`)입니다.
2. 새 프로젝트를 구성할 때 CLI에서 `npx supabase login`, `npx supabase link --project-ref <전용-ref>`, `npx supabase db push --include-seed` 순으로 실행합니다. SQL Editor를 쓰면 `supabase/migrations`의 SQL을 파일명 순서대로 적용하고 `supabase/seed.sql`을 한 번 실행합니다. 이미 적용한 migration을 재실행할 필요는 없습니다.
3. 마이그레이션은 `booth` 비공개 스키마, 업무 테이블, RLS, 서버 전용 RPC, `public.demo_revision`의 공개 읽기 정책과 `supabase_realtime` publication 등록을 구성합니다. Data API에는 `public`을 노출하고 `booth`는 비공개로 유지합니다. 시드는 version 0인 경우에만 실행됩니다.
4. SQL Editor에서 다음 결과를 확인합니다. 첫 시드의 거점은 8개입니다. 마지막 쿼리는 한 행이어야 합니다.

```sql
select count(*) from booth.bins;
select version, epoch from public.demo_revision;
select tablename from pg_publication_tables
where pubname='supabase_realtime' and tablename='demo_revision';
```

### 서버 자격증명 선택

일반 설치는 서버의 `SUPABASE_SECRET_KEY`로 RPC를 직접 호출합니다. 이 저장소의 운영 배포는 Supabase 서버 키를 프로젝트 안에 보관하는 대체 경로도 제공합니다. Next.js가 서버 인증과 입력 검증을 마친 뒤, 인증된 `booth-rpc` Edge Function을 통해 스냅샷, 로그인 횟수, 업무 변경 RPC만 호출합니다. 브라우저에는 서버 토큰이나 관리자 데이터가 전달되지 않습니다.

다른 프로젝트에서 이 경로를 쓰려면 32바이트 난수를 64자 소문자 hex로 생성하여 Vercel의 Sensitive `SUPABASE_BOOTH_RPC_TOKEN`에 저장합니다. 같은 문자열의 SHA-256 hex digest를 **개행 없이** 계산하여 Supabase 함수 secret `BOOTH_RPC_TOKEN_SHA256`으로 등록하고 `npx supabase functions deploy booth-rpc --project-ref <전용-ref>`를 실행합니다. 함수는 헤더의 자격증명을 검증합니다. 저장소의 공개 digest 기본값은 지정된 부스 프로젝트 URL에서만 유효합니다. 토큰 교체 시 두 서비스 설정을 함께 갱신하세요.

## 데이터와 동기화

- Next.js App Router, TypeScript, React, Tailwind CSS, shadcn/ui 방식의 Radix Dialog, Lucide, Motion, Kakao Maps JS SDK, Supabase PostgreSQL 및 Realtime을 사용합니다.
- 단일·종합 수거함의 색상은 품목에 고정됩니다. 종합 거점에서 필터를 적용해도 상세 패널은 설치된 모든 품목의 개별 값을 보여줍니다.
- Next.js는 방문자별 서명 쿠키와 2시간 관리자 세션을 서버에서 검증합니다. 로그인은 클라이언트 식별값 해시별 15분간 최대 8회입니다. 쿠키에는 HttpOnly, SameSite=Lax, HTTPS 환경의 Secure를 적용합니다. 상태 변경은 JSON과 동일 출처를 확인합니다.
- 모든 업무 쓰기는 revision 행 잠금, epoch 확인, 멱등성 확인, 업무 변경, version 증가를 한 트랜잭션에서 수행합니다. 모든 참여자가 revision UPDATE 신호를 받으면 자기 권한에 맞는 snapshot을 재조회합니다. 재연결·탭 복귀·서울 날짜 변경도 반영합니다. 구독 장애 시 7초마다 조회합니다.
- 건물별 우선순위는 **3 × 미처리 건의 + 미반영 유효 신고**입니다. 미처리는 접수·검토 중이며, 신고는 서울 시간 오늘 포함 7개 달력 날짜입니다. 동점은 건의 수, 신고 수 내림차순, zoneId 오름차순입니다. 센서의 80% 진입은 별도 통계입니다.
- 승인할 때 위치 지정 모드에 들어간 시점의 ID 목록을 고정합니다. 운영자가 선택한 건만 한 트랜잭션에 묶습니다. 승인 이후 설치 완료를 눌러야 새 거점 1개와 품목별 0% 상태가 생성됩니다.
- 초기화는 모든 방문자의 업무 데이터를 시드로 복원하고 epoch를 교체합니다. 이전 화면의 지연된 요청은 거절합니다. 로그인과 방문자 쿠키는 계속 유효합니다. 새로고침으로 초기화되지 않습니다.

## 지도와 디자인

공식 캠퍼스 배치도의 건물명 및 배치와 공개 지리 자료의 위치를 대조했습니다. 여덟 중심점을 기준으로 캠퍼스 경계 안을 분할한 Polygon을 고정 데이터로 배포합니다. 클라이언트와 서버 모두 공유 경계에서 zoneId 오름차순으로 한 구역을 선택합니다. 건물 도형과 보행로를 표시하는 폴백은 실제 카카오 타일과 구분해 표시합니다.

- [인하대학교 모집요강 캠퍼스 안내도](https://inha.uway.com/file/2026_inha_js.pdf)
- [용현캠퍼스 지리자료와 출처 메타데이터](https://github.com/sw011124/inha-campus-preview)
- [OpenStreetMap 기여자 및 ODbL](https://www.openstreetmap.org/copyright). `lib/footprints.json`, `lib/landscape.json`, `lib/zones.json`의 파생 지리 데이터는 ODbL로 제공합니다.

프로젝트 루트에서 명세의 설치 명령을 실행했습니다. 기본 npm 캐시가 쓰기 불가능해 쓰기 가능한 캐시로 재실행했습니다.

```sh
npx --yes skills add nutlope/hallmark --skill hallmark --agent codex --yes
```

설치 경로는 `.agents/skills/hallmark/`입니다. Hallmark 2.0.0의 Wayfind 앱 화면 지침을 바탕으로 녹색 안내 표지, 한글 가변 글꼴, 품목별 고정색, 지도와 목록의 계층을 구성했습니다. 모바일 시트, 패널 이동, 선택 핀, 순위 이동은 reduced-motion을 지원합니다. 대비, 간격 토큰, 텍스트 가림을 렌더 검증한 뒤 수정했습니다.

## 테스트

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E는 로컬 Supabase URL을 설정한 상태에서 실행합니다. 테스트 서버는 포트 3100을 사용합니다. 테스트가 로컬 데이터를 초기화하므로 시연 중인 서버와 분리하세요. 시스템 Chromium을 쓰면 `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`로 실행합니다. `TEST_ADMIN_PIN`으로 테스트용 로컬 PIN을 지정할 수 있습니다. DB 테스트는 독립 PGlite에서 실제 SQL을 실행하며, E2E는 로컬 Supabase의 PostgREST와 Realtime을 통과합니다.

Hallmark 렌더 검증에는 Chromium과 puppeteer-core가 필요합니다. 앱을 실행하고 다음 명령을 사용합니다.

```sh
node .agents/skills/hallmark/scripts/sloplint.mjs app/globals.css components/student.tsx components/admin.tsx --scope app --genre modern-minimal --render --url http://localhost:3000/ --url http://localhost:3000/admin
```

### 검증 기록

전용 Supabase에 버전 관리된 마이그레이션 5개와 시드를 적용했습니다. 8개 건물 중심의 SQL 구역 판정, Realtime publication, 익명 역할의 업무 RPC 실행 차단을 확인했습니다. Vercel Production의 학생 지도와 학생 snapshot은 HTTP 200이었고, 응답에는 가상 거점 8개가 있었습니다.

로컬에서 타입 검사, ESLint, Production 빌드, SQL·단위 테스트 8개와 Playwright 시나리오 2개가 통과했습니다. Playwright는 독립 Chromium 컨텍스트 세 개와 실제 로컬 Supabase를 사용했습니다. Hallmark 렌더 검증은 학생 지도와 로그인한 관리자 화면에서 FAIL 0, REFLEX 0이었습니다. 남은 WARN 4개는 공용 패널 표면 2건과 화면별 글꼴 굵기 수 2건입니다. 입력 테두리 대비, 스크롤 영역의 텍스트 가림, 작은 화면의 관리자 조작 버튼 줄바꿈을 수정했습니다.

운영 주소의 다중 브라우저 시나리오는 검증 환경의 네트워크 터널 제한으로 실행하지 못했습니다. Kakao JavaScript 키와 도메인 등록 전에는 실제 카카오 타일 검증이 보류되며 가상 배치도가 표시됩니다.

## Vercel, 카카오 도메인과 QR

1. Vercel에서 이 GitHub 저장소를 Import하고 Next.js, Node 24, 저장소 루트를 선택합니다. Production 환경변수를 등록한 뒤 배포합니다. 공개 변수 변경 시 새 빌드가 필요합니다.
2. Kakao Developers의 앱에서 카카오맵 사용을 활성화합니다. JavaScript 키의 허용 웹 도메인에 **실제 Production 별칭의 출처** 및 사용할 로컬 출처를 등록합니다. [카카오맵 설정](https://developers.kakao.com/docs/ko/kakaomap/common) · [JavaScript SDK](https://apis.map.kakao.com/web/guide/)
3. Production 도메인의 `/`를 시크릿 창으로 열어 거점 8개, 지도 공급자 표시, 상세 패널, DB 연결을 확인합니다. 운영자 노트북에서 `/admin`으로 로그인합니다. 방문자 접속 도메인에는 Vercel 로그인 보호가 없어야 합니다.
4. QR 대상은 **Production 별칭의 루트**입니다. 미리보기 URL이나 관리자 경로를 사용하지 않습니다. 실제 URL로 `npx --yes qrcode -o booth-qr.png "https://<확인된-도메인>/"`을 실행한 뒤 휴대폰 카메라로 읽어 확인합니다.

## 부스 시연 순서

1. 방문자 두 명이 별도 휴대폰으로 지도를 열고 노트북에서 관리자 대시보드를 엽니다.
2. 5호관의 남은 음료 수거함을 선택합니다. 관리자가 센서값을 80% 이상으로 올리면 상세 값과 적재 통계가 바뀝니다.
3. 학생이 같은 구역에 설치를 건의하고 가득 참을 신고합니다. 건의 1건에 3점, 유효 신고 1건에 1점이 더해집니다. 동일 방문자의 동일 거점·품목은 10분 쿨다운입니다.
4. 관리자가 순위의 건물명을 눌러 주황색 건의 핀과 빨간 신고 배지를 살펴봅니다. 위치를 직접 지정한 뒤 반영할 건을 확인하고 승인합니다.
5. 설치 완료를 눌러 방문자 지도에 새 거점이 나타나는지, 학생의 내 건의가 설치 완료로 바뀌는지 확인합니다.
6. 다음 팀을 받기 전 관리자 전역 초기화의 경고를 확인하고 시드로 복원합니다.

익명 이력은 브라우저 쿠키에 연결됩니다. 쿠키를 삭제하거나 다른 브라우저로 접속하면 새로운 방문자가 됩니다. 카카오 도메인이나 통신 설정이 빠지면 가상 배치도와 위치 선택을 사용할 수 있습니다. DB 연결이 끊기면 화면에 오류를 표시하고 재연결을 시도합니다.
