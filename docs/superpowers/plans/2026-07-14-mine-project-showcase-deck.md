# Mine Project Showcase Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, self-contained 13-slide Chinese HTML deck that presents Mine as an evidence-backed AI personal knowledge-base product and links to both the live app and GitHub.

**Architecture:** Create one standalone `Mine 个人知识库项目展示.html` file using semantic HTML, embedded CSS, embedded JavaScript, and embedded product imagery. Keep the existing Mine application untouched; use repository files and official competitor pages only as read-only evidence sources.

**Tech Stack:** HTML5, CSS Grid/Flexbox, vanilla JavaScript, localStorage, print CSS, local product screenshots, optional bundled browser automation for verification.

## Global Constraints

- The final deck is Chinese and contains exactly 13 slides.
- The slide canvas is fixed at 1920 × 1080 and scales proportionally to the viewport.
- Body text is at least 24px and secondary labels are at least 20px on the 1920 × 1080 canvas.
- The only production artifact added by implementation is `Mine 个人知识库项目展示.html`.
- Do not modify Mine application source files, product screenshots, `resume_extract.txt`, or `resume_source.pdf`.
- Do not invent survey sample sizes, growth metrics, user quotes, competitor scores, or business results.
- Describe research as exploratory feedback collection rather than statistical research.
- Use the verified live URL `https://mine-knowledge-studio.onrender.com/` and GitHub URL `https://github.com/Cccoan1120/mine-knowledge-studio`.
- Use Mine's current visual tokens: `#F3F5F2`, `#FFFFFF`, `#F8F9F7`, `#1D2420`, `#2F5B4D`, `#68716B`, and `#D9DFDA`.
- Do not use remote JavaScript frameworks, slide libraries, glassmorphism, large purple-blue gradients, fake dashboards, or decorative icon grids.
- Preserve keyboard focus styles and support `prefers-reduced-motion`.
- Save the current slide in localStorage and make printing place one slide on each page.

---

## File Map

**Create:**

- `Mine 个人知识库项目展示.html` — the complete standalone presentation, including content, layout, navigation, print behavior, and embedded imagery.

**Read only:**

- `docs/superpowers/specs/2026-07-14-mine-project-showcase-deck-design.md` — approved requirements.
- `README.md` — product positioning, features, supported inputs, limitations, and deployment model.
- `package.json` — verified technology stack.
- `src/App.css` — Mine color, typography, spacing, and surface tokens.
- `src/App.tsx` — application layout and authentication/workspace flow.
- `src/components/AssistantPanel.tsx` — collect, Q&A, and output labels.
- `src/components/ImportPanel.tsx` — supported import modes and user-facing copy.
- `src/types.ts` — output and material type names.
- `server/ai/service.js` — AI organization, Q&A, and generated-output behavior.
- `server/import/extractors.js` — public link, image, audio, and video extraction behavior.
- `mine-ui-desktop.png`, `mine-auth-desktop-after.png` — existing real UI images available for embedding.
- Git history — iteration evidence.

---

### Task 1: Verify Product, Competitor, and Link Evidence

**Files:**

- Read: `README.md`
- Read: `package.json`
- Read: `src/types.ts`
- Read: `src/components/AssistantPanel.tsx`
- Read: `src/components/ImportPanel.tsx`
- Read: `server/ai/service.js`
- Read: `server/import/extractors.js`
- Read: `docs/superpowers/specs/2026-07-14-mine-project-showcase-deck-design.md`

**Interfaces:**

- Consumes: approved slide structure and current repository state.
- Produces: a verified content map used directly in Task 3; no new file is created.

- [ ] **Step 1: Verify Mine feature claims from tracked source files**

Run:

```powershell
git grep -n -E "outline|idea-card|research-summary|wechat-draft|xiaohongshu-note|short-video-script|source|Markdown|audio|video|image" -- README.md src server
```

Expected: matches for Markdown import/export, link/image/audio/video import, source-based Q&A, and the six generated output types. Remove any slide claim that has no matching source evidence.

