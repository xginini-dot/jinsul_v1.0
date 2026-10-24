import {readFileSync} from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {sourceDirectory} from '../source.mjs';
export const html=readFileSync(path.join(sourceDirectory,'ysarang-stats2.html'),'utf8');
export function pick(name){const start=html.indexOf('function '+name+'(');if(start<0)throw Error('Missing '+name);let i=html.indexOf('{',start)+1,depth=1;for(;depth&&i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}')depth--;}return html.slice(start,i);}
export function makeHarness(range={startDate:'',endDate:''}){
 const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},disabled:false,classList:{contains:()=>false}});return elements.get(id);};
 const c={Date,console,window:{},document:{getElementById:element},$:selector=>element(selector.replace(/^#/,'')),getSelectedDateRange:()=>range,toPercent:(a,b)=>b?Math.round(a/b*100)+'%':'0%',average:a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0};
 for(const name of ['renderDuplicateInitialTable','renderCharts','renderSummaryTable','renderDoctorCarm','renderDailyTable','renderConversionTable','renderConversionMethod','renderTableGrouped'])c[name]=()=>'';
 c.orderedSummaryRows=x=>x;c.exportXlsx=sheets=>c.exports=sheets;c.window.weeklyPrepare=ctx=>c.weeklyContext=ctx;
 vm.createContext(c);
 for(const name of ['excelDateToISO','normalizeDateInput','isDateInRange','calculateAge','parseAgeFromBirthish','getAgeBand','fileMapHeaderIndex','normalizePatientId','normalizedRoom','ageFromCell','headerInfo','extractDateFromFilename','lowerBound','sortedRange','daysBetweenISO','buildOverallVisitSummary','computeStats','computeAgeBandStats','buildDailyStats','normalizePersonValue','normalizeRrn','detectSheetColumns','buildPatientDateIndex','datesForPatient','computeFirstInjectionConversion','fmt','reconcileInjectionVisits','renderInjectionMatchNote','runAnalysis'])vm.runInContext(pick(name),c);
 return {c,elements,run:fileMap=>{c.runAnalysis(fileMap);return c.window.__latestStats;},download:()=>element('downloadBtn').onclick()};
}
