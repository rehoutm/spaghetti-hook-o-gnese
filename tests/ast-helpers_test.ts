// tests/ast-helpers_test.ts
import { assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import {
  findReturnsJSX,
  getHookName,
  isHookCall,
  isReactComponent,
} from "../src/ast-helpers.ts";

function parse(code: string): any {
  return parseSync("test.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
}

Deno.test("getHookName: returns name for use* call", () => {
  const ast = parse(`useEffect(() => {})`);
  const callExpr = ast.body[0].expression;
  assertEquals(getHookName(callExpr), "useEffect");
});

Deno.test("getHookName: returns null for non-hook call", () => {
  const ast = parse(`fetchData()`);
  const callExpr = ast.body[0].expression;
  assertEquals(getHookName(callExpr), null);
});

Deno.test("isHookCall: matches by name", () => {
  const ast = parse(`useState(0)`);
  const callExpr = ast.body[0].expression;
  assertEquals(isHookCall(callExpr, "useState"), true);
  assertEquals(isHookCall(callExpr, "useEffect"), false);
});

Deno.test("isReactComponent: capitalised function returning JSX", () => {
  const ast = parse(`function Foo() { return <div />; }`);
  assertEquals(isReactComponent(ast.body[0]), true);
});

Deno.test("isReactComponent: lowercase function rejected", () => {
  const ast = parse(`function foo() { return <div />; }`);
  assertEquals(isReactComponent(ast.body[0]), false);
});

Deno.test("isReactComponent: capitalised function without JSX rejected", () => {
  const ast = parse(`function Foo() { return 42; }`);
  assertEquals(isReactComponent(ast.body[0]), false);
});

Deno.test("findReturnsJSX: detects JSX in nested return", () => {
  const ast = parse(`function Foo() { if (x) return <div />; return null; }`);
  assertEquals(findReturnsJSX(ast.body[0]), true);
});