- [ ] **Step 2: Verify the technology stack**

Run:

```powershell
node -e "const p=require('./package.json'); console.log(['react','express','@prisma/client','pg'].map(k=>k+': '+p.dependencies[k]).join('\n'))"
```

Expected: four non-empty dependency versions for React, Express, Prisma Client, and Postgres.

- [ ] **Step 3: Verify the iteration sequence**

Run:

```powershell
git log -12 --reverse --pretty=format:"%h %s"
```

Expected: commit subjects covering editor stability, stable imports/source tracing, media imports/trusted citations, deployment hardening, and authentication/document chrome. Use commit subjects only to establish sequence, not to claim user impact.

- [ ] **Step 4: Verify both project links**

Run:

```powershell
curl.exe -I -L --max-time 30 "https://mine-knowledge-studio.onrender.com/"
curl.exe -I -L --max-time 30 "https://github.com/Cccoan1120/mine-knowledge-studio"
```

Expected: final HTTP status `200` for both URLs.

- [ ] **Step 5: Check current competitor capabilities using primary sources**

Review official product pages for representative categories:

- Notion Web Clipper / knowledge workspace: `https://www.notion.com/web-clipper`
- Readwise Reader / read-it-later: `https://readwise.io/read`
- Google NotebookLM / source-grounded AI research: `https://notebooklm.google/`

Record only binary, publicly stated capabilities for the comparison dimensions: multi-source collection, structured organization, source-grounded answers, and downstream content output. Do not assign numeric scores. If a capability is ambiguous, label it “侧重点不同” instead of “不支持”.

- [ ] **Step 6: Confirm no product files changed**

Run:

```powershell
git status --short
```

Expected: only the existing untracked resume files and planning documents are visible; no Mine source file is modified.

---

### Task 2: Build the 13-Slide HTML Shell and Navigation

**Files:**

- Create: `Mine 个人知识库项目展示.html`

**Interfaces:**

- Consumes: no implementation artifact from Task 1.
- Produces: 13 `<section class="slide">` elements; `goToSlide(index)`, `nextSlide()`, `previousSlide()`, and `fitStage()` JavaScript functions used by Tasks 3–5.

- [ ] **Step 1: Run the shell existence test and confirm it fails**

Run:

```powershell
node -e "const fs=require('fs'); if(!fs.existsSync('Mine 个人知识库项目展示.html')) process.exit(1)"
```

Expected: exit code `1` because the deck does not exist yet.

- [ ] **Step 2: Create the semantic deck shell with all 13 screen labels**

