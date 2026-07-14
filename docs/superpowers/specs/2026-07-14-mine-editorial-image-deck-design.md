# Mine 项目展示：Editorial Knowledge Lab 视觉主题与逐页生成大纲

## 1. 使用目的

这份文档用于重新制作 Mine 个人项目展示稿，并作为 image 模型的统一提示词包。

目标受众是产品经理、AI 产品、内容产品及复合型岗位的面试官，也兼顾个人作品集浏览者。观众应在 8—12 分钟内理解：

1. Mine 为什么值得被做出来。
2. 产品方案如何从观察、痛点和竞品分析中形成。
3. Mine 已经实现了怎样的真实闭环。
4. 项目如何通过 Vibe Coding 持续迭代并上线。

本方案保持 13 页结构，但不沿用旧版“网页卡片堆叠”的视觉方式。每页只承担一个核心观点，以大标题、真实证据和一张主视觉建立节奏。

## 2. 整体主题

### 中文主题

**让收藏重新流动**

### 英文主题

**MAKE MATERIALS USEFUL AGAIN**

### 核心表达

> 把散落在文章、视频、播客、图片和灵感中的外部信息，转化为可检索、可引用、可继续创作的个人知识资产。

### 创意概念

整套演示稿被设计成一本正在被整理的“数字研究档案”。前半段呈现信息碎片、收藏堆积和价值断点；中段通过调研、竞品和产品策略逐渐建立秩序；后半段让素材形成可持续流动的生产线，最后回到真实产品、构建过程和下一步。

叙事变化为：

**混乱 → 观察 → 定义 → 聚合 → 流动 → 可用**

## 3. 视觉系统

### 3.1 风格定位

**Editorial magazine × research archive × digital knowledge lab**

关键词：编辑式、克制、纸张档案、真实材料、批注痕迹、非对称网格、印刷感、数字工具感。

避免：圆角卡片阵列、紫蓝渐变、发光数据球、玻璃拟态、无意义 3D、股票图库式人物、虚构数据、随机英文、模型生成的假 UI。

### 3.2 色彩

- 暖米白：`#F2EFE7`，主要纸张背景。
- 墨黑：`#171A18`，标题与深色章节页。
- 森林绿：`#285B4A`，Mine 主品牌色与“有序、可用”的状态。
- 信号橙：`#E56A3A`，仅用于断点、批注和关键转折。
- 灰绿：`#87928B`，辅助信息和背景线。

整套演示稿以暖米白和墨黑为主，不机械地一深一浅交替。森林绿只在产品方案、核心能力和结尾形成品牌记忆；信号橙只在问题与转折页出现。

### 3.3 字体与排版

- 中文主标题：思源宋体 Heavy 或同类高对比中文宋体。
- 中文正文：思源黑体 Regular / Bold。
- 英文、数字、页码：JetBrains Mono。
- 主标题建议 72—104 px；正文不小于 24 px。
- 每页主标题控制在两行内；每行尽量不超过 16 个汉字。
- 每页最多一个主标题、一条结论和 3—5 个信息点。
- 使用直角边界、细规则线和大留白，不使用成排等大的圆角卡片。

### 3.4 图像生成原则

- 推荐画布：16:9，`2048 × 1152`；最终稿可使用 `3840 × 2160`。
- image 模型主要生成无文字的视觉底图，中文标题、数据、链接和表格后期叠加。
- 每张图必须留下明确的文字安全区，不能全画面均匀铺满元素。
- 同一套图保持纸张颗粒、印刷网点、森林绿和信号橙的一致性。
- 真实产品界面不让模型重绘，直接使用项目截图。
- 每次只生成一页；不要用同一提示词一次生成 13 张不同内容。

### 3.5 全局负面约束

将下面内容附加到每一页提示词末尾：

```text
Avoid: Chinese or English text inside the image, random letters, fake statistics, logos, watermarks, QR codes, fake UI, rounded SaaS cards, purple-blue gradients, glowing data spheres, glassmorphism, decorative 3D objects, stock-photo handshakes, excessive icons, equal-size card grids, cluttered full-frame composition. Keep a refined editorial hierarchy, restrained colors, real paper texture, believable materials, and clear negative space for later typography.
```

