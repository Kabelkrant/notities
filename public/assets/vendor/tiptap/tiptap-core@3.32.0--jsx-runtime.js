/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/core@3.32.0/jsx-runtime/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
const l=new WeakSet,u=new WeakSet;function i(n){const r=n;return l.add(r),r}function o(n){return Array.isArray(n)&&l.has(n)}function c(n){return n.flatMap(r=>r==null?[]:Array.isArray(r)&&u.has(r)&&!o(r)?c(r):[r])}function y(n){return u.add(n.children),n.children}function a(n,r){if(n==="slot")return 0;if(n instanceof Function){const t=n(r);return Array.isArray(t)&&!o(t)&&!u.has(t)?i(t):t}const{children:e,...s}=r??{};if(n==="svg")throw new Error("SVG elements are not supported in the JSX syntax, use the array syntax instead");if(Array.isArray(e)){if(o(e))return i([n,s,e]);if(e.length===0)return i([n,s]);const t=c(e);return t.length===0?i([n,s]):i([n,s,...t])}return e!=null?i([n,s,e]):i([n,s])}const f=(n,r)=>a(n,r),d=(n,r)=>a(n,r),h=(n,r,e,s)=>a(n,r);export{y as Fragment,f as createElement,f as h,f as jsx,h as jsxDEV,d as jsxs};