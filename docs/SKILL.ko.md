> **참고용 한글 번역입니다.** Claude Code가 실제로 로드·실행하는 파일은 저장소 루트의 `SKILL.md`(영문)입니다. 이 문서는 사람이 읽기 위한 번역이며, frontmatter의 `description`은 스킬 트리거링에 관여하지 않습니다.

---

## frontmatter (원문 그대로, 참고용 번역 포함)

```yaml
name: token-layout-system
description: >-
  Build a reusable, token-driven layout system in Next.js (App Router) with
  Tailwind v4 CSS-first @theme and shadcn/ui. Produces a 4-layer CSS token
  system (raw → semantic → layout → component), a Shell component with
  switchable 1/2/3 columns and a responsive sidebar-to-Sheet drawer, and
  shadcn components retrofitted so every color and dimension flows from one
  token source (dark mode with zero component edits). Use this whenever the
  user wants a design-token layout, a reusable Header/Footer/Sidebar Shell,
  column/grid layout variants, Tailwind v4 @theme token architecture, a
  shadcn component library wired to CSS variables, or asks to keep hardcoded
  px/hex out of components — even if they don't say "token system" by name.
```

번역: Next.js(App Router)에서 Tailwind v4 CSS-first `@theme`와 shadcn/ui로 재사용 가능한 토큰 기반 레이아웃 시스템을 만든다. 4계층 CSS 토큰 시스템(raw → semantic → layout → component), 1/2/3단 컬럼 전환과 반응형 사이드바→Sheet 드로어를 갖춘 Shell 컴포넌트를 만들고, 모든 색상·치수가 하나의 토큰 소스에서 나오도록 shadcn 컴포넌트를 retrofit한다(다크 모드는 컴포넌트 수정 없이 동작). 사용자가 디자인 토큰 레이아웃, 재사용 가능한 Header/Footer/Sidebar Shell, 컬럼/그리드 레이아웃 variant, Tailwind v4 `@theme` 토큰 아키텍처, CSS 변수에 연결된 shadcn 컴포넌트 라이브러리를 원할 때, 또는 "토큰 시스템"이라는 말을 쓰지 않더라도 컴포넌트에서 하드코딩된 px/hex를 없애 달라고 할 때 이 스킬을 사용한다.

---

# Token Layout System

**하나의 토큰 소스가 모든 색상과 치수를 결정하는** self-contained 레이아웃 시스템을 만듭니다. 얻는 것: `Shell`의 prop 하나로 1/2/3단을 바로 전환할 수 있고, `.dark`를 토글하면 트리(포털된 오버레이 포함) 전체가 컴포넌트 수정 없이 재배색되며, grep 가드가 raw `px`/`#hex`가 컴포넌트에 남지 않았음을 증명해 나중에 shadcn 레지스트리로 추출하기 쉬운 상태를 유지합니다.

스택: Next.js App Router · Tailwind v4 (CSS-first `@theme`, **`tailwind.config.js` 없음**) · shadcn/ui는 **CLI**로 (shadcn skill이 아님) · cva.

## 유일하게 타협 불가능한 규칙

**`src/components/**`에 raw `px`나 `#hex`를 넣지 않는다.** 모든 값은 토큰 참조여야 합니다 — `var(--token)`, `[var(--token)]` 형태의 arbitrary, 또는 소스에 px 리터럴 없이 rem으로 컴파일되는 Tailwind 스케일 유틸리티(`h-8`, `ring-3`, `min-w-24`). 이것이 시스템을 테마 가능하고 이식 가능하게 만드는 핵심이며, `scripts/verify.sh`가 이를 강제합니다. 토큰 *정의* 파일(`src/styles/**`)은 리터럴을 가져도 됩니다 — 그게 raw 레이어의 존재 이유입니다.

## 워크플로우

### 0. 스캐폴딩
```
npx create-next-app@latest <app> --typescript --tailwind --app --src-dir --import-alias "@/*"
cd <app>
npx shadcn@latest init -d          # Next + Tailwind v4를 감지하고 components.json을 작성
npx shadcn@latest add separator sheet skeleton
```
실제 설치되는 버전에 유의하세요: `create-next-app@latest`는 Next 16과, Radix가 아니라 `@base-ui/react` 기반의 shadcn 스타일(`base-nova`)을 설치할 수 있습니다. 접근 방식은 동일하며, base-ui API를 마주칠 것이라고 예상하면 됩니다 (`references/gotchas.md` 참고).