## 4. 整体叙事结构

### 第一幕：信息为什么失去价值（01—03）

从项目主题进入现实场景，建立“收藏很多、调用很少”的矛盾。

### 第二幕：如何发现并定义问题（04—07）

展示探索性调研、痛点归纳、竞品侧重点以及 Mine 的产品机会。

### 第三幕：产品如何让素材重新流动（08—10）

通过真实界面、完整流程和核心能力证明方案已经可用。

### 第四幕：如何把判断变成真实产品（11—13）

展示迭代证据、Vibe Coding 方法、当前边界和下一步。

---

## 5. 逐页详细大纲与 image 提示词

## 01｜封面：让收藏重新流动

### 页面任务

建立项目记忆点。观众第一眼应感受到这不是普通笔记软件，而是一套让信息从“沉睡收藏”变成“可用资产”的工作台。

### 页面文案

- 品牌名：`MINE`
- 主标题：`把收藏变成可持续使用的知识资产`
- 辅助信息：`AI PERSONAL KNOWLEDGE STUDIO · PRODUCT CASE STUDY · 2026`
- 主题短句：`MAKE MATERIALS USEFUL AGAIN`

### 讲述要点

“Mine 是我为内容创作者和知识工作者做的一套 AI 素材工作台。它解决的不是收藏空间不够，而是收藏之后，信息很难再次被找到、核对和用于创作。”

### 构图

深森林绿全幅背景。画面中央偏右是一叠从凌乱碎片逐渐变得整齐的纸张档案，最外层纸张形成一个抽象但清晰的字母 M。左侧保留大面积标题区。用一条信号橙批注线从碎片穿向整齐档案，暗示“重新流动”。

### image 模型提示词

```text
Use case: productivity-visual
Asset type: 16:9 portfolio presentation cover background
Primary request: a sophisticated editorial cover visual about scattered digital materials becoming an organized personal knowledge asset
Scene/backdrop: full-bleed deep forest-green background with subtle printed-paper grain
Subject: a layered archive of article clippings, image fragments, audio waveform strips and note paper gradually aligning into one precise stack; the outer paper edges subtly suggest the letter M without using literal typography
Style/medium: premium editorial art direction, research archive, tactile paper collage, restrained Swiss-grid influence, realistic paper materials
Composition/framing: visual cluster centered slightly right; generous clean negative space on the left for a large Chinese title; one thin burnt-orange annotation line connecting disorder to order
Lighting/mood: controlled studio light, calm, intelligent, purposeful
Color palette: deep forest green, warm ivory, charcoal black, one restrained burnt-orange accent
Constraints: no readable text; no interface screens; strong silhouette; suitable for a serious product portfolio
```

## 02｜项目概览：从外部内容到可发布草稿

### 页面任务

在一页内说明 Mine 服务谁、做什么，以及完整闭环是什么。

### 页面文案

- 主标题：`从外部内容，到可发布草稿`
- 一句话定位：`面向内容创作者和知识工作者的 AI 素材收纳与内容输出工作台。`
- 流程：`收集 → 整理 → 关联 → 问答 → 输出`
- 目标用户：`持续收集信息，并需要把素材转化为内容的人。`

### 讲述要点

“Mine 把信息管理和内容创作连接成同一条路径。外部材料进入工作台后，不只被保存，还会继续被整理、关联、核对和输出。”

### 构图

暖米白背景，一条从左到右的纸带贯穿画面。左端是网页、图片、视频帧与音频波形碎片；中间逐渐出现标签、摘要和关联线；右端成为一张结构完整的文章稿纸。流程文字后期叠加在纸带上下。

### image 模型提示词

```text
Use case: productivity-visual
Asset type: 16:9 product overview slide background
Primary request: show one continuous transformation from mixed digital source material into a finished editable document
Scene/backdrop: warm ivory paper field with faint archival registration marks and subtle print grain
Subject: one long horizontal paper ribbon; on the left, restrained fragments representing web articles, images, video frames and audio waveforms; in the middle, the fragments become organized with blank tags and connecting marks; on the right, they resolve into one clean editorial manuscript page
Style/medium: sophisticated editorial infographic without text, tactile paper collage, precise spacing
Composition/framing: clear left-to-right flow across the lower two-thirds; open upper-left area for title and short introduction
Lighting/mood: bright diffused studio light, optimistic but serious
Color palette: warm ivory, charcoal, forest green, minimal burnt orange
Constraints: no readable text, no icons arranged as cards, no fake UI, preserve five visually distinct stages for later labels
```

