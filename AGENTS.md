# Nexus Architect — Agent Knowledge Base

## Project
AI-powered visual mind-mapping canvas for project planning. React 19 + Vite 8. Deploys on Vercel.

## Stack
- React 19.2.6, JSX (no TypeScript)
- Vite 8.0, LightningCSS (PostCSS alternative)
- `lucide-react` icons
- `puter.ai` via global `<script src="https://js.puter.com/v2/">` for AI chat
- No router, no external state lib — plain `createContext` + `useState`

## File Structure
```
src/
  App.jsx                  — root layout (Header, main: Canvas+Sidebar+Drawer, ConfirmDialog, Toast)
  main.jsx                 — entry point, StrictMode + NexusProvider
  index.css                — all styles (~870 lines, single file)
  store/
    NexusContext.jsx       — global state (~527 lines)
  components/
    Header.jsx             — grouped toolbar (File/Edit/View/Options/Help menus), doc switcher, search, inline session naming, Sessions CRUD, Help modal with all shortcuts
    Canvas.jsx             — SVG connectors + node layer + pan/zoom + box-select + arrow-key nav + empty state + undo/redo shortcuts + mobile fitView + clickable scale indicator
    Sidebar.jsx            — AI chat (messages, suggestions, input, model select, hide toggle, resize handle, AI-unavailable banner, welcome with examples)
    DetailsDrawer.jsx      — node editor (title with char counter, notes, checklists, "Add detail with AI", save, resize handle)
    MindNode.jsx           — single node (toolbar, collapse, isolate, touch-friendly delete confirm, drag, multi-select, search match, checklist indicator)
    Connectors.jsx         — SVG connector paths with depth-based styling
    Toast.jsx              — toast notification container
    ConfirmDialog.jsx      — AI action confirmation modal (Apply/Cancel)
    Skeleton.jsx           — SidebarSkeleton, DrawerSkeleton lazy loading placeholders
  hooks/
    useAI.js               — sendChatMessage, expandNodeAI, elaborateNodeAI, language consistency
    useCanvas.js           — pan/drag handlers (stable refs)
    useGemini.js           — Google Gemini API (fetch, streaming, native fetch bypass)
    useOpenAI.js           — OpenAI API (fetch, streaming SSE, native fetch bypass)
  utils/
    tree.js                — tree manipulation (makeNode, findNode, findParent, layout, applyActions, normalizeTree, stripForExport, etc.)
    constants.js           — models, suggestions, layout types, gaps, MAX_VISIBLE_DEPTH
    helpers.js             — generateId(prefix), nodeWidth, nodeHeight, escapeHtml, renderInline, sanitizeHtml, sanitizeFilename, downloadFile, truncate, logError
    i18n.js                — t() function with 80+ English keys
    __tests__/
      helpers.test.js      — 12 unit tests for helpers
      tree.test.js         — 10 unit tests for tree functions
```

## State Management (NexusContext)
All state is in a single React context with `useState` + `useMemo` for the value.
Key state:
- `tree` — root node object (or `null` for empty state)
- `chat` — array of `{role, text, reasoning, pending, error, actionsApplied}`
- `canvas` — `{scale, x, y}` for pan/zoom
- `layout` — one of `'tree'|'root'|'two-sided'|'star'`
- `drawerNodeId` — currently open node in details drawer (or null)
- `isolatedId` — focus on a single branch (or null for full tree)
- `selectedId` — currently selected node
- `selectedIds` — Set of selected node IDs (for multi-select)
- `recentlyAddedIds` — Set of node IDs for "new node" animation
- `searchQuery` — current search term for node filtering
- `pendingActions` — `{ actions, reply, layout }` awaiting user confirmation
- `provider` — `'puter' | 'custom'` (persisted to localStorage)
- `customModel` — model name string (e.g. `'gemini-2.5-flash'`) for custom provider
- `history` / `redoStack` — undo/redo snapshots arrays
- `documents` / `activeDocId` — multi-document support (per-doc localStorage)
- `sidebarWidth` / `drawerWidth` — resizable panel widths (persisted)

## Tree Data Structure
```js
{
  id: 'n1234abc',
  title: 'Node title',
  description: 'Notes or description',
  depth: 0,            // 0=root, 1=branch, 2+=leaf
  collapsed: false,
  x: 200, y: 150,     // position (center-top of node)
  checklist: [],       // [{id, text, checked}] — optional checklists
  children: [ ... ]
```

