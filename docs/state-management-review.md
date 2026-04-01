# State Management Architecture Review

## Current Architecture

### Overview

The app uses **Zustand** stores with **MMKV** persistence, wrapped in React Context providers. Each piece of persisted state is an independent Zustand store, created at module-load time in `App.tsx` and threaded through a deep provider hierarchy in `AppProviders.tsx`.

### How It Works Today

**Storage stack:** Zustand → `persist` middleware → `createJSONStorage` adapter → MMKV (or `expo-secure-store` for the security store).

**The pattern for every persisted store** (repeated 11+ times):

1. Define a `createXxxStore({persist})` factory in a new `contexts/XxxStoreContext.tsx` file (~50-80 lines)
2. Inside, conditionally wrap Zustand's `createStore` with `persist` middleware
3. Define actions as a plain object that closes over the store
4. Return `{instance: StoreApi, actions}`
5. Create a React Context + Provider export
6. Export `useXxxState()` and `useXxxActions()` hooks with null-guard
7. In `App.tsx`, call the factory at module scope with `{persist: true}` (~2-3 lines)
8. In `AppProviders.tsx`, add the store to the props type, thread it through as a new Provider wrapper (~5-10 lines, increases nesting depth)

**Migrations** use Zustand's built-in `version` + `migrate` option per store. Most stores are at version 0 (no migration). Two stores (Track, Security) have v0→v1 migrations.

**Validation** uses Valibot schemas, applied in migration functions or on rehydration.

### Files Touched to Add One New Piece of Persisted State

| File | Change |
|------|--------|
| `contexts/NewStoreContext.tsx` | **New file** (~60-80 lines of boilerplate) |
| `App.tsx` | Import + instantiate at module scope |
| `AppProviders.tsx` | Import, add to props type, add to props destructure, add Provider wrapper |

Minimum: **4 files, ~100+ lines**, most of which is structural copy-paste from an existing store.

### Evaluation

**Strengths:**

- **Testability.** The `{persist: false}` factory parameter makes it trivial to create in-memory stores for tests — no mocking needed.
- **Type safety.** Each store has its own TypeScript types; selectors are typed.
- **Isolation.** Stores are independent; a bug in one cannot corrupt another's data.
- **MMKV performance.** Synchronous reads/writes, much faster than AsyncStorage.
- **Background access.** Stores created at module scope can be used outside the React tree (e.g., the background location task writes directly to the track store).

**Weaknesses:**

- **High boilerplate per store.** Adding a simple boolean preference (e.g., `isEarlyAccessEnabled`) requires a full new Context file, factory, Provider wrapper, hooks, and wiring in two other files. The ceremony is the same whether the state is 2 fields or 20.
- **Deep provider nesting.** `AppProviders.tsx` is 18 levels deep. Each new store adds another layer. This is a readability and maintainability issue (and a minor performance concern for context propagation, though Zustand mitigates re-renders).
- **Prop threading in AppProviders.** Every store must be passed as a prop. The `AppProvidersProps` type has 14 members and growing.
- **Scattered migration logic.** Each store has its own migration function inline. There's no central registry of what version each store is at, no way to run all migrations together, and no tooling to test migrations in isolation.
- **No shared migration testing infrastructure.** Migrations are tested ad-hoc (only `TrackStoreContext.test.tsx` exists). There's no pattern for writing migration tests.
- **Inconsistent patterns.** The deprecated `createPersistedState` helper in `hooks/persistedState/` co-exists with the newer per-store pattern. Some stores use Valibot validation, others don't. The Security store uses async migration (expo-secure-store), while others are synchronous.
- **Module-scope initialization in App.tsx.** All stores are created outside the React lifecycle. This means they exist for the entire app lifetime (correct for persistence) but makes it harder to reason about initialization order or add stores that depend on other stores.
- **Duplication of the persist/non-persist conditional.** Every `createXxxStore` function contains an identical `if (persist) { ... } else { ... }` branch.

---

## Alternative Approaches

### Option A: Unified Persisted Store (Single Zustand Store with Slices)

Combine all simple persisted preferences into one Zustand store with a single MMKV key, using Zustand's slice pattern.

```typescript
// stores/persistedPreferences.ts
const usePreferences = create(
  persist(
    (...a) => ({
      ...createLocaleSlice(...a),
      ...createCoordinateFormatSlice(...a),
      ...createEarlyAccessSlice(...a),
      ...createMetricsSlice(...a),
      // ... other simple preferences
    }),
    {
      name: 'preferences',
      storage: createJSONStorage(() => MMKVStoreInitializer),
      version: 3,
      migrate: runMigrations,  // centralized
    },
  )
);
```