**무엇이 일반화되고 무엇이 스타일 종속적인가.** 어떤 스타일이 설치됐는지 확인하세요: `grep '"style"' components.json`을 실행하고 `button.tsx`가 `@base-ui/react`를 import하는지 `@radix-ui`를 import하는지 확인합니다. *아키텍처*는 항상 그대로 옮겨집니다 — 4계층 토큰, `@theme inline`, Shell, grep 가드, 검증 파이프라인은 스타일에 무관하므로 해당 asset을 그대로 복사하면 됩니다. 하지만 `assets/components/*`와 `references/gotchas.md`는 **base-ui / base-nova** 스타일을 기준으로 작성됐습니다. CLI가 Radix 기반 스타일을 설치했다면 이를 그대로 붙여넣을 게 아니라 *예제*로 취급하세요: 생성된 컴포넌트 내부 구현이 다르므로, 클래스 문자열을 그대로 복사하는 대신 `shadcn-retrofit.md`의 **원칙**(모든 `add` 이후 재-grep, 각 px/hex를 토큰에 매핑)을 적용하고, gotchas에 나온 것과는 다른 조합 규칙을 예상하세요. 스타일에 상관없이 변치 않는 사실 하나: 갓 생성된 shadcn 출력물은 raw px를 몰래 끼워 넣으므로, grep 후 retrofit하는 루프는 어느 쪽이든 필수입니다.

### 1. 토큰 레이어 — 직접 작성하지 말고 복사
`assets/tokens/`의 네 파일을 `src/styles/tokens/`로 복사하세요:
- **raw.css** — 순수 원시값만 (HSL 색상 스케일, `--space-1..8`, `--radius-*`, `--text-*`, font-weight). 시스템 전체에서 *유일하게* 리터럴이 존재하는 곳.
- **semantic.css** — 역할 기반 토큰(`--color-primary`, `--color-background`, `--color-danger`…)을 raw의 `var()`로 정의하고 `.dark`에서 재정의. 그리고 base-ui 내부가 읽는 접두사 없는 별칭(`--primary`…)도 포함.
- **layout.css** — `--header-height`, `--sidebar-width`, `--grid-3col-ratio`…
- **component.css** — 컴포넌트별 예외 토큰(`--button-radius`, `--input-height`, `--switch-*`…).

그런 다음 `src/app/globals.css`에 배선합니다 (`assets/globals.css` 복사): 네 파일을 import하고, `@theme inline`으로 노출합니다. `inline` 자기 참조(`--color-primary: var(--color-primary)`)가 핵심입니다 — gotcha #1 참고. 이렇게 하면 `bg-primary`, `text-muted-foreground`, `h-header`, `w-sidebar`, `text-2xl` 유틸리티가 생깁니다.

`globals.css`의 import 경로는 여러분의 트리 구조에 맞게 조정하세요 (`../styles/tokens/…`).

### 2. Shell + primitive — asset에서 복사
`assets/components/layout/`(`shell.tsx`, `header.tsx`, `footer.tsx`, `sidebar.tsx`, `layout.css`)을 `src/components/layout/`으로 복사합니다. 구조:
- `layout.css` — 바깥쪽의 **CSS Grid Template Areas**(`header`/`main`/`footer` 행). flexbox가 아니라 grid — 이 방식을 유지하세요.
- `shell.tsx` — cva 기반 컬럼 그리드. 모바일 드로어를 위해 `@/components/ui/sheet`를 import합니다 (이건 정당한 `registryDependency`이지 self-containment 위반이 아닙니다).

`Shell` props:
```ts
columns?: 1 | 2 | 3                       // 기본값 1
sidebarPosition?: "left" | "right" | "none"
header?, footer?, sidebar?, aside?: React.ReactNode
sidebarTitle?: string                     // 모바일 Sheet의 접근성 타이틀
```