## 03｜项目起点：收藏不是知识

### 页面任务

把用户熟悉的“收藏很多，创作仍从零开始”变成强烈的问题画面。

### 页面文案

- 主标题：`真正的问题，不是信息太少`
- 三个现象：
  - `文章、视频、播客和截图散落在不同入口`
  - `保存动作结束后，很少再次整理和调用`
  - `真正写作时，仍然找不到观点和出处`
- 结论：`收藏不是知识，能够被重新调用的才是。`

### 讲述要点

“我观察到的核心矛盾是：人们每天都在保存信息，但保存本身没有形成价值。真正需要创作时，仍要重新搜索、重新理解、重新组织。”

### 构图

顶视角的研究桌面，网页打印件、截图、便签、耳机、视频时间轴和浏览器书签般的纸条凌乱散落。中央留出一块明显空白，象征“想写但无法开始”。信号橙只标记三个断点位置。

### image 模型提示词

```text
Use case: photorealistic-natural
Asset type: 16:9 problem-framing slide background
Primary request: an editorial top-down scene showing information overload and the inability to retrieve useful material when beginning to write
Scene/backdrop: large warm off-white research desk with real paper grain
Subject: scattered article printouts, cropped image references, blank sticky notes, headphones, abstract audio waveform strips, video timeline contact sheets and browser-bookmark-like paper tabs; an intentional empty writing area remains in the center
Style/medium: photorealistic editorial still life with subtle magazine collage treatment
Composition/framing: controlled chaos around the edges; clean central and upper-left negative space for copy; three small burnt-orange annotation marks indicating broken points
Lighting/mood: natural side light, slightly tense, thoughtful rather than messy for decoration
Color palette: warm ivory, graphite black, desaturated green, restrained burnt orange
Constraints: no readable text, no brand logos, no visible computer interface, believable materials and imperfect paper edges
```

## 04｜探索性用户调研：观察信息在哪里失去价值

### 页面任务

说明方案不是凭空出现，而是来自内容观察、问题归纳和原型反馈；同时明确这不是统计研究。

### 页面文案

- 主标题：`先观察信息在哪里失去价值`
- 路径：
  1. `内容观察：查看知识管理、收藏与创作卡点相关内容和评论`
  2. `问题归纳：围绕保存、查找、引用和复用整理反复出现的表达`
  3. `原型反馈：用可操作原型收集对导入、引用和输出的具体反馈`
- 研究边界：`探索性问题验证与反馈归纳，不代表统计研究结论。`

### 讲述要点

“我没有先列功能清单，而是先看素材在哪个环节失去价值。观察重点不是用户说想要什么按钮，而是保存之后发生了什么，以及真正创作时卡在哪里。”

### 构图

一面克制的研究墙：左侧是模糊化的内容观察材料，中间是归纳后的空白索引卡，右侧是一张原型测试路径。使用细线、图钉、透明描图纸和编号标签建立研究感。所有真实文字后期叠加。

### image 模型提示词

```text
Use case: productivity-visual
Asset type: 16:9 exploratory research slide background
Primary request: a refined product-research evidence wall showing observation, synthesis and prototype feedback as three successive stages
Scene/backdrop: warm ivory archival board with fine grid marks and subtle paper fibers
Subject: left cluster of blurred social-content printouts and comment strips, middle cluster of organized blank index cards and tracing lines, right cluster of a simple prototype-testing path on translucent drafting paper
Style/medium: premium editorial research archive, tactile collage, analytical and credible
Composition/framing: three clearly separated vertical zones with ample space above each for later labels; title-safe area across upper-left
Lighting/mood: soft museum-archive lighting, calm and investigative
Color palette: ivory, charcoal, muted forest green, small burnt-orange pins
Constraints: no readable text, no fake participant portraits, no sample-size graphics, no charts, no brand logos
```

