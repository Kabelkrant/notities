/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/extension-text@3.32.0/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{Node as r}from"./tiptap-core@3.32.0.js";const t=r.create({name:"text",group:"inline",parseMarkdown:e=>({type:"text",text:e.text||""}),renderMarkdown:e=>e.text||""});var a=t;export{t as Text,a as default};