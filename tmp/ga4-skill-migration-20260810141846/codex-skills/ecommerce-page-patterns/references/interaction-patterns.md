# Interaction Patterns / 详情页交互模式

Use interaction only when it solves one of two problems:

1. Dense information needs grouping.
2. A product function is hard to understand from text alone.

交互只服务两个目标：

1. 信息太多，需要把同类内容整合起来。
2. 功能靠文字讲不清，需要用户通过操作或动态演示理解。

## 1. Information Compression / 信息压缩型交互

Use when several modules describe the same type of feature. The goal is to reduce page length without hiding important proof.

适用于多个模块都在讲同一类功能时，目标是缩短篇幅，同时保留证明力。

### Tab Group / 标签切换

Best for:

- Image quality: LDR, WDR, HDR, LDC, night vision, color night vision.
- Detection modes: human, vehicle, pet, package, sound.
- Storage options: local microSD, NVR/HomeBase, cloud.
- Installation options: wall, ceiling, corner, wired, battery.

Use this structure:

- One shared headline.
- One shared visual area.
- 3-5 tabs.
- Each tab changes the proof image/video and 2-3 short bullets.
- Keep the scene, camera position, and comparison scale stable across tabs. The user should understand the difference from the changed state, not from a different scene.

Example:

- Section headline: "Clearer images in every doorway condition"
- Tabs: "WDR", "LDR", "LDC", "Night"
- Shared visual: doorway scene.
- Each tab updates the image treatment and explains the specific benefit.

中文示例：

- 模块标题：不同门口光线下，都能看得更清楚
- Tab：WDR / LDR / LDC / 夜视
- 共享画面：门口场景图
- 每个 Tab 切换画面效果和 2-3 条解释。

### Accordion / 折叠面板

Best for long specs, compatibility notes, FAQs, installation details, and regional limitations.

适用于规格、兼容性、FAQ、安装细节、地区限制。

Use on mobile when tabs would become too tight.

### Segmented Cards / 分段卡片

Best for comparing buyer scenarios:

- Apartment
- Front porch
- Driveway
- Backyard
- Rental home

Each card should update the same diagram or scene image.

## 2. Feature Explanation / 功能解释型交互

Use when the buyer cannot understand the function by reading a sentence.

适用于用户只看文案无法理解的功能。

### Before/After Slider / 前后对比滑块

Best for:

- WDR/HDR against backlight.
- LDC distortion correction.
- Night vision.
- Color night vision.
- Low-light enhancement.

Implementation:

- Use a draggable vertical slider.
- Add labels: "Without WDR" / "With WDR".
- Keep one sentence below the visual explaining the buyer benefit.

### Zoom Demo / 变焦演示

Best for:

- Optical zoom.
- Hybrid zoom.
- Telephoto detail.
- Face, package, or license-plate clarity.

Implementation:

- Use a range slider from 1x to 8x.
- The same scene should crop smoothly into a face/package/license plate detail.
- Add fixed markers such as 1x, 3x, 8x.
- Avoid a fake zoom if no suitable source image exists; use a static staged comparison instead.

#### 3D Zoom Variant / 3D Zoom 框选变体

Use for PTZ cameras or any product that can move and zoom toward a selected area.

- Start with a fixed wide live-view scene.
- Let the user click or drag a selection frame around a gate, package, face, or vehicle.
- Animate the frame into a zoomed view and label the resulting magnification.
- Include 3-4 selectable hotspots as an accessible fallback; the same options must work with keyboard focus.

Reference pattern: Reolink RLC-823S2 describes 3D Zoom as selecting an area on screen and automatically zooming the camera to that area.

Reolink 参考：RLC-823S2 将 3D Zoom 解释为“在画面中框选区域，摄像头自动变焦至该区域”。详情页可把这个动作转成可操作的演示，而不是只写“支持 16 倍光学变焦”。

### 360 Coverage Viewer / 360 度覆盖演示

Best for:

- Pan/tilt cameras.
- PTZ products.
- Doorbell or camera coverage angle.
- "No blind spots" claims.

Reference behavior:

- eufy SoloCam S340 presents 360-degree pan and 70-degree tilt as a coverage proof section, then follows it with AI tracking. eufyCam S4 presents bullet-to-PTZ tracking, simultaneous wide/close views, and auto-framing/auto-zoom as proof modules.

Recommended interaction:

- Show a home/yard/doorway scene with a circular coverage arc.
- Let the user drag left/right to pan the camera view.
- Use arrow buttons for accessible control.
- Add angle labels such as 135 degrees, 180 degrees, 360 degrees.
- Show the camera body rotating or the viewed area changing.
- Pair with a mini-map or coverage ring so the user understands what changed.
- Add 3-4 preset locations such as Front Door, Driveway, Side Yard, and Porch. Selecting a location updates the same camera angle, live view, and coverage cone. This is the preferred first interaction for users who do not want to drag.

中文建议：

- 用门口、院子或客厅场景作为底图。
- 用户左右拖动时，画面视角或覆盖扇形跟着变化。
- 增加左右箭头，方便移动端和无障碍操作。
- 标注 135 度、180 度、360 度。
- 最好同时显示摄像头机身旋转或覆盖区域变化，而不是只播放一个视频。
- 增加“门口 / 车道 / 侧院 / 门廊”等预设点。点击预设点时，同步切换机身朝向、实时画面与覆盖扇形；这比要求用户先拖拽更易理解。

### Hotspot Scene / 场景热点

Best for explaining multiple functions in one scene:

- PIR detects person.
- Phone alert appears.
- Two-way talk starts.
- Privacy zone hides a window.
- Chime rings indoors.

Implementation:

- Use numbered hotspots on a realistic scene.
- Hover/click opens short proof text and a UI screenshot.
- On mobile, hotspots become a carousel or stacked list.

### App UI Simulation / App 界面模拟

Best for alerts, live view, privacy zone, detection zone, playback, voice changer, storage, and smart-home integration.

Implementation:

- Use a phone mockup.
- Let tabs switch between app states: Alert, Live View, Talk, Privacy, Storage.
- Keep UI copy realistic and short.

## Decision Rules / 选择规则

- If two sections explain the same category, merge them into one tabbed module.
- If a feature changes visual output, use a slider or toggle.
- If a feature changes viewing direction or coverage, use a drag/360 viewer.
- If a feature combines a target area with optical zoom, use a 3D Zoom selection demo; do not substitute it with an isolated number such as "16x".
- If 360-degree coverage is also a patrol workflow, start with preset points and then offer drag controls. Show the sequence: preset location -> camera move -> coverage -> tracking.
- If a feature is a workflow, use step cards or app UI simulation.
- If a feature has many conditions, use tabs for desktop and accordion for mobile.
- Do not add interaction when a static comparison communicates faster.

## Webflow Implementation Level / Webflow 实现级别

Native Webflow:

- Tabs
- Accordion
- Sticky subnav
- Anchor navigation
- Simple sliders

Light custom code:

- Before/after slider
- Zoom range slider
- 3D Zoom selection frame with fixed hotspot fallback
- Hotspot reveal
- Syncing tab state with image changes

Advanced custom code:

- Drag-based 360 viewer
- Scroll-driven camera pan
- Canvas/WebGL coverage simulation
- Synchronized video and UI state

Default recommendation:

Start with native Webflow tabs/accordions. Add custom code only when the interaction directly improves feature understanding.