Use `apply_patch` to create `Mine 个人知识库项目展示.html` with this document structure:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mine｜个人知识库项目展示</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { background: #1d2420; }
    .stage { position: absolute; left: 50%; top: 50%; width: 1920px; height: 1080px; }
    .slide { position: absolute; inset: 0; display: none; }
    .slide.is-active { display: grid; }
  </style>
</head>
<body>
  <main class="deck" aria-label="Mine 个人知识库项目展示">
    <div class="stage" id="stage">
      <section class="slide is-active" data-screen-label="01 Title" aria-hidden="false"></section>
      <section class="slide" data-screen-label="02 Overview" aria-hidden="true"></section>
      <section class="slide" data-screen-label="03 Origin" aria-hidden="true"></section>
      <section class="slide" data-screen-label="04 Research" aria-hidden="true"></section>
      <section class="slide" data-screen-label="05 Pain Points" aria-hidden="true"></section>
      <section class="slide" data-screen-label="06 Competitors" aria-hidden="true"></section>
      <section class="slide" data-screen-label="07 Opportunity" aria-hidden="true"></section>
      <section class="slide" data-screen-label="08 Prototype" aria-hidden="true"></section>
      <section class="slide" data-screen-label="09 Loop" aria-hidden="true"></section>
      <section class="slide" data-screen-label="10 Capabilities" aria-hidden="true"></section>
      <section class="slide" data-screen-label="11 Iterations" aria-hidden="true"></section>
      <section class="slide" data-screen-label="12 Build" aria-hidden="true"></section>
      <section class="slide" data-screen-label="13 Reflection" aria-hidden="true"></section>
    </div>
  </main>
  <nav class="deck-controls" aria-label="幻灯片导航">
    <button id="previous" type="button" aria-label="上一页">上一页</button>
    <output id="counter" aria-live="polite">01 / 13</output>
    <button id="next" type="button" aria-label="下一页">下一页</button>
  </nav>
  <script></script>
</body>
</html>
```

The empty script element is populated in Steps 3 and 4 of this task before the shell is tested or committed.

- [ ] **Step 3: Add bounded navigation and persistence**

Use this state contract in the embedded script:

```js
const slides = Array.from(document.querySelectorAll('.slide'));
const storageKey = 'mine-showcase-slide';
let currentSlide = Math.min(
  slides.length - 1,
  Math.max(0, Number.parseInt(localStorage.getItem(storageKey) || '0', 10) || 0)
);

function goToSlide(index) {
  currentSlide = Math.min(slides.length - 1, Math.max(0, index));
  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === currentSlide;
    slide.classList.toggle('is-active', active);
    slide.setAttribute('aria-hidden', String(!active));
  });
  document.querySelector('#counter').value = `${String(currentSlide + 1).padStart(2, '0')} / ${slides.length}`;
  document.querySelector('#previous').disabled = currentSlide === 0;
  document.querySelector('#next').disabled = currentSlide === slides.length - 1;
  try { localStorage.setItem(storageKey, String(currentSlide)); } catch {}
}

function nextSlide() { goToSlide(currentSlide + 1); }
function previousSlide() { goToSlide(currentSlide - 1); }
```

Register click handlers and map `ArrowRight`, `PageDown`, and Space to `nextSlide`; map `ArrowLeft` and `PageUp` to `previousSlide`. Ignore keyboard navigation when the event target is a link or button.

- [ ] **Step 4: Add proportional stage fitting**

Use this exact interface:

```js
function fitStage() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  document.documentElement.style.setProperty('--deck-scale', String(scale));
}