## 05｜痛点定义：四个断点

### 页面任务

把零散现象归纳成四个清晰、可设计的问题。

### 页面文案

- 主标题：`四个问题，指向同一个断点`
- 痛点：
  1. `分散：素材存在多个平台与文件夹`
  2. `无结构：保存后缺少摘要、标签和关系`
  3. `来源不清：AI 输出难以回到原材料核对`
  4. `重复整理：从素材到内容仍要重新加工`
- 结论：`素材被保存了，却没有进入下一次思考与创作。`

### 讲述要点

“这四个问题不是四项独立功能需求，而是同一个链路在不同位置断开：信息没有持续向下一步流动。”

### 构图

一条横向传送路径被四处物理断裂：散开的纸张、缺失的索引、断开的引用线和重复堆叠的稿纸。画面使用墨黑和米白，四个断口以信号橙标记。正文后期沿断点叠加。

### image 模型提示词

```text
Use case: productivity-visual
Asset type: 16:9 pain-point synthesis slide background
Primary request: visualize one material-reuse pipeline interrupted by four distinct physical breaks
Scene/backdrop: matte warm-ivory field with precise black editorial rules
Subject: a continuous horizontal sequence of paper material that breaks in four ways: scattered fragments, missing index structure, a severed citation thread, and duplicated manuscript stacks
Style/medium: conceptual editorial still life, tactile paper engineering, bold but restrained
Composition/framing: four evenly spaced rupture moments across the middle; large clean title area above; space below each rupture for labels
Lighting/mood: high-contrast studio light, analytical, slightly urgent
Color palette: ivory, charcoal black, forest green only at the far destination, burnt orange only at the four breaks
Constraints: no readable text, no icons, no decorative card grid, each break must be visually different and understandable
```

## 06｜竞品分析：现有工具解决的是不同片段

### 页面任务

说明 Mine 的机会来自“连接路径”，而不是宣称其他产品没有某个功能。

### 页面文案

- 主标题：`现有工具各自解决一段，Mine 连接整条路径`
- 对象：`Notion / Readwise Reader / NotebookLM / Mine`
- 比较维度：`多来源收集 / 结构化整理 / 来源可信 / 内容输出`
- 页脚说明：`比较的是产品侧重点，不是功能有无的主观打分。`

### 内容依据

- Notion：网页剪藏、数据库与标签、保留原链接，整体侧重工作区。
- Readwise Reader：收集文章、PDF、视频等内容，高亮、标签和笔记，并可导出。
- NotebookLM：围绕上传来源组织研究，回答可引用来源，并生成简报或学习材料。
- Mine：链接、图片、音视频导入，AI 摘要、标签与关联，带来源问答，生成六类可编辑草稿。

公开资料：

- https://www.notion.com/en-US/web-clipper
- https://readwise.io/read
- https://notebooklm.google/

### 讲述要点

“Mine 不是要替代所有知识工具。它聚焦的是素材从进入工作台，到被核对、调用和输出的连续性。”

### 构图

这一页的表格和文字必须后期排版，不让 image 模型生成。模型只生成类似地铁线路图的无文字底图：四条不同路线分别覆盖路径的一部分，Mine 的森林绿路线贯穿全程。线路保持极简，以便叠加真实表格。

### image 模型提示词

```text
Use case: productivity-visual
Asset type: 16:9 competitor-landscape slide background
Primary request: an abstract editorial route map showing four product approaches covering different portions of one end-to-end material workflow
Scene/backdrop: clean warm-ivory technical-paper background with faint registration grid
Subject: four thin, unlabeled route lines with different lengths and stopping points; three muted routes cover only portions of the journey, while one restrained forest-green route connects the entire left-to-right path
Style/medium: minimal editorial information-design base, precise printed lines, not a finished infographic
Composition/framing: routes occupy the lower third; leave the central area clean for a manually typeset comparison table and the upper-left clear for title
Color palette: charcoal, gray-green, forest green, one tiny burnt-orange junction
Constraints: no text, no logos, no scores, no charts, no fake product screens, no icons
```

## 07｜产品机会：从保存内容到复用素材

### 页面任务

给出全套演示稿最重要的策略转折：Mine 的价值不是“装得更多”，而是“继续使用”。

### 页面文案

- 主标题：`从“保存内容”，转向“复用素材”`
- 核心方案：`统一收进来，结构化整理，保留来源，再生成可继续编辑的内容。`
- 产品原则：
  - `本地优先`
  - `来源可追溯`
  - `人在回路中`
  - `输出可继续修改`

### 讲述要点

“产品机会不是再造一个收藏夹，而是让材料在保存之后继续向前流动。AI 负责提炼和建议，用户保留选择、核对和修改权。”

### 构图

森林绿章节页。左侧是封闭、沉重的档案盒；一条纸带从盒中展开，经过标记、关联和批注后，在右侧成为正在编辑的稿纸。画面比前几页更简洁、更有方向感，代表策略已经明确。

### image 模型提示词

```text
Use case: stylized-concept
Asset type: 16:9 product-opportunity hero slide background
Primary request: a powerful editorial transformation from passive storage into active material reuse
Scene/backdrop: deep forest-green matte field with subtle screen-print texture
Subject: on the left, one closed archival box containing dormant paper fragments; from it emerges a continuous warm-ivory paper ribbon that gains blank annotations, links and structure, then becomes an editable manuscript sheet on the right
Style/medium: premium tactile editorial concept, paper sculpture, restrained and iconic
Composition/framing: left-to-right transformation across the lower half; broad negative space in the upper-left for the main statement; four small visual checkpoints along the ribbon for later product-principle labels
Lighting/mood: confident, directional, clear turning point
Color palette: forest green, warm ivory, charcoal, tiny burnt-orange annotations
Constraints: no readable text, no literal folder icons, no UI, no floating 3D geometry, no excessive effects
```

## 08｜产品原型：三栏工作台

### 页面任务

用真实产品界面证明方案已经落地，并解释信息架构。

### 页面文案

- 主标题：`三栏结构，把复杂流程放进一个工作台`
- 左栏：`素材库、分类与标签`
- 中栏：`素材列表、Markdown 阅读与编辑`
- 右栏：`Mine Copilot 收纳、问答与输出`
- 注释：`真实运行界面，而非概念原型。`

### 讲述要点

“我把复杂流程收进同一个工作区，减少用户在收藏工具、笔记软件和 AI 对话窗口之间切换。”

### 构图

使用项目真实截图作为页面唯一主角，占画面约 70%。背景由模型生成一张极简的暖米白展示台，带轻微纸张阴影和三条细标注线的起点。截图必须后期原样放入，不能让模型重绘、补字或修改。

### image 模型提示词

```text
Use case: product-mockup
Asset type: 16:9 presentation stage background for inserting a real desktop product screenshot later
Primary request: a refined editorial display stage that frames one large desktop software screenshot without generating the interface itself
Scene/backdrop: warm ivory paper background with subtle print grain and a precise charcoal border system
Subject: one large empty rectangular screenshot aperture occupying about seventy percent of the canvas, with realistic shallow paper-layer depth; three thin unlabeled annotation leaders ending outside the aperture
Style/medium: premium product-case-study layout base, editorial and architectural
Composition/framing: aperture centered slightly right; title-safe area upper-left; annotation space around left, center-bottom and right edges
Lighting/mood: clean gallery lighting, credible, product-focused
Color palette: warm ivory, charcoal, forest green used only for annotation endpoints
Constraints: keep the aperture empty and plain; no UI, no fake text, no browser chrome, no device mockup, no logos
```

## 09｜产品闭环：五步完成素材复用

### 页面任务

清楚展示从素材进入到生成草稿的完整操作路径。

### 页面文案

- 主标题：`五步完成从外部内容到可编辑草稿`
- 流程：
  1. `导入：链接、图片、音视频或 Markdown`
  2. `整理：标题、摘要、标签和主题`
  3. `沉淀：素材关联与本地库写回`
  4. `核对：基于素材库问答并展示来源`
  5. `输出：生成六类可继续编辑的草稿`
- 输出类型：`文章大纲 / 选题卡 / 研究摘要 / 公众号草稿 / 小红书笔记 / 短视频脚本`

### 讲述要点

