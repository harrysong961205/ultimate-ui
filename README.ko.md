# Ultimate UI

**AI 에이전트가 일일이 말해 주지 않아도 무너지지 않는 UI를 만들게 한다.**

[English](README.md)

에이전트가 만든 화면은 컴파일되고 타입 검사도 통과하는데, 기본이 틀리는 경우가 많다.
- 먼저 봐야 할 것이 스크롤 아래에 있다.
- 조회 실패가 「없음」처럼 보인다.
- 짐작이 사실처럼 보인다.
- 화면마다 색과 간격을 새로 만든다.

Ultimate UI는 세 곳에서 이를 막는다.

| 층 | 하는 일 | 강제 |
|---|---|---|
| **기획 → 화면 계약** | 누가 어떤 결정을 하려고 이 화면을 여는지 적는다. 보여 주는 정보마다 어느 질문에 답하는지, 강조는 이유와 실패 사례가 있는 관계 규칙으로, 반드시 찍을 상태 × 폭을 적는다 | `uui contract`: 형식과 승인된 하한선. 하한선은 몰래 낮출 수 없다 |
| **값 → 디자인 토큰** | 간격·반경·글자·색은 토큰에서만 가져온다. 지금 있는 위반은 줄어들기만 하는 부채 목록으로 고정한다 | 빌드 앞의 `uui literals`(실제로 막는 관문), 편집 직후 우회를 에이전트에게 알리는 Claude Code 훅, 실제 화면의 렌더 감사(인라인 스타일·합성 대비 근사치) |
| **검수 → 실제 스크린샷** | 필수 상태를 fixture로 찍는다. 계약의 규칙마다, 그리고 품질 기준 여덟 가지마다 판정·관찰·증거가 있어야 한다. 이미지는 해시하고 PNG 구조를 검사한다 | `uui review`: 판정 안 된 규칙·기준, 빠진 상태, 실패한 검사, 찍은 뒤 바뀐 화면 소스, 열린 중요 문제가 있으면 미완료 |

스킬에는 색채학 기초에서 뽑은 **색 가이드**도 들어 있다.
- 색은 실제 주변 위에서 판단한다.
- 명도 → 채도 → 색상 순으로 계획한다.
- 강조는 좁게 쓴다.
- 색 하나에 뜻 하나만 둔다.
- 흑백으로 먼저 본다.

자세한 내용은 [color.ko.md](skills/ultimate-ui/references/color.ko.md)를 본다.

## 설치

### Claude Code 플러그인 (스킬 + 편집 훅)

```
/plugin marketplace add harrysong961205/ultimate-ui
/plugin install ultimate-ui@ultimate-ui
```

스킬은 UI 작업에서 읽힌다. 편집 훅은 프로젝트에 `ultimate-ui.config.json`이 있을 때만 동작한다.

### 프로젝트에 검사기 넣기

```bash
npm i -D github:harrysong961205/ultimate-ui postcss typescript
npx uui init
```

지금 있는 위반을 한 번 고정한다. 목록을 늘리는 일은 사람이 결정하고, 이때 한 번만 한다.

```bash
npx uui literals --update-baseline --allow-growth
```

그다음 빌드 앞에 건다.

```json
{ "scripts": { "build": "uui literals && vite build" } }
```

### 다른 에이전트 (Codex, Cursor 등)

규칙은 [`skills/ultimate-ui/`](skills/ultimate-ui/)에 있는 Markdown 파일이다. `AGENTS.md` 같은 지침 파일에서 `SKILL.md`를 가리키게 한다. 빌드 관문과 `uui review`는 누가 코드를 고쳤든 똑같이 동작한다.

## 명령

| 명령 | |
|---|---|
| `uui init` | 설정 파일과 계약 폴더를 만든다 |
| `uui literals` | 토큰 우회 정적 검사. 새 위반이면 종료 코드 1 |
| `uui literals --update-baseline` | 부채 목록을 남은 만큼으로 줄인다. 늘리지는 않는다 |
| `… --allow-growth` | 새 위반을 목록에 넣는다. **사람이 결정할 일**이다 |
| `uui contract [id]` | 화면 계약 형식과 하한선을 검사한다 |
| `uui review <dir> [--accept]` | 검수 실행을 검사한다. `--accept`는 하한선과 소스 해시를 원장에 남긴다 |

## 하지 못하는 것

- 계약의 질문이 옳은지, 정말 그것이 먼저 눈에 들어오는지는 판정하지 못한다. 실제 스크린샷을 보고 판단해야 한다.
- 이미지, `evidence.json`, `review.json`을 함께 바꾸는 위조는 막지 못한다. 막으려면 CI에 증거를 남긴다.
- 편집 훅은 `PostToolUse` 훅이다. 알릴 때는 이미 파일이 고쳐진 뒤라 되돌리지 않고 에이전트에게 고치라고 알린다. Claude Code 안에서만 돈다. 실제로 막는 것은 빌드 관문이다.
- 대비는 계산된 스타일로 구한 근사치다. 픽셀을 재지 않는다. 이미지도 PNG 구조와 크기만 검사하고 픽셀 내용은 보지 않는다.

## 라이선스

코드와 문서: MIT.

색 가이드는 제3자 영상(블랙스완, YouTube)을 출처와 함께 요약하고 짧게 인용한다. 이 인용과 번역은 원저작자의 것이며 MIT 라이선스에 포함되지 않는다.