### 3. 반응형 (shell.tsx에 이미 배선됨)
`3단 → (lg 미만) 2단 → (md 미만) 1단 + Sheet`; `2단 → (md 미만) 1단 + Sheet`. Tailwind 기본 브레이크포인트만 사용합니다; **커스텀 브레이크포인트 금지, 컴포넌트 안에 미디어쿼리 px 금지** (gotcha #6). `md` 미만에서는 사이드바가 숨고 shadcn `Sheet`를 통해 열립니다.

### 4. Atomic 컴포넌트 — CLI로 추가한 뒤 retrofit
```
npx shadcn@latest add button input badge card
```
생성된 파일은 **grep 가드를 즉시 위반합니다** (예: `ring-[3px]`, `rounded-[min(var(--radius-md),10px)]`). `references/shadcn-retrofit.md`(before/after 표)에 따라 각각 retrofit하세요. 그다음 Typography 컴포넌트를 추가합니다 (shadcn이 제공하지 않음) — `assets/components/typography.tsx`를 복사하세요; 이 컴포넌트는 raw의 `text-*`/`--leading-*`/`--weight-*` 스케일을 참조합니다.

### 5. 인터랙티브 컴포넌트 — 진짜 시험대
```
npx shadcn@latest add dialog dropdown-menu select switch tabs tooltip
```
grep 가드를 다시 돌리고 retrofit하세요 (같은 표 사용). 이 컴포넌트들은 **포털, 포커스, base-ui 조합 규칙**을 건드립니다 — 미묘한 버그가 숨어 있는 곳입니다. 배선하기 전에 `references/gotchas.md`를 읽으세요 (특히 #2 포털 다크모드, #3 `DropdownMenuGroup` 필수 조건, #4 `render`의 data-slot).

### 6. 검증 — 서로 보완하는 세 개의 게이트, 그리고 실제로 *실행*하기
`assets/playwright.config.ts`와 `assets/e2e/smoke.spec.ts`를 복사하고(라우트 목록을 여러분의 데모 페이지에 맞게 조정), Playwright를 **브라우저까지 포함해서** 설치한 다음, `scripts/verify.sh`를 실행하세요:
```
npm i -D @playwright/test && npx playwright install chromium
bash scripts/verify.sh        # grep 가드 → next build → playwright 스모크
```
세 개가 모두 필요한 이유: `DropdownMenuGroup` 버그는 grep, tsc, **그리고** build를 모두 통과합니다 — 포털이 열릴 때만 throw됩니다. **실행된** 스모크만이 이를 잡아냅니다.

**작성만 되고 실행된 적 없는 스모크 테스트는 아무것도 지켜주지 않습니다.** `playwright install`을 건너뛰거나, 스펙을 실행하지 않은 채 커밋하는 것은 모든 정적 게이트가 green인 채로 "여는 순간 throw되는" 잠복 버그를 그대로 출하하는 바로 그 실패 패턴입니다 — 실제로 확인된 사실: 스펙만 *작성*하고 "런타임상 안전해 보인다"고 판단한 실행 결과가 여는 순간 throw되는 bare `DropdownMenuLabel`을 그대로 출하했습니다. chromium 설치는 한 번만 하면 되는 비용입니다; 그 비용을 치르고, 실행을 게이트의 일부로 만드세요. `verify.sh`를 CI나 `"verify"` npm 스크립트에 연결해서, 누군가 기억할 때만이 아니라 모든 변경마다 런타임 레이어가 돌아가게 하세요.

## 완료 기준 체크리스트
- [ ] `bg-primary`, `h-header`, `w-sidebar`, `text-2xl` 유틸리티가 정상 resolve됨
- [ ] `Shell`의 `columns` prop이 한 페이지 안에서 1→2→3으로 전환됨 (레이아웃 코드 수정 없이)
- [ ] `md` 미만에서 Sheet 드로어로 전환되는 3→2→1 반응형
- [ ] `<html>`의 `.dark`가 레이아웃**과** 포털된 오버레이를 모두 재배색함, 코드 수정 없이
- [ ] `grep -rE "[0-9]+px|#[0-9a-fA-F]{6}" src/components` → 결과 없음
- [ ] 인터랙션 스모크가 **실제로 실행**됨(chromium 설치됨) 그리고 모든 오버레이를 열어봄 — 존재하지만 실행된 적 없는 스펙은 인정하지 않음
- [ ] `bash scripts/verify.sh` → 세 층 모두 green

## 파일
- `assets/tokens/*.css` — 4계층 토큰 스타터 (그대로 복사한 뒤 값만 조정)
- `assets/globals.css` — `@theme inline` 배선
- `assets/components/layout/*` — Shell / Header / Footer / Sidebar / grid CSS
- `assets/components/typography.tsx` — Typography (shadcn이 기본 제공하지 않음)
- `assets/playwright.config.ts`, `assets/e2e/smoke.spec.ts` — 런타임 게이트
- `scripts/verify.sh` — 3계층 검증 파이프라인
- `references/shadcn-retrofit.md` — before/after 클래스 표 (4–5단계에서 참고)
- `references/gotchas.md` — base-ui / Tailwind v4 함정 (5단계 전에 읽을 것)