“这里最重要的不是第五步能生成内容，而是前四步保证输出建立在用户自己的素材上，并且可以回到来源核对。”

### 构图

一条横向“编辑生产线”：原始材料进入，依次通过整理台、关系台、引用核验台，最后成为六张不同格式的稿纸。模型只生成五个清晰站点和物理材料，不生成步骤文字。

### image 模型提示词

```text
Use case: productivity-visual
Asset type: 16:9 end-to-end workflow slide background
Primary request: a five-stage editorial production line that transforms raw source materials into multiple editable manuscript formats
Scene/backdrop: wide warm-ivory studio table viewed from a slightly elevated angle
Subject: five physically distinct stations connected by one forest-green paper path: mixed source fragments, organized index cards, linked material clusters, citation-checking sheets with thread connections, and six clean manuscript outputs
Style/medium: tactile paper-engineering infographic without text, premium editorial case-study visual
Composition/framing: clear left-to-right sequence through the middle; enough clean space above each station for later numeric labels; title-safe area upper-left
Lighting/mood: bright, precise, productive
Color palette: warm ivory, charcoal, forest green, minimal burnt orange used at source-checking points
Constraints: exactly five stages, no readable text, no icons in rounded boxes, no fake interface, outputs must look editable rather than published posters
```

## 10｜核心能力：AI 是一组协作关系

### 页面任务

说明 Mine 的能力不是单一聊天按钮，而是围绕可编辑素材形成的协作系统。

### 页面文案

- 主标题：`核心能力不是单点 AI，而是闭环协作`
- 中心：`可编辑 Markdown 素材`
- 四组能力：
  - `稳定导入：网页、图片、字幕与音视频`
  - `智能整理：标题、摘要、标签、主题、关联`
  - `可信问答：回答展示来源素材`
  - `内容输出：六类可编辑草稿`
- 边界：`未配置 AI 时保留 fallback，Demo 闭环仍可体验。`

### 讲述要点

“AI 不是悬浮在产品上方的功能，而是进入导入、整理、核对和输出各环节。中心始终是用户可编辑、可导出的素材。”

### 构图

深色页面。中央是一张真实纸张质感的空白 Markdown 稿纸，四组不同的编辑工具围绕它形成轨道：导入夹、索引标签、引用线和输出稿纸。不是发光科技球，而是可触摸的研究工具。

### image 模型提示词

```text
Use case: stylized-concept
Asset type: 16:9 core-capabilities slide background
Primary request: represent AI capabilities as four practical editorial tools collaborating around one editable source document
Scene/backdrop: matte charcoal-black field with subtle paper fibers, not a futuristic space
Subject: one warm-ivory blank manuscript sheet at the center; four tactile tool groups orbit with disciplined spacing: source intake clips, indexing tabs, citation threads and multiple output sheets
Style/medium: sophisticated editorial still life, research-lab precision, realistic paper and metal materials
Composition/framing: strong central composition occupying the right two-thirds; generous left-side negative space for title and four labels
Lighting/mood: focused gallery spotlight, intelligent, trustworthy
Color palette: charcoal, warm ivory, forest green, tiny burnt-orange citation marks
Constraints: no glowing network, no holograms, no text, no decorative 3D spheres, no fake UI, four tool groups must be visually distinct
```

## 11｜迭代过程：持续消除真实断点

### 页面任务

用真实 Git 记录证明项目经历了从 Demo 到稳定产品的连续迭代。

### 页面文案

- 主标题：`迭代不是堆功能，而是持续消除断点`
- 六个阶段：
  1. `Demo 闭环：先验证从素材到输出是否成立`
  2. `编辑稳定：修复富文本降级、保存与格式问题`
  3. `账户边界：加入登录、持久化和用户数据隔离`
  4. `可信引用：强化稳定导入、来源追踪与引用`
  5. `媒体运行时：补充字幕、音视频与视觉解析路径`
  6. `部署体验：修正 Docker、认证与工作区界面`
- 证据说明：`阶段归纳自 2026-07-02 至 2026-07-11 的 Git 提交记录。`

### 讲述要点

