/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/extension-hard-break@3.32.0/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{Node as c,mergeAttributes as f}from"./tiptap-core@3.32.0.js";const n=c.create({name:"hardBreak",markdownTokenName:"br",addOptions(){return{keepMarks:!0,HTMLAttributes:{}}},inline:!0,group:"inline",selectable:!1,linebreakReplacement:!0,parseHTML(){return[{tag:"br"}]},renderHTML({HTMLAttributes:e}){return["br",f(this.options.HTMLAttributes,e)]},renderText(){return`
`},renderMarkdown:()=>`  
`,parseMarkdown:()=>({type:"hardBreak"}),addCommands(){return{setHardBreak:()=>({commands:e,chain:a,state:s,editor:o})=>e.first([()=>e.exitCode(),()=>e.command(()=>{const{selection:r,storedMarks:i}=s;if(r.$from.parent.type.spec.isolating)return!1;const{keepMarks:d}=this.options,{splittableMarks:u}=o.extensionManager,t=i||r.$to.parentOffset&&r.$from.marks();return a().insertContent({type:this.name}).command(({tr:k,dispatch:l})=>{if(l&&t&&d){const m=t.filter(p=>u.includes(p.type.name));k.ensureMarks(m)}return!0}).scrollIntoView().run()})])}},addKeyboardShortcuts(){return{"Mod-Enter":()=>this.editor.commands.setHardBreak(),"Shift-Enter":()=>this.editor.commands.setHardBreak()}}});var M=n;export{n as HardBreak,M as default};