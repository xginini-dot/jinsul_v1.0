import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('theme synchronization observes only theme roots and avoids unchanged storage writes',async()=>{
 const stored=new Map(),tracked=[],listeners={};let writes=0;
 const root={dataset:{}},tokens=new Set(),body={classList:{toggle(name,on){on?tokens.add(name):tokens.delete(name);},contains(name){return tokens.has(name);}}};
 const document={documentElement:root,body,addEventListener(name,fn){listeners[name]=fn;},querySelectorAll(){return [];}};
 class Observer{constructor(fn){this.callback=fn;}observe(target,options){tracked.push({target,options});}disconnect(){tracked.length=0;}}
 const context=vm.createContext({document,window:{},MutationObserver:Observer,localStorage:{getItem:key=>stored.get(key),setItem(key,value){writes++;stored.set(key,value);}}});
 vm.runInContext(await readFile(new URL('../public/theme.js',import.meta.url),'utf8'),context);
 listeners.DOMContentLoaded();assert.equal(tracked.length,2);assert.equal(tracked[0].target,root);assert.equal(tracked[1].target,body);for(const item of tracked)assert.equal(item.options.subtree,undefined);
 const initial=writes;context.window.JinsulTheme.apply('light');assert.equal(writes,initial);
 context.window.JinsulTheme.toggle();assert.equal(root.dataset.theme,'dark');assert.ok(tokens.has('dark'));assert.equal(stored.get('jinsul-portal-theme'),'dark');
 context.window.JinsulTheme.toggle();assert.equal(root.dataset.theme,'light');assert.ok(tokens.has('light'));assert.ok(!tokens.has('dark'));
});