“每一轮迭代都对应一个真实问题：页面空白、编辑器崩溃、导入不稳定、来源不可核对、媒体解析受限或部署失败。项目的成熟来自这些问题被逐个消除。”

### 构图

纵向或折线路径的“构建档案”：六层不同深度的修订稿、测试纸和版本印章从左下向右上推进。真实提交摘要后期排版，不让模型生成哈希或日期。

### image 模型提示词

```text
Use case: productivity-visual
Asset type: 16:9 product-iteration timeline slide background
Primary request: a six-stage build archive showing a software product becoming more reliable through successive revisions
Scene/backdrop: warm gray archival table with print-proof texture and faint technical grid
Subject: six layered revision sheets progressing diagonally from rough early proof to precise final release document; visible correction marks, test check strips, source-thread details and deployment packaging cues, all without readable text
Style/medium: editorial build log, tactile print-production archive, credible and evidence-driven
Composition/framing: six distinct stages moving lower-left to upper-right; title-safe area upper-left and label space alongside each layer
Lighting/mood: natural archive-room light, persistent, craft-focused
Color palette: warm gray, ivory, charcoal, forest green increasing toward the final stage, restrained burnt-orange corrections
Constraints: exactly six stages, no dates, no commit hashes, no readable text, no fake charts, no celebratory confetti
```

## 12｜Vibe Coding：缩短判断与验证之间的距离

### 页面任务

展示个人构建方法，强调产品判断、任务拆解和验证，而不是把“AI 写代码”作为噱头。

### 页面文案

- 主标题：`Vibe Coding 不是跳过思考，而是缩短验证距离`
- 方法：`产品判断 → 小任务拆解 → Code Assistant 共建 → 测试与构建 → 部署反馈`
- 技术栈：`React · TypeScript · Vite · Express · Drizzle · Neon Postgres · OpenAI-compatible API`
- 个人角色：`产品定义、交互判断、任务拆解、验收与迭代。`

### 讲述要点

“Code Assistant 帮我提高实现速度，但做什么、不做什么、如何拆任务、怎样验收，仍然需要产品判断。Vibe Coding 对我最大的价值，是让想法更快进入可验证状态。”

### 构图

真实感顶视角工作场景：一只手在纸上画产品流程，旁边笔记本电脑显示模糊的代码结构和测试结果，桌面放着真实产品截图打印件。画面不展示人物脸，不制造“未来黑客”氛围。

### image 模型提示词

```text
Use case: photorealistic-natural
Asset type: 16:9 personal build-story slide background
Primary request: a candid editorial workspace showing product judgment, AI-assisted coding and verification as one practical workflow
Scene/backdrop: real designer-developer desk with warm neutral paper surface
Subject: top-down view of one natural hand sketching a product flow on paper; nearby laptop with softly blurred code structure and test-result blocks; printed product screenshots, a small task checklist and a single pencil
Style/medium: photorealistic editorial documentary photography, subtle film grain, real imperfect materials
Composition/framing: activity concentrated on the right two-thirds; clean left area for title and method; hand anatomy natural and fully plausible
Lighting/mood: soft late-afternoon window light, focused, honest, craft-oriented
Color palette: warm paper, charcoal, forest green details, minimal burnt orange annotations
Constraints: no readable code or text, no face, no futuristic hologram, no neon hacker setup, no excessive devices, no brand logos, no watermark
```

## 13｜复盘与下一步：可体验，也有边界

### 页面任务

用诚实、成熟的方式收尾：展示已经完成的闭环、当前限制、下一步与两个可点击入口。

### 页面文案

- 主标题：`一条已经可体验的闭环，也有清晰的边界`
- 已完成：`素材收集、AI 整理、带来源问答与六类内容输出`
- 当前边界：`私密或强平台限制内容无法稳定导入；部分识别与转写依赖部署环境`
- 下一步：`提升媒体识别稳定性、素材关联质量与移动端体验`
- 行动入口：
  - `在线体验 Mine`：https://mine-knowledge-studio.onrender.com/
  - `查看 GitHub`：https://github.com/Cccoan1120/mine-knowledge-studio
- 收尾短句：`MAKE MATERIALS USEFUL AGAIN`

### 讲述要点