## Layout Algorithms (tree.js)
- `layoutTree` — top-down hierarchy, rows per depth (DEFAULT)
- `layoutRoot` — root on left, branches go right
- `layoutTwoSided` — root centered, children alternate sides
- `layoutStar` — radial burst from center
- `recomputeLayout(tree, layoutType)` — dispatches to correct algorithm
- `positionNewNodes(parent)` — places new children near parent without moving existing nodes (used by AI to preserve manual positions)

## AI Integration
- **Provider toggle**: Header hamburger menu > Settings tab has Puter.ai / Custom API toggle (`provider` state in NexusContext, persisted to localStorage)
- When `provider === 'puter'`: uses `puter.ai.chat(messages, {model, stream: true})` (existing models dropdown in sidebar header)
- When `provider === 'custom'`: completely bypasses puter — uses custom model name + API key directly, routes by model prefix:
  - `gemini-*` → `useGemini.js` (Google Gemini API via `window.__nativeFetch`)
  - `gpt-*` / `o1*` / `o3*` → `useOpenAI.js` (OpenAI API with streaming SSE)
- `callModelAPI()` in `useAI.js` dispatches to correct backend based on model prefix
- `tryAI()` / `tryAISync()` check `opts.provider` — skip puter entirely when `provider === 'custom'`
- All three AI functions (`sendChatMessage`, `expandNodeAI`, `elaborateNodeAI`) guard against no-AI per provider type
- System prompt in `useAI.js` `buildSystemPrompt()` — 3-level tree, multi-methodology, W-Fragen framework, WBS/Agile/Kanban/Waterfall/CPM/MindMap/OKR
- AI response parsed for `@@REPLY@@` and `@@ACTIONS@@` markers
- Actions: `set_tree`, `add_children`, `update_node`, `delete_node`
- Language consistency: system prompt + expand/elaborate prompts include recent user messages as language hints; the AI is explicitly told to reply in the same language as the user
- Confirmation dialog: `useAI.js` sets `pendingActions` instead of applying directly; `ConfirmDialog.jsx` shows action summary (Apply/Cancel); `NexusContext.confirmPendingActions()` and `cancelPendingActions()` handle the flow
- `applyTreeActions` (in `tree.js`) is a pure function used by both `useAI.js` and `NexusContext`
- IMPORTANT: `applyActions` uses `positionNewNodes` (NOT `recomputeLayout`) for add_children to preserve manual node positions
- Auto-isolate when adding children to depth >= 2 (MAX_VISIBLE_DEPTH = 3)
- Native fetch saved before puter script loads: `<script>window.__nativeFetch = fetch.bind(window);</script>` in `index.html` before puter CDN script. Both `useGemini.js` and `useOpenAI.js` use this to bypass puter's fetch interceptor.

## Node Drag
- Canvas.jsx handles pointer events with refs (`treeRef`, `scaleRef`)
- Drag delta = `(e.clientX - startX) / scale`
- Single click (no drag) → open drawer for that node
- Handlers are stable via refs to avoid window listener re-attach
- Multi-drag: all nodes in `selectedIds` Set are dragged together by the same delta

## Canvas Pan/Zoom
- `useCanvas` hook with `onPointerDown/Move/Up`
- Wheel zoom via `setScale` (exponential factor)
- PanCtx ref captures origX/Y before setCanvas updater (race condition fix)
- `fitView()` recomputes scale/offset to show all nodes

## CSS Conventions
- Single `index.css` file (~870 lines), no CSS modules
- CSS custom properties for theme (--bp-*, --ink*, --brass*, --paper*)
- BEM-like naming: `.details-drawer`, `.drawer-header`, `.chat-messages`
- No Tailwind, no CSS-in-JS
- Mobile breakpoints at 1100px (sidebar slides in) and 640px (drawer full-width)
- `.sidebar-open` class on body toggles mobile sidebar
- `.sidebar-hidden` class collapses desktop sidebar to 0 width
- `.btn-loading` + `.spinner` for button loading states (spin keyframe)
- `.toast-dismiss` for toast close button
- `.shortcuts-hint` for keyboard shortcut badge in canvas
- `.provider-toggle` for AI provider toggle buttons
- `.toolbar-group` — groups of toolbar buttons with divider
- `.header-dropdown` / `.export-dropdown` — export and overlay dropdowns
- `.header-overlay-panel` — shared overlay for help and hamburger menu panels
- `.help-panel` / `.help-content` / `.help-shortcuts` — keyboard shortcuts display
- `.menu-panel` / `.menu-tabs` / `.menu-content` — hamburger menu with tabbed panels
- `.drawer-checklist` / `.checklist-*` / `.node-checklist` — checklist UI
- `.sidebar-resize-handle` / `.drawer-resize-handle` — resizable panel handles
- `.doc-switcher` / `.doc-dropdown` — document switcher dropdown
- `.export-group` — export button wrapper for dropdown positioning
- `.char-counter` — character count in title input
- `.search-badge` — match count badge in header search
- `.ai-unavailable-banner` — warning banner when custom AI not configured

