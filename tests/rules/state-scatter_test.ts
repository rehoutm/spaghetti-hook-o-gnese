// tests/rules/state-scatter_test.ts
import { assert, assertEquals } from "@std/assert";
import { stateScatter } from "../../src/rules/state-scatter.ts";
import { runRule } from "./no-fat-effects_test.ts";

Deno.test("state-scatter: small component clean", () => {
  const diags = runRule(
    stateScatter,
    `function Foo() {
      const [a, setA] = useState(0);
      return <div />;
    }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("state-scatter: 8-state form fires", async () => {
  const src = await Deno.readTextFile("tests/fixtures/state-scatter.tsx");
  const diags = runRule(stateScatter, src);
  assert(diags.length >= 1);
  assert(
    diags[0].message.includes("reducerSlots=0"),
    `expected reducerSlots=0 in message, got: ${diags[0].message}`,
  );
});

Deno.test("state-scatter: setter-shaped reducer fires", async () => {
  const src = await Deno.readTextFile("tests/fixtures/reducer-scatter.tsx");
  const diags = runRule(stateScatter, src);
  // ProfileFormReducer (8 slots, setter-shaped) must fire; ToggleReducer must not.
  assert(
    diags.length >= 1,
    `expected reducer-scatter to fire, got ${diags.length} diags`,
  );
  const msg = diags[0].message;
  assert(
    msg.includes("reducerSlots=8"),
    `expected reducerSlots=8 in message, got: ${msg}`,
  );
  assert(
    msg.includes("setter-shaped"),
    `expected setter-shaped hint, got: ${msg}`,
  );
});

Deno.test("state-scatter: logic-bearing reducer above threshold avoids setter-shaped hint", () => {
  const diags = runRule(
    stateScatter,
    `function Foo() {
      const [s, dispatch] = useReducer(
        (state, action) => {
          switch (action.type) {
            case "INC":
              if (state.count >= 10) return state;
              return { ...state, count: state.count + 1 };
            default: return state;
          }
        },
        { count: 0, a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0 },
      );
      return <div />;
    }`,
  );
  assert(diags.length >= 1, "expected diagnostic above threshold");
  const msg = diags[0].message;
  assert(
    !msg.includes("setter-shaped"),
    `logic-bearing reducer should not get setter-shaped hint, got: ${msg}`,
  );
  assert(
    msg.includes("Consider useReducer, or split"),
    `expected generic hint, got: ${msg}`,
  );
});

Deno.test("state-scatter: logic-bearing reducer stays clean", () => {
  const diags = runRule(
    stateScatter,
    `function Foo() {
      const [s, dispatch] = useReducer(
        (state, action) => {
          switch (action.type) {
            case "INC":
              if (state.count >= 10) return state;
              return { ...state, count: state.count + 1 };
            default: return state;
          }
        },
        { count: 0, open: false, paused: false },
      );
      return <div />;
    }`,
  );
  assertEquals(diags.length, 0);
});
