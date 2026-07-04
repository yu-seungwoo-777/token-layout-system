[English](README.md) | **한국어**

# token-layout-system

Next.js(App Router) + Tailwind v4 CSS-first `@theme` + shadcn/ui로 재사용 가능한 토큰 기반 레이아웃 시스템을 만드는 [Claude Code 스킬](https://docs.claude.com/en/docs/claude-code/skills)입니다.

4계층 CSS 토큰 시스템(raw → semantic → layout → component), 1/2/3단 컬럼과 반응형 사이드바→Sheet 드로어를 전환할 수 있는 `Shell` 컴포넌트, 그리고 모든 색상·치수가 하나의 토큰 소스에서 나오도록 retrofit된 shadcn 컴포넌트를 만들어 냅니다 — 다크 모드는 컴포넌트 코드 수정 없이 동작합니다.

## 설치

이 저장소를 skills 디렉토리에 넣거나, 스킬 설치를 지원하는 Claude Code 클라이언트에서 패키징된 `.skill` 파일을 사용하세요.

## 구성

- `SKILL.md` — 워크플로우 (0–6단계: 스캐폴딩 → 토큰 → Shell → 반응형 → atomic 컴포넌트 → 인터랙티브 컴포넌트 → 검증). **실제로 Claude Code가 로드하는 원본 파일은 영문판이며, 한글 번역은 `docs/SKILL.ko.md`에서 참고용으로 제공합니다.**
- `assets/` — 토큰 CSS 스타터, `Shell`/`Header`/`Footer`/`Sidebar`, `globals.css` 배선, `Typography`, Playwright 설정 + 스모크 스펙
- `references/shadcn-retrofit.md` — shadcn 생성물을 토큰 레이어에 맞게 고치는 before/after 클래스 표
- `references/gotchas.md` — 레퍼런스 구현을 만들며 발견한 함정 9가지 (base-ui 조합 규칙, 포털 다크모드, 토큰 값 오매핑 등)
- `scripts/verify.sh` — 정적 하드코딩과 런타임 전용 버그를 모두 잡는 3층 검증 파이프라인 (grep 가드 → `next build` → Playwright 인터랙션 스모크)
- `evals/evals.json` — 이 스킬을 스킬 없는 baseline과 비교 검증할 때 쓴 테스트 프롬프트

## 벤치마크

테스트 프롬프트 3개(스킬 사용 vs. baseline, 스킬 미사용)에 대해 구조·정합성 어서션 기준 **20/20 대 16/20**. 가장 뚜렷한 차이는 4계층 토큰 구조(토큰을 한 파일에 인라인하지 않고 분리)와, 실제 base-ui 런타임 조합 버그(`DropdownMenuLabel`이 `DropdownMenuGroup` 부모를 필요로 함)를 잡아낸 것입니다 — 이 버그는 `grep`, `tsc`, `next build`를 모두 통과하지만 컴포넌트를 여는 순간 throw됩니다. **실제로 실행된** Playwright 인터랙션 테스트만이 이를 잡아냅니다.
