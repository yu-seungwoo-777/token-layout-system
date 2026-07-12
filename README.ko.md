[English](README.md) | **한국어**

# token-layout-system

Next.js(App Router) + Tailwind v4 CSS-first `@theme` + shadcn/ui로 재사용 가능한 토큰 기반 레이아웃 시스템을 만드는 [Claude Code 스킬](https://docs.claude.com/en/docs/claude-code/skills)입니다.

4계층 CSS 토큰 시스템(raw → semantic → layout → component), 1/2/3단 컬럼과 반응형 사이드바→Sheet 드로어를 전환할 수 있는 `Shell` 컴포넌트, 그리고 모든 색상·치수가 하나의 토큰 소스에서 나오도록 retrofit된 shadcn 컴포넌트를 만들어 냅니다 — 다크 모드는 컴포넌트 코드 수정 없이 동작합니다.

## 설치

**방법 A — 패키징된 스킬 설치.** `.skill` 파일을 받아서(릴리즈에서 받거나, [skill-creator](https://github.com/anthropics/skills) 도구의 `package_skill.py`로 직접 패키징) 스킬 설치를 지원하는 Claude Code 클라이언트에서 "Save skill"을 누르면 됩니다.

**방법 B — skills 디렉토리에 바로 clone:**
```bash
git clone https://github.com/yu-seungwoo-777/token-layout-system ~/.claude/skills/token-layout-system
```

어느 쪽이든, `SKILL.md`의 `name`+`description`만 항상 Claude의 컨텍스트에 남아있습니다(수백 토큰 수준). 전체 워크플로우 본문·`assets/`·`references/`는 스킬이 실제로 트리거됐을 때만 로드됩니다 — 이게 skill 시스템의 progressive-disclosure 설계이고, 그래서 설치해 둬도 실제로 쓰기 전까진 비용이 들지 않습니다.

## 트리거 방식

"token-layout-system 스킬 써줘"라고 말할 필요가 없습니다. Claude Code는 새 요청을 설치된 모든 스킬의 `description`과 매칭하는데, 이 스킬은 정확한 문구가 아니라 **의도**에 반응하도록 작성돼 있습니다 — 디자인 토큰 레이아웃, 재사용 가능한 Header/Footer/Sidebar `Shell`, 1/2/3단 레이아웃 variant, Tailwind v4 `@theme` 토큰 아키텍처, CSS 변수에 연결된 shadcn 라이브러리를 요청하거나, 단순히 "컴포넌트에서 하드코딩된 px/hex 좀 없애줘"라고만 해도 완전히 새로운 무관한 프로젝트에서조차 트리거됩니다.

트리거되면 Claude는 아래 워크플로우를 그대로 재생하는 게 아니라 **여러분의 프로젝트에 맞게 적응**시킵니다 — asset 파일들이 출발점으로 복사되고, 그 다음 여러분이 실행한 `create-next-app`/`shadcn init`이 실제로 만들어낸 앱 구조와 shadcn 스타일에 맞춰 배선됩니다.

## 워크플로우

스킬은 7단계를 거칩니다. 전체 세부사항·정확한 명령어·완료 기준 체크리스트는 [`SKILL.md`](SKILL.md)(영문, Claude Code가 실제로 로드하는 원본)에 있습니다 — 여기서는 전체 형태만 짚습니다:

**0. 스캐폴딩.** `create-next-app` + `shadcn init` + `separator`/`sheet`/`skeleton`. 설치되는 shadcn *스타일*은 그때그때 다릅니다(Radix vs. 최신 `@base-ui/react` 기반 `base-nova`) — 어떤 API를 다루는지 가정하기 전에 `components.json`의 `"style"` 필드를 먼저 확인하세요.

**1. 토큰 소스 — 획득 또는 추출.** 디자인 소스가 무엇이냐에 따라 갈라집니다:
- **(A)** `src/styles/tokens/*.css`가 이미 있으면 → 건너뜁니다.
- **(B)** 디자인 소스가 있으면 → *토큰을 4계층으로 추출*합니다. `assets/scripts/extract-dc.mjs`는 **`.dc.html` 포맷 전용 참고 어댑터**(`node assets/scripts/extract-dc.mjs <file> --out src/styles/tokens`)입니다. Claude Design은 **SPA 번들**(`tokens/` 디렉터리 + `_ds_manifest.json`)도 내보내며 Figma/JSON일 수도 있는데, 이런 소스에는 [`references/dc-to-tokens.md`](references/dc-to-tokens.md)의 매핑 원리를 직접 적용합니다(`.dc.html` 어댑터는 읽지 못합니다). 추출은 *방향*이지 단일 도구가 아닙니다. 소스가 무엇이든 마지막에 `node assets/scripts/verify-tokens.mjs src/styles/tokens`로 검증합니다.
- **(C)** 소스가 없으면 → `assets/tokens/`의 기본 CSS 파일 4개를 `src/styles/tokens/`로 복사합니다:
  - `raw.css` — 순수 원시값만 (OKLCH 색상 스케일, `--space-1..8`, `--radius-*`, `--text-*`, font-weight). 시스템 전체에서 유일한 리터럴.
  - `semantic.css` — 역할 기반 토큰(`--color-primary`, `--color-background`, `--color-danger`…)을 raw의 `var()`로 정의하고 `.dark`에서 재정의.
  - `layout.css` — 구조 치수(`--header-height`, `--sidebar-width`, `--grid-3col-ratio`…).
  - `component.css` — 컴포넌트별 예외(`--button-radius`, `--input-height`…).

어느 쪽이든 4계층을 `globals.css`에 `@theme inline`로 배선합니다 — 이 자기 참조 패턴(`--color-primary: var(--color-primary)`)이 다크모드를 담당합니다. 순환 참조라 computed-value time에 invalid가 되어, 실제 값은 `:root`/`.dark`에서 소스 순서로 결정됩니다 (함정 #1에 검증된 메커니즘이 있고, 이 모양에서는 `inline` 키워드 자체는 장식적입니다).

**2. `Shell` + primitive.** header/main/footer 구조에 **CSS Grid Template Areas**(flexbox 아님)를 쓰는 cva 기반 레이아웃 컴포넌트:
```ts
columns?: 1 | 2 | 3                       // 기본값 1
sidebarPosition?: "left" | "right" | "none"
header?, footer?, sidebar?, aside?: React.ReactNode
sidebarTitle?: string                     // 모바일 Sheet 접근성 타이틀
```

**3. 반응형.** `3단 → (lg 미만) 2단 → (md 미만) 1단 + Sheet 드로어`; `2단 → (md 미만) 1단 + Sheet`. Tailwind 기본 브레이크포인트만 — 커스텀 브레이크포인트 금지, 컴포넌트 안에 미디어쿼리 px 금지.

**4. Atomic 컴포넌트.** `shadcn add button input badge card`를 실행한 뒤 [`references/shadcn-retrofit.md`](references/shadcn-retrofit.md)의 before/after 표대로 각각 retrofit합니다 — 갓 생성된 shadcn 출력물은 grep 가드를 즉시 위반하므로(`ring-[3px]`, `rounded-[min(var(--radius-md),10px)]` 등) 이 단계는 선택적 클린업이 아닙니다. `Typography`도 추가합니다(shadcn 기본 미제공).

**5. 인터랙티브 컴포넌트.** `shadcn add dialog dropdown-menu select switch tabs tooltip`, 같은 retrofit 과정. 포털·포커스·조합 규칙을 건드리는 부분이라 미묘하고 놓치기 쉬운 버그가 여기 숨어 있습니다. 먼저 [`references/gotchas.md`](references/gotchas.md)를 읽으세요.

**6. 검증 — 그리고 실제로 실행하기.** 3층 파이프라인(`scripts/verify.sh`):
```
grep 가드   →   next build   →   Playwright 인터랙션 스모크
(정적)          (컴파일)          (런타임 — 모든 오버레이를 열어봄)
```
base-ui 조합 버그(`DropdownMenuGroup` 밖에서 쓰인 `DropdownMenuLabel`)는 grep, `tsc`, **그리고** `next build`를 모두 통과합니다 — 실제로 컴포넌트를 열 때만 throw됩니다. **실행된** Playwright 실행만이 이를 잡아냅니다; 작성만 되고 실행된 적 없는 스펙은 아무것도 검증하지 못합니다.

## 유일하게 타협 불가능한 규칙

`src/components/**`에 raw `px`나 `#hex`를 넣지 않습니다. 모든 치수는 토큰 참조입니다 — `var(--token)`, `[var(--token)]` 형태의 arbitrary, 또는 소스에 리터럴 없이 rem으로 컴파일되는 Tailwind 스케일 유틸리티. 토큰 *정의* 파일(`src/styles/**`)만 예외입니다 — 그게 raw 레이어의 존재 이유입니다. `scripts/verify.sh`가 `src/components` 전체를 대상으로 `grep -rE "[0-9]+px|#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|rgba?\(|hsla?\(" src/components`로 이를 강제합니다. px/hex/rgb/hsl 리터럴은 잡지만, 단위 없는 매직 넘버(z-index, opacity 등)는 잡지 못하므로 사람이 직접 확인해야 합니다.

## 시작 전에 알아둘 함정 12가지

[`references/gotchas.md`](references/gotchas.md)를 요약했습니다 — 레퍼런스 구현을 만들며 실제로 디버깅 시간을 잡아먹었던 것들이고, `tsc`나 `grep` 어느 것도 이를 잡지 못합니다:

1. **`@theme inline` 자기 참조가 다크모드를 담당** — 자기 참조 `var(--color-primary)` 순환은 computed-value time에 invalid라서, 실제 값은 `:root`/`.dark`에서 소스 순서로 옵니다. 이 모양에서는 `inline` 키워드 자체가 장식적입니다(컴파일 검증 완료).
2. **`.dark` 클래스는 반드시 `<html>`에 있어야 함**, 중첩된 컨테이너가 아니라 — 포털된 컴포넌트(Dialog, Select, Tooltip…)는 `<body>` 루트에 렌더되고 `<html>`을 통해서만 테마를 상속받습니다.
3. **base-ui는 Radix보다 조합 규칙이 엄격함** — bare `DropdownMenuLabel`은 `DropdownMenuGroup`으로 감싸지 않으면 throw됩니다. 모든 정적 게이트는 통과하고 런타임에서만 실패합니다.
4. **`render={<Button/>}`는 `data-slot`을 재매핑함** — 합성된 트리거를 원래 slot 이름으로 타겟팅하지 마세요.
5. **토큰 *값* 오매핑은 모든 정적 게이트에 보이지 않음** — `--input-height: var(--space-8)`은 문법적으로 완벽하지만 의도한 높이의 2배로 렌더됩니다.
6. **반응형 브레이크포인트는 grep 대상 디렉토리 안에 미디어쿼리 px로 넣지 말고 TSX 안에 넣을 것.**
7. **사이드바의 구분선 테두리는 반드시 콘텐츠 쪽을 향해야 함**, `sidebarPosition`으로 계산해서 — 안 그러면 화면 중앙이 아니라 화면 가장자리에 걸립니다.
8. **작성만 되고 실행된 적 없는 스모크 테스트는 가짜 안전** — 브라우저를 설치하고 실제로 실행해야지, 안 그러면 아무것도 검증하지 못합니다.
9. **스케일 일부 재정의가 아니라 namespace reset(`--text-*: initial`)이 나머지를 삭제** — `--text-sm..--text-2xl`를 부분 재정의하면 기본값과 병합됩니다(검증됨); `--text-*: initial`을 써야만 손대지 않은 항목이 사라집니다.
10. **그리드 트랙 크기는 `columns`/`sidebarPosition` prop이 아니라 실제 전달된 콘텐츠를 따라야 함** — `sidebar`를 넘기지 않은 `columns={2}`는 그렇지 않으면 빈 `--sidebar-width` 트랙을 남깁니다.
11. **테마 토글은 프로덕션에서 `localStorage` + pre-hydration 스크립트가 필요함** — 안 그러면 페이지 이동마다 라이트로 리셋되고 잘못된 테마가 잠깐 비칩니다(FOUC).
12. **OKLCH는 취향이 아니라 opacity modifier를 정직하게 만드는 조건** — Tailwind v4는 `bg-primary/50`을 `color-mix(in oklab, …)`로 컴파일하는데, 소스가 OKLCH일 때만 지각적으로 정확하게 섞입니다. HSL 소스는 shadcn이 자주 쓰는 `/N` 단계마다 색상/명도가 빗나가고, 파이프라인의 어떤 게이트도 이를 잡지 못합니다.

## 구성

- `SKILL.md` — Claude Code가 실제로 로드하는 워크플로우 파일(영문 전용 — 번역해도 Claude Code의 동작에는 영향이 없어 별도 한글본은 두지 않습니다).
- `assets/` — 토큰 CSS 스타터, `Shell`/`Header`/`Footer`/`Sidebar`, `globals.css` 배선, `Typography`, Playwright 설정 + 스모크 스펙
- `assets/scripts/extract-dc.mjs` — **참고 어댑터**: `.dc.html` 포맷 → 4계층 토큰(Step 1, branch B). `__fixtures__/mini.dc.html` + `extract-dc.test.mjs` 계약 테스트 포함 (`node --test assets/scripts/extract-dc.test.mjs`). 한 소스 포맷용이며, 다른 소스에는 원리를 적용.
- `assets/scripts/verify-tokens.mjs` — **포맷 독립적** 토큰 검증기(모든 소스): 단절 `var()` 참조, Typography 의존, dark-pair 완전성, WCAG. `verify-tokens.test.mjs` 계약 테스트 (`node --test assets/scripts/verify-tokens.test.mjs`).
- `references/workflow.md` — 7단계 빌드 워크플로의 상세 (각 단계 진입 시점에 읽기)
- `references/dc-to-tokens.md` — DC `.dc.html` 추출 상세: 매핑 표, 배선, WCAG/트러스트 노트 (Step 1 branch B용)
- `references/shadcn-retrofit.md` — shadcn 생성물을 토큰 레이어에 맞게 고치는 전체 before/after 클래스 표
- `references/gotchas.md` — 위 12가지 함정의 전체 상세 설명
- `scripts/verify.sh` — 3계층 검증 파이프라인
- `evals/evals.json` — 이 스킬을 스킬 없는 baseline과 비교 검증할 때 쓴 테스트 프롬프트
- `evals/rubrics.md` — 평가 재현 가능하게 만드는 pass/fail 체크리스트(eval별 하나). 각 항목은 이진(파일 존재, grep 결과, exit code)이라 두 명의 평가자가 같은 점수에 도달합니다

## 벤치마크

원래 3개 프롬프트 벤치마크(스킬 사용 vs. baseline, 스킬 미사용) 기준, 구조·정합성 어서션에서 **20/20 대 16/20** (어서션 목록은 `evals/rubrics.md`에 있습니다). 가장 뚜렷한 차이는 4계층 토큰 구조(토큰을 한 파일에 인라인하지 않고 분리)와, 모든 정적 게이트를 통과하는 `DropdownMenuGroup` 런타임 버그(함정 #3)를 잡아낸 것입니다. 함정 #5(조용한 토큰 값 오매핑)를 겨냥한 후속 평가는 **변별력이 없었습니다** — 강한 baseline 모델은 실패 모드가 설명되기만 하면 스스로 동등한 치수 비교 체크를 유기적으로 만들어냈습니다. 이건 오히려 이 스킬의 가치가 어디에 집중돼 있는지 알려주는 유용한 발견입니다: 일반적인 "검증을 더 추가하는" 엔지니어링이 아니라, **구조적 관례**와 **눈에 안 띄는 런타임 조합 규칙**에 있다는 것입니다. 평가 슈트는 이후 9개 프롬프트(`evals/evals.json`)로 늘어 스타일 드리프트, 의도 기반 트리거링, OKLCH 정합성, 그리고 조용한 다크모드 회귀(`.dark`를 `<html>`이 아닌 곳에 두는 것)를 다루지만 — 이후 eval들은 변별 테스트이지 원래 20/20-vs-16/20 점수표의 일부는 아닙니다.
