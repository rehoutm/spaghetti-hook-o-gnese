// deno-lint-ignore-file no-explicit-any
// tests/scoring/state-score_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { scoreComponentState } from "../../src/scoring/state-score.ts";

function parseComponent(code: string) {
  const ast = parseSync("t.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
  return (ast as any).body.find((n: any) => {
    if (n.type === "FunctionDeclaration" || n.type === "VariableDeclaration") {
      return true;
    }
    if (n.type === "ExportNamedDeclaration") {
      const decl = n.declaration;
      if (
        decl?.type === "FunctionDeclaration" ||
        decl?.type === "VariableDeclaration"
      ) {
        return true;
      }
    }
    return false;
  })?.declaration || (ast as any).body.find((n: any) =>
    n.type === "FunctionDeclaration" || n.type === "VariableDeclaration"
  );
}

Deno.test("scoreComponentState: counts useState calls", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      return <div />;
    }`,
  );
  assertEquals(scoreComponentState(cmp).useStateCount, 2);
});

Deno.test("scoreComponentState: detects correlated setters in same handler", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      function reset() { setA(0); setB(0); }
      return <div />;
    }`,
  );
  assert(scoreComponentState(cmp).correlatedSetters >= 2);
});

Deno.test("scoreComponentState: scatter fixture exceeds threshold", async () => {
  const src = await Deno.readTextFile("tests/fixtures/state-scatter.tsx");
  const cmp = parseComponent(src);
  assert(scoreComponentState(cmp).total > 5);
});

Deno.test("scoreComponentState: setter-shaped reducer counts slots", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [s, dispatch] = useReducer(
        (state, action) => {
          switch (action.type) {
            case "A": return { ...state, a: action.payload };
            case "B": return { ...state, b: action.payload };
            case "C": return { ...state, c: action.payload };
            default: return state;
          }
        },
        { a: 0, b: 0, c: 0, d: 0, e: 0 },
      );
      return <div />;
    }`,
  );
  const score = scoreComponentState(cmp);
  assertEquals(score.reducerSlots, 5);
  // setter-shaped, no logic-bearing case → no discount → full 5 slots count
  assertEquals(score.total, 5);
  assertEquals(score.hasSetterShapedReducer, true);
});

Deno.test("scoreComponentState: logic-bearing reducer earns discount", () => {
  const cmp = parseComponent(
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
        { count: 0, open: false },
      );
      return <div />;
    }`,
  );
  const score = scoreComponentState(cmp);
  assertEquals(score.reducerSlots, 2);
  // discount of 1 brings contribution to 1
  assertEquals(score.total, 1);
  assertEquals(score.hasSetterShapedReducer, false);
});

Deno.test("scoreComponentState: reducer with imported initial state has zero slots", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [s, dispatch] = useReducer(reducer, initialState);
      return <div />;
    }`,
  );
  assertEquals(scoreComponentState(cmp).reducerSlots, 0);
});

Deno.test("scoreComponentState: reducer-scatter fixture exceeds threshold", async () => {
  const src = await Deno.readTextFile("tests/fixtures/reducer-scatter.tsx");
  const ast = parseSync("t.tsx", src, { lang: "tsx", sourceType: "module" })
    .program;
  // first export = ProfileFormReducer (setter-shaped)
  const fn =
    (ast as any).body.find((n: any) =>
      n.type === "ExportNamedDeclaration" &&
      n.declaration?.type === "FunctionDeclaration" &&
      n.declaration.id?.name === "ProfileFormReducer"
    ).declaration;
  const score = scoreComponentState(fn);
  assertEquals(score.reducerSlots, 8);
  assert(score.total >= 8, `expected total >= 8, got ${score.total}`);
});

Deno.test("scoreComponentState: ToggleReducer earns its discount", async () => {
  const src = await Deno.readTextFile("tests/fixtures/reducer-scatter.tsx");
  const ast = parseSync("t.tsx", src, { lang: "tsx", sourceType: "module" })
    .program;
  const fn =
    (ast as any).body.find((n: any) =>
      n.type === "ExportNamedDeclaration" &&
      n.declaration?.type === "FunctionDeclaration" &&
      n.declaration.id?.name === "ToggleReducer"
    ).declaration;
  const score = scoreComponentState(fn);
  assertEquals(score.reducerSlots, 2);
  // discount kicks in → contribution = max(0, 2-1) = 1
  assertEquals(score.total, 1);
});