“Mine 已经是一条可以真实体验的闭环，但它仍然有明确边界。下一步不是盲目增加功能，而是继续提高导入稳定性、素材关联质量和跨设备使用体验。”

### 构图

回到深森林绿背景。一条在前面页面中不断出现的米白纸带终于形成完整闭环，但在右上方保留一个向外延伸的开放箭头，代表产品仍在继续。左侧放复盘文字，右下放在线体验与 GitHub 按钮。

### image 模型提示词

```text
Use case: productivity-visual
Asset type: 16:9 closing slide background
Primary request: a mature editorial closing visual representing a working closed loop with an honest open path forward
Scene/backdrop: full-bleed deep forest-green field with subtle screen-print and paper grain
Subject: one warm-ivory paper ribbon forming a clear complete loop, then extending from the upper-right into one calm open directional path; a few restrained citation threads and material fragments are integrated into the loop
Style/medium: iconic editorial paper sculpture, minimal, premium, reflective rather than celebratory
Composition/framing: loop placed on the right half; generous left-side negative space for reflection copy; clean lower-right area for two later-added link buttons
Lighting/mood: calm gallery lighting, resolved, credible, forward-looking
Color palette: deep forest green, warm ivory, charcoal shadow, one tiny burnt-orange continuation mark
Constraints: no readable text, no logos, no QR code, no confetti, no trophy imagery, no glowing effects, strong simple silhouette
```

## 6. 页面节奏总览

| 页码 | 背景基调 | 主视觉类型 | 节奏作用 |
|---|---|---|---|
| 01 | 深绿 | 纸张档案主视觉 | 建立品牌记忆 |
| 02 | 米白 | 连续纸带流程 | 快速说明产品 |
| 03 | 米白 | 写实信息桌面 | 制造问题张力 |
| 04 | 米白 | 研究证据墙 | 建立过程可信度 |
| 05 | 高对比米白 | 四处断裂路径 | 收紧问题定义 |
| 06 | 米白 | 路线图底纹 | 理性比较 |
| 07 | 深绿 | 档案盒到稿纸 | 全稿策略转折 |
| 08 | 米白 | 真实 UI 截图 | 给出产品证据 |
| 09 | 米白 | 五步编辑生产线 | 解释完整闭环 |
| 10 | 墨黑 | 四组编辑工具 | 强化核心能力 |
| 11 | 暖灰 | 六层修订档案 | 展示迭代证据 |
| 12 | 暖色写实 | 个人构建工作台 | 引入个人故事 |
| 13 | 深绿 | 闭环与开放路径 | 诚实收尾与行动 |

## 7. 生成和排版工作流

1. 先生成第 01、03、07、12、13 页，用于确认整套视觉 DNA。
2. 选定一张作为风格参考图，后续每页生成时明确说明“保持相同纸张纹理、色板、印刷感和光线”。
3. 第 02、04、05、06、09、10、11 页只要求模型生成结构清晰的视觉底图，文字和数据后期添加。
4. 第 08 页只生成展示台背景，真实 UI 截图必须原样嵌入。
5. 每页最多迭代一个变量，例如只改构图或只改光线，不在一次修改中同时换颜色、材质和主题。
6. 最后统一叠加字体、页码、规则线、在线链接和 GitHub 链接。

## 8. 真实性与内容边界

- 用户调研只表述为探索性问题验证，不写虚构样本量或用户原话。
- 不使用虚构增长率、效率提升比例、活跃用户量或满意度。
- 竞品分析描述产品侧重点，不做没有依据的功能评分。
- 第 08 页只能使用 Mine 的真实运行截图。
- 第 11 页的迭代阶段来自项目真实 Git 历史。
- 第 13 页明确说明外部内容导入和运行环境限制。
- 图像模型生成内容不得被当作产品实际界面或用户研究证据。

## 9. 完成标准

- 13 页均有单一、明确的核心观点。
- 13 条提示词可以独立复制给 image 模型。
- 所有提示词都保留文字安全区并禁止生成正文。
- 视觉语法在纸张材质、色彩、构图和光线方面保持一致。
- 产品功能、技术栈、迭代与边界均能在当前项目中找到依据。
- 在线体验和 GitHub 链接在最终稿中可点击。