Keep complex stores (DraftObservation, Track, Security) as standalone stores due to their unique requirements (async migration, custom JSON reviving, rehydration hooks).

**Pros:**
- One Provider, one file for simple preferences
- Centralized migration pipeline
- Far less boilerplate for new preferences (add a slice: ~10 lines)
- Reduces provider nesting significantly

**Cons:**
- All simple preferences share a single MMKV key — one corrupt value could theoretically affect others (mitigated by validation)
- Slightly more complex initial setup
- Harder to test individual slices in isolation (though still possible with Zustand's store extraction)
- Still need separate stores for complex cases (DraftObservation, Track, Security)

**Migration from current approach:** Medium effort. Can be done incrementally — migrate one store at a time into the unified store, with a migration that reads the old MMKV key and writes into the new one.

---

### Option B: MMKV Direct with Custom Hooks (Drop Zustand for Simple State)

For simple key-value preferences, skip Zustand entirely and use MMKV directly with `useSyncExternalStore` or a thin custom hook.

```typescript
// lib/persistedValue.ts
function createPersistedValue<T>(key: string, defaultValue: T, schema: ValibotSchema<T>) {
  return {
    get: () => { /* read from MMKV, validate, return */ },
    set: (value: T) => { /* validate, write to MMKV */ },
    subscribe: (cb: () => void) => { /* MMKV listener */ },
    useValue: () => useSyncExternalStore(subscribe, get, get),
    useSetValue: () => set,
  };
}

// Usage:
export const coordinateFormat = createPersistedValue('coordinate-format', 'utm', CoordinateFormatSchema);

// In component:
const format = coordinateFormat.useValue();
const setFormat = coordinateFormat.useSetValue();
```

**Pros:**
- Zero boilerplate per value: one line to define, two lines to consume
- No Context providers needed — values are global singletons (like current module-scope stores, but without the Context overhead)
- No provider nesting at all for simple preferences
- Each value has its own MMKV key (same isolation as current approach)
- MMKV's native listener API gives you reactivity for free
- Trivially accessible outside the React tree (background tasks)
- Schema validation built into the read path

**Cons:**
- Loses Zustand's `persist` middleware migration system — must build a simple migration layer
- Not suitable for complex derived state (DraftObservation's photo processing pipeline)
- Two mental models: this for simple values, Zustand for complex stores
- `useSyncExternalStore` requires careful implementation to avoid tearing

**Migration strategy:** Each value can be migrated independently. The new `createPersistedValue` can read existing MMKV keys, so no data migration needed — just swap the implementation file by file.

---

### Option C: Zustand with a Store Registry (Reduce Boilerplate, Keep Architecture)

Keep the current per-store Zustand architecture, but eliminate the boilerplate with a generic factory and automatic Context wiring.

```typescript
// lib/createAppStore.ts
function createAppStore<State>(config: {
  key: string;
  version: number;
  initialState: () => State;
  actions: (store: StoreApi<State>) => Record<string, Function>;
  migrate?: (state: unknown, version: number) => State;
  persistOptions?: Partial<PersistOptions<State>>;
}) {
  // Returns { Provider, useStore, useActions, createInstance }
}

// Usage — one file, ~20 lines:
export const {
  Provider: CoordinateFormatProvider,
  useStore: useCoordinateFormat,
  useActions: useCoordinateFormatActions,
  createInstance: createCoordinateFormatStore,
} = createAppStore({
  key: 'coordinate-format',
  version: 0,
  initialState: () => ({ value: 'utm' as CoordinateFormat }),
  actions: (store) => ({
    setFormat: (format: CoordinateFormat) => store.setState({ value: format }),
  }),
});
```

For `AppProviders`, use a store registry that auto-composes providers:

```typescript
// contexts/AppProviders.tsx
const AppProviders = composeProviders(
  [CoordinateFormatProvider, coordinateFormatStore],
  [TrackStoreProvider, trackStore],
  // ...
);
```

**Pros:**
- Keeps existing architecture — minimal conceptual change for the team
- Cuts per-store boilerplate from ~80 lines to ~20 lines
- The `composeProviders` utility eliminates the nesting pyramid
- Migration strategy per-store remains the same
- Test story unchanged (`createInstance()` without persist)

**Cons:**
- Still one Context per store (just hidden)
- Still need to register each store in two places (creation in App.tsx + registry)
- Doesn't fundamentally simplify the mental model — just reduces typing
- `composeProviders` utility hides the provider order, which matters when providers depend on each other

**Migration strategy:** Low risk. Replace one store at a time with the new factory. Old and new patterns co-exist.

---

### Option D: Zustand with Persist + Centralized Migration Registry

Keep individual Zustand stores but centralize all migration logic into a single registry that runs before any store hydrates.

```typescript
// migrations/index.ts
const migrations: Migration[] = [
  { store: 'MapeoTrack', fromVersion: 0, toVersion: 1, migrate: (state) => { ... } },
  { store: 'security', fromVersion: 0, toVersion: 1, migrate: async (state) => { ... } },
  // future migrations go here
];

// Run before store creation:
await runPendingMigrations(storage, migrations);
```

Each store still uses Zustand's persist middleware, but the `migrate` function is a no-op — all real migration happens upfront. Stores just declare their current version for validation.

**Pros:**
- All migrations visible in one place — easy to audit and test
- Can run migrations in a specific order (important if store A's migration depends on store B)
- Can add a migration test suite that runs all migrations against fixture data
- Stores remain independent and simple

**Cons:**
- Two-phase initialization (run migrations, then create stores) adds complexity
- Must keep migration registry and store versions in sync manually
- Doesn't address the boilerplate or nesting issues

**Migration strategy:** Extract existing inline `migrate` functions into the registry. No data changes needed.

---

### Option E: Hybrid — MMKV Direct for Simple Values + Zustand for Complex State

Combine Option B (MMKV direct) for the ~8 simple preference stores with keeping Zustand for the 3 complex stores (DraftObservation, Track, Security).

```
Simple preferences (MMKV Direct):        Complex state (Zustand + MMKV):
├── coordinateFormat                      ├── DraftObservationStore
├── manualEntryCoordinateFormat           ├── TrackStore
├── locale                                └── SecurityStore
├── activeProjectId
├── earlyAccess
├── metricsDiagnostics
├── appUsageStats
└── savedLocation
```

Add a lightweight migration layer for MMKV-direct values:

```typescript
// lib/persistedValue.ts
const SCHEMA_VERSIONS_KEY = '__schema_versions';

function createPersistedValue<T>(config: {
  key: string;
  version: number;
  default: T;
  schema: ValibotSchema<T>;
  migrate?: (raw: unknown, fromVersion: number) => T;
}) { ... }
```

**Pros:**
- Right tool for the right job: simple persistence for simple state, full Zustand for complex state
- Eliminates 8 Context providers, 8 factory files, and ~600 lines of boilerplate
- Adding a new preference: ~5 lines, 1 file, 0 provider changes
- Complex stores retain full Zustand capabilities (middleware, subscriptions, etc.)
- Clear mental model: "Is it just a value? Use `createPersistedValue`. Does it have complex logic? Use a Zustand store."
- Migration support for both layers

**Cons:**
- Two patterns to understand (though clearly delineated)
- Must build the `createPersistedValue` utility (~50-80 lines)
- Must build a simple migration runner for the direct values (~30-50 lines)

**Migration strategy:** Can be done one store at a time. Each simple store is replaced with a `createPersistedValue` call that reads from the same MMKV key. No data migration needed for most stores. Remove the old Context file and Provider wrapper as each store is migrated.

---

## Comparison Matrix

| Criteria | Current | A: Unified | B: MMKV Direct | C: Registry | D: Central Migrations | E: Hybrid |
|----------|---------|------------|-----------------|-------------|----------------------|-----------|
| Lines to add a simple preference | ~100 | ~15 | ~5 | ~25 | ~80 | ~5 |
| Files touched for new preference | 4 | 1-2 | 1 | 2-3 | 4 | 1 |
| Provider nesting depth | 18+ | ~8 | ~5 | 18+ (hidden) | 18+ | ~8 |
| Migration centralization | No | Partial | Custom | No | Yes | Partial |
| Migration testability | Low | Medium | Medium | Low | High | Medium |
| Complex state support | Yes | Yes | No (separate) | Yes | Yes | Yes |
| Background task access | Yes | Yes | Yes | Yes | Yes | Yes |
| Test ergonomics | Good | Good | Good | Good | Good | Good |
| Migration risk from current | — | Medium | Medium | Low | Low | Medium |
| Conceptual simplicity | Low | Medium | High | Medium | Low | High |

## Recommendation

**Option E (Hybrid)** offers the best balance. It directly addresses the main pain point — the heavy boilerplate cost of adding simple persisted preferences — while preserving the proven Zustand pattern for the stores that genuinely need it. The migration path is incremental and low-risk.

The second choice would be **Option C (Store Registry)** if the team prefers to stay fully within Zustand, accepting somewhat higher (but still reduced) boilerplate in exchange for a single state management paradigm.