window.addEventListener('resize', fitStage, { passive: true });
fitStage();
goToSlide(currentSlide);
```

- [ ] **Step 5: Run the structural test**

Run:

```powershell
node -e "const fs=require('fs');const h=fs.readFileSync('Mine 个人知识库项目展示.html','utf8');const labels=[...h.matchAll(/data-screen-label=\"([^\"]+)\"/g)].map(m=>m[1]);if(labels.length!==13)throw Error('expected 13 slides');if(new Set(labels).size!==13)throw Error('duplicate labels');for(const n of ['goToSlide','nextSlide','previousSlide','fitStage'])if(!h.includes('function '+n))throw Error('missing '+n);console.log('shell ok')"
```

Expected: `shell ok`.

- [ ] **Step 6: Commit the working shell**

```powershell
git add -- "Mine 个人知识库项目展示.html"
git commit -m "feat: add Mine showcase deck shell"
```

---

### Task 3: Add Verified Slide Copy and Embedded Product Imagery

**Files:**

- Modify: `Mine 个人知识库项目展示.html`
- Read: `mine-ui-desktop.png`
- Read: `mine-auth-desktop-after.png`

**Interfaces:**

- Consumes: the 13 labeled slide sections from Task 2 and the verified evidence map from Task 1.
- Produces: final Chinese slide copy, two clickable project links, and at least one embedded `data:image/` product image.

- [ ] **Step 1: Run the content test and confirm it fails**

Run:

```powershell
node -e "const h=require('fs').readFileSync('Mine 个人知识库项目展示.html','utf8');for(const s of ['探索性用户调研','竞品分析','Mine Copilot','在线体验 Mine','查看 GitHub'])if(!h.includes(s))throw Error('missing '+s)"
```

Expected: non-zero exit because the empty shell does not contain the finished content.

- [ ] **Step 2: Populate the 13 slides with the approved narrative**

Use the following primary headline and proof point for each labeled section:

| Label | Primary headline | Required proof point |
|---|---|---|
| 01 | 把外部信息变成你的专属知识库 | AI 个人知识库 · Vibe Coding 项目 |
| 02 | 从收藏到输出，一条完整的素材复用闭环 | 收集 → 整理 → 关联 → 问答 → 输出 |
| 03 | 收藏很多，真正创作时仍然从零开始 | 问题不是信息不够，而是素材不可检索、不可引用、不可复用 |
| 04 | 先验证问题，再决定做什么 | 小红书、抖音、B 站内容与评论观察；标记“探索性反馈归纳” |
| 05 | 四个问题，指向同一个断点 | 分散、缺少结构、来源不清、重复整理 |
| 06 | 现有工具各自解决一段，Mine 连接整条路径 | 比较记录、知识库、稍后读、AI 研究四类产品的四个能力维度 |
| 07 | 从“保存内容”转向“复用素材” | 本地优先、来源可追溯、人在回路中、输出可编辑 |
| 08 | 三栏结构，把复杂流程放进一个工作台 | 左侧素材库、中间编辑、右侧 Mine Copilot |
| 09 | 五步完成从外部内容到可发布草稿 | 导入、提炼、关联、问答、输出 |
| 10 | 核心能力不是单点 AI，而是闭环协作 | 多来源导入、AI 收纳、可信问答、多格式输出 |
| 11 | 每次迭代都回应一个真实问题 | Demo、编辑稳定性、账户隔离、来源追踪、媒体导入、部署与认证优化 |
| 12 | 用 Vibe Coding 把产品判断变成可验证功能 | React、Express、Prisma、Postgres/Neon、Render |
| 13 | 已经可以体验，也仍然有清晰边界 | 真实能力、当前限制、下一步、两个项目入口 |

Keep each slide under 90 Chinese characters of paragraph copy, excluding short labels, table cells, and link text.

- [ ] **Step 3: Add the two exact project links**

Use accessible anchors:

```html
<a class="button button-primary" href="https://mine-knowledge-studio.onrender.com/" target="_blank" rel="noreferrer">在线体验 Mine</a>
<a class="button button-secondary" href="https://github.com/Cccoan1120/mine-knowledge-studio" target="_blank" rel="noreferrer">查看 GitHub</a>
```

Include both anchors on slide 13 and the live-app anchor once on slide 1 or 2.

- [ ] **Step 4: Embed real product imagery**

Use `mine-ui-desktop.png` as the primary image. If the live app can be captured at 1440 × 900 without login or content errors, use the new capture in memory and embed it instead; do not add that capture as a committed file.

Insert this temporary image element with `apply_patch`:

```html
<img class="product-shot" src="" data-embed-source="mine-ui-desktop.png" alt="Mine 三栏工作台：素材库、编辑区与 Mine Copilot">
```

Then perform the mechanical binary embedding with the exact command below. This is the only non-`apply_patch` edit and is limited to replacing the temporary source attribute with the existing PNG bytes as a data URL:

```powershell
node -e "const fs=require('fs');const p='Mine 个人知识库项目展示.html';let h=fs.readFileSync(p,'utf8');const target='src=\"\" data-embed-source=\"mine-ui-desktop.png\"';const src='src=\"data:image/png;base64,'+fs.readFileSync('mine-ui-desktop.png').toString('base64')+'\"';if(!h.includes(target))throw Error('embed target missing');h=h.replace(target,src);fs.writeFileSync(p,h,'utf8')"
```

Do not create a temporary image file. The HTML remains the only production artifact.

- [ ] **Step 5: Run the content and portability tests**

Run:

```powershell
node -e "const h=require('fs').readFileSync('Mine 个人知识库项目展示.html','utf8');for(const s of ['探索性用户调研','竞品分析','Mine Copilot','在线体验 Mine','查看 GitHub'])if(!h.includes(s))throw Error('missing '+s);for(const u of ['https://mine-knowledge-studio.onrender.com/','https://github.com/Cccoan1120/mine-knowledge-studio'])if(!h.includes(u))throw Error('missing '+u);if(!/data:image\/(webp|png);base64,/.test(h))throw Error('image is not embedded');if(h.includes('data-embed-source'))throw Error('image marker remains');console.log('content ok')"
```

Expected: `content ok`.

- [ ] **Step 6: Commit the evidence-backed content**

```powershell
git add -- "Mine 个人知识库项目展示.html"
git commit -m "feat: add Mine showcase narrative"
```

---

### Task 4: Apply the Mine Visual System, Print Rules, and Accessibility

**Files:**

- Modify: `Mine 个人知识库项目展示.html`

**Interfaces:**

- Consumes: slide markup, navigation functions, and embedded image from Tasks 2–3.
- Produces: final design tokens, slide layouts, focus states, reduced-motion rules, and print behavior.

- [ ] **Step 1: Run the visual-contract test and confirm it fails**

Run:

```powershell
node -e "const h=require('fs').readFileSync('Mine 个人知识库项目展示.html','utf8');for(const s of ['--bg: #f3f5f2','--accent: #2f5b4d','@media (prefers-reduced-motion: reduce)','@media print','outline: 3px'])if(!h.toLowerCase().includes(s.toLowerCase()))throw Error('missing '+s)"
```

Expected: non-zero exit before the complete visual system is added.

- [ ] **Step 2: Define the design tokens and fixed stage**

The embedded stylesheet must begin with these tokens and stage dimensions:

```css
:root {
  --bg: #f3f5f2;
  --paper: #ffffff;
  --paper-subtle: #f8f9f7;
  --ink: #1d2420;
  --accent: #2f5b4d;
  --muted: #68716b;
  --line: #d9dfda;
  --deck-scale: 1;
}

.stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1920px;
  height: 1080px;
  transform: translate(-50%, -50%) scale(var(--deck-scale));
  transform-origin: center;
}

.slide {
  position: absolute;
  inset: 0;
  display: none;
  overflow: hidden;
  padding: 76px 84px 70px;
  background: var(--bg);
  color: var(--ink);
}

.slide.is-active { display: grid; }
```

- [ ] **Step 3: Build four deliberate layout families**

Add and use these classes instead of repeating one card grid:

- `.layout-hero` — slides 1 and 13, asymmetric 45/55 split with large type and one strong screenshot or link block.
- `.layout-editorial` — slides 3, 5, and 7, oversized statement plus numbered evidence lines.
- `.layout-matrix` — slide 6, comparison table with text labels and no decorative logos.
- `.layout-product` — slides 8, 9, and 10, dominant real screenshot plus restrained numbered annotations.
- `.layout-timeline` — slides 11 and 12, horizontal iteration or build sequence.

Use borders, whitespace, type scale, and alignment for hierarchy. Do not give every block the same radius or shadow.

- [ ] **Step 4: Add controls, focus, motion, and print rules**

Required CSS contracts:

```css
a:focus-visible,
button:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

@media print {
  @page { size: 13.333in 7.5in; margin: 0; }
  body { overflow: visible; background: #fff; }
  .stage { position: static; width: auto; height: auto; transform: none; }
  .slide { position: relative; display: grid !important; width: 13.333in; height: 7.5in; break-after: page; }
  .deck-controls { display: none !important; }
}
```

- [ ] **Step 5: Run anti-slop and visual-contract checks**

Run:

```powershell
node -e "const h=require('fs').readFileSync('Mine 个人知识库项目展示.html','utf8').toLowerCase();for(const s of ['--bg: #f3f5f2','--accent: #2f5b4d','@media (prefers-reduced-motion: reduce)','@media print','outline: 3px'])if(!h.includes(s))throw Error('missing '+s);for(const bad of ['linear-gradient(135deg, #667eea','backdrop-filter: blur(20px)','scrollintoview'])if(h.includes(bad))throw Error('anti-slop violation '+bad);console.log('visual contract ok')"
```

Expected: `visual contract ok`.

- [ ] **Step 6: Commit the final visual system**

```powershell
git add -- "Mine 个人知识库项目展示.html"
git commit -m "style: polish Mine showcase deck"
```

---

### Task 5: Browser Verification and Final Corrections

**Files:**

- Modify if needed: `Mine 个人知识库项目展示.html`

**Interfaces:**

- Consumes: the complete deck from Tasks 2–4.
- Produces: verified final artifact with no blocking console errors, visible overflow, broken links, or navigation failures.

- [ ] **Step 1: Run the full static contract**

Run:

```powershell
node -e "const fs=require('fs');const h=fs.readFileSync('Mine 个人知识库项目展示.html','utf8');const labels=[...h.matchAll(/data-screen-label=\"([^\"]+)\"/g)].map(m=>m[1]);if(labels.length!==13)throw Error('slide count');if((h.match(/https:\/\/mine-knowledge-studio\.onrender\.com\//g)||[]).length<2)throw Error('live link count');if(!h.includes('https://github.com/Cccoan1120/mine-knowledge-studio'))throw Error('github link');if(!/data:image\/(webp|png);base64,/.test(h))throw Error('embedded image');for(const marker of ['T'+'BD','T'+'ODO','data-embed-source'])if(h.includes(marker))throw Error('unfinished marker');console.log('static verification passed')"
```

Expected: `static verification passed`.

- [ ] **Step 2: Serve the file locally**

Run a local static server from the repository root using the bundled workspace runtime. Use a hidden background process and bind only to `127.0.0.1`.

Expected: `http://127.0.0.1:4179/Mine%20%E4%B8%AA%E4%BA%BA%E7%9F%A5%E8%AF%86%E5%BA%93%E9%A1%B9%E7%9B%AE%E5%B1%95%E7%A4%BA.html` returns HTTP `200`.

- [ ] **Step 3: Test interactions in a browser at 1440 × 900**

Verify all of the following:

1. Slide 1 loads without horizontal or vertical scrollbars.
2. `ArrowRight`, Space, and PageDown advance one slide.
3. `ArrowLeft` and PageUp move back one slide.
4. Navigation stops at slides 1 and 13.
5. The visible counter matches the active slide.
6. Refresh on slide 8 restores slide 8.
7. Both external links have correct destinations and open in a new tab.
8. The browser console contains no uncaught error.

- [ ] **Step 4: Inspect screenshots for representative slides**

Capture and inspect slides 1, 4, 6, 8, 11, and 13. Confirm:

- no text or image overflow;
- no body text under 24px or secondary labels under 20px;
- competitor table remains legible;
- product screenshot is not stretched;
- controls do not overlap slide content;
- page count and screen label rhythm are consistent.

Use `view_image` on the captured PNGs. If any check fails, fix only the affected layout in the HTML and repeat the representative-slide check.

- [ ] **Step 5: Verify printing and external links**

Open print preview and confirm one slide per page with no navigation controls. Re-run:

```powershell
curl.exe -I -L --max-time 30 "https://mine-knowledge-studio.onrender.com/"
curl.exe -I -L --max-time 30 "https://github.com/Cccoan1120/mine-knowledge-studio"
```

Expected: both final responses are HTTP `200`.

- [ ] **Step 6: Run repository checks and inspect scope**

Run:

```powershell
git diff --check
git status --short
git log -4 --oneline
```

Expected: no whitespace errors; implementation changes are limited to `Mine 个人知识库项目展示.html`; the existing untracked resume files remain untouched.

- [ ] **Step 7: Commit any final corrections**

If Step 3–6 required changes:

```powershell
git add -- "Mine 个人知识库项目展示.html"
git commit -m "fix: finalize Mine showcase verification"
```

If no correction was required, do not create an empty commit.