## Connectors
- SVG paths in Connectors.jsx
- Depth-based classes: `.connector.depth-0` (primary), `.depth-1` (secondary), `.depth-2` (tertiary)
- Orthogonal paths for tree, straight lines for other layouts

## Build
```bash
npm run dev       # Vite dev server
npm run build     # Vite production build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Deployment
- Vercel (auto-deploy from GitHub)
- Requires `lightningcss-linux-x64-gnu` in optionalDependencies for Linux builds
- Favicon: `/favicon.svg` (copied to public/)

## Known Tolerated Lint Warning
- `react-refresh/only-export-components` in `NexusContext.jsx` (exports `useNexus` alongside component)

## UX / Accessibility
- All icon-only buttons have `aria-label`
- Chat messages area has `role="log"` + `aria-live="polite"`
- ConfirmDialog has proper `role="dialog"`, `aria-modal`, focus trap (Tab/Shift+Tab), and Escape to close
- Canvas grid (`.canvas-grid`) and connector SVGs have `aria-hidden="true"`
- Button loading states: Send, Elaborate, Expand use `.btn-loading` + `.spinner` (CSS `@keyframes spin`)
- Chat shows welcome message when empty with onboarding hints
- Search shows "no results" state when nothing matches and result count badge when active
- Error messages follow cause + remedy pattern (never "Something went wrong")
- Toast stack: max 3 visible, errors persist until dismissed, mobile-responsive positioning; auto-dismiss at 5s (info) / 8s (with action)
- Keyboard shortcut hint (`Ctrl+Z` / Shift+drag / Del) in bottom-center of canvas
- Arrow key navigation (↑↓ navigate nodes, ← parent, → first child)
- Title char counter in DetailsDrawer (`{length}/80`)
- Touch-friendly delete confirmation (tap twice on touch devices)
- Menu dropdowns have focus trapping (Tab/Shift+Tab loop, Escape closes)
- Reasoning toggle has `aria-expanded`
- Inline session naming (no browser `prompt()`)
- Scale indicator is a clickable button (calls fitView)
- AI-unavailable banner when custom provider lacks model/key
- Mobile: touch targets ≥44×44, larger icon buttons, full-width drawer, full-width toasts; auto fitView on mount
- `prefers-reduced-motion` respected on all animations

## Error Handling
- `ErrorBoundary` class component at root level (catches render crashes, shows reload UI with error details)
- `fetchWithRetry` wraps all AI calls with exponential backoff (2 retries, delay doubles each time)
- Every `catch` in AI functions passes meaningful error messages (never generic)
- API retries: 800ms → 1600ms then full failure

## Persistence
- Always saves to `localStorage` under `nexus_architect_data` key (no Puter dependency for basic saves)
- Multi-document support: each doc stored as `nexus_doc_<id>`, list in `nexus_docs_meta`, active tracked in `nexus_active_doc`
- Falls back to Puter storage when available (used as secondary/cloud layer)
- `loadFromStorage` reads localStorage first, then Puter
- `resetProject` clears both localStorage and Puter storage

## AI Web Research
- AI can request live web searches via `@@SEARCH@@query@@` marker in its response
- `webSearch()` function uses DuckDuckGo Instant Answer API (free, no API key required)
- When `@@SEARCH@@` is detected in AI output, app stops streaming, fetches results, and re-runs the prompt with search context
- System prompt includes web research capability instructions
- Works with both Puter.ai and custom API providers

## Lazy Loading (Performance)
- `Sidebar`, `DetailsDrawer`, `ToastContainer`, `ConfirmDialog` are code-split with `React.lazy` + `Suspense`
- Each renders as a separate chunk (6.7KB Sidebar, 2.45KB DetailsDrawer, 1.67KB ConfirmDialog, 0.82KB Toast)
- Critical-path load: Header + Canvas + ErrorBoundary (~226KB initial)

## Pending / In Progress
- None
