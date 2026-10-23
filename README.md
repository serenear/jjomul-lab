# 쪼물랩 (Jjomul Lab)

12~40개월 아이와 부모가 함께하는 **소근육 놀이 카드**를 만들고 배포하는 도구예요.
카드 1장 = YAML 1개 → 인쇄용 PDF(카드 / 주간 / 월간) + 비밀번호로 보는 웹 뷰어.

> 브랜드명 "쪼물랩"은 가칭이에요. 상표(KIPRIS)·SNS·상호 중복 확인 후 `src/render.mjs`의 `BRAND`만 바꾸면 돼요.

## 빠른 시작

```bash
npm install
npm run validate     # 카드 내용 검사 (표현·안전 규칙 포함)
npm run build        # output/A4/{cards,weekly,monthly}/*.pdf
npm run build:a5     # A5 크기로도 만들어 보기
npm test
```

Chromium은 `PLAYWRIGHT_BROWSERS_PATH`(또는 `CHROMIUM_PATH`)에 설치된 것을 써요.

## 카드 한 장 추가하기

1. `content/cards/<id>.yaml` 작성 — 파일명 = `id`. 예시는 `tear-autumn-tree.yaml`
2. 도안이 있으면 `content/art/<파일>.svg`를 넣고 `art:`에 파일명을 적어요 (직접 그린 오리지널만)
3. `npm run validate` → `npm run build`

| 필드 | 규칙 |
|---|---|
| `week` | 1부터. 주간 PDF는 같은 주차끼리, 월간 PDF는 4주씩 묶여요 |
| `weekday` / `theme` | 월 끄적이기·색칠 / 화 찢기·붙이기 / 수 몸놀이 / 목 집기·옮기기 / 금 촉감·감각 |
| `age_band` | `"12-24"` 또는 `"24-40"` (따옴표 필수) |
| `duration_min` | 10~20 |
| `steps` | 1~3단계 |
| `safety` | 보호자(부모님)와 함께한다는 문장 필수 |

`validate`가 자동으로 막는 것
- 효과 약속·임상 표현: 치료, 치유, 교정, 진단, 효과, 보장, 향상 (발달·훈련·학습은 주의 표시)
- 삼킬 수 있거나 위험한 재료: 구슬, 단추, 동전, 가위, 칼, 작은 솜공, 콩 (재료·순서에만 적용)

빌드는 내용이 한 페이지를 넘치면 멈춰요. 문장을 줄이거나 `design/tokens.css`의 글자 크기를 조절하세요.
색·폰트·여백은 모두 `design/tokens.css`에서 바꿔요 (요일별 포인트 컬러 포함).

## 뷰어: 비밀번호로 보기 + 인쇄

```bash
npm run viewer                                                  # http://localhost:3000
npm run code:issue -- --pack week-01 --days 7 --note 구매자이름 \
                      --base-url https://내주소                  # 보낼 메시지까지 출력
npm run code:list
npm run code:revoke -- <id>                                     # 즉시 폐기
```

- `--pack`: `week-01` / `month-01` / `card-<id>` 형식 (여러 번 지정 가능)
- 비밀번호는 `XXXX-XXXX`(난수). **서버에는 해시만 저장**하고 원문은 발급 직후 한 번만 보여요
- 유효기간은 발급 시각부터 `--days`일. 보는 중에 만료·폐기돼도 30초 안에 끊겨요
- **인쇄하기** 버튼은 `window.print()` → OS 기본 인쇄창. 휴대폰·PC 모두 같은 방식이에요
- 환경변수: `PORT`, `VIEWER_DATA_DIR`(기본 `viewer-data/`), `TRUST_PROXY=1`(프록시 뒤), `COOKIE_SECURE=1`(HTTPS)

### 보호 수준 (솔직한 한계)

이 뷰어는 **"새어 나가기 어렵게 + 새어 나가도 누구 건지 알 수 있게"** 만드는 방식이에요. 완벽 차단은 웹에서 불가능해요.

| 하는 것 | 못 하는 것 |
|---|---|
| 원본 PDF 파일을 공개하지 않음 (HTML로만 제공) | 인쇄창의 "PDF로 저장" 항목 제거 — OS 기능이라 불가 |
| 만료·폐기를 서버가 매 요청마다 검사 | 스크린샷·화면 녹화 완전 차단 — 불가 |
| 우클릭·복사·드래그·저장 단축키 차단 | 개발자도구를 쓰는 사람 막기 |
| 화면 전체 워터마크 + 인쇄물 하단 발급 ID | |
| 로그인 5회 실패 시 10분 잠금, 응답 캐시 금지 | |

유출이 걱정되면 구매자별로 비밀번호를 따로 발급하세요. 인쇄물·캡처에 남는 발급 ID로 출처를 알 수 있어요.

### 배포 메모

파일(JSON)에 저장하는 Node 서버라서 **디스크가 유지되는 곳**(VPS, Fly.io 볼륨 등)이 맞아요. Vercel 같은 서버리스에는
그대로 올릴 수 없어요. 서버리스를 쓰려면 `src/viewer/codes.mjs`의 저장소 부분만 DB(예: Supabase)로 바꾸면 돼요.

## 앞으로 정할 것

- [ ] 카드 크기 (지금은 A4 1장 = 카드 1장, A5도 빌드 가능)
- [ ] 연령 구간: 카드마다 한 구간 (지금) vs 둘 다 넣기
- [ ] 판매 플랫폼·가격, 메시지 발송 자동화 (지금은 CLI로 발급 → 직접 전송)
- [ ] 브랜드명 확정, 회사 겸업 규정 확인
- [ ] 20장 제작 (샘플 1장 톤 확인 후)
