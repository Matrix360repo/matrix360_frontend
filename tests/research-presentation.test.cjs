'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {schema,normalize}=require('../lib/m360-research-presentation');
const {validate}=require('../lib/m360-control-contract');
const research={summary:'A proposed campaign for a software service.',audience_industry:'Software buyers',audience_location:'Pune',audience_rationale:'A proposed industry fit.',competitor_findings:['Alpha: software integration with about 10 supported connectors.','Beta: software integration with 20 supported connectors.','Gamma: no software integration is stated.'],content_trends:['Explain connectivity to existing software.','Show the support service scope.'],recommendations:['Create a website','Produce a case study'],uncertainties:['Actual availability needs confirmation.'],creative_brief:'Use approved company facts.'};
const presentation=()=>({geography_rationale:'Pune is the proposed search region; no measured demand ranking is established.',dimensions:['Integration'],competitors:[{observation:research.competitor_findings[0],evidence:[{dimension:'Integration',quote:'software integration',source_url:'https://example.com/alpha'}]}],messages:[{observation:research.content_trends[0],buyer_question:'Which existing systems can this connect to?',proof_needed:'Obtain a compatibility list.',next_step:'Request a compatibility review.',measurement:'Track qualified integration questions.',source_url:'https://example.com/alpha'}],actions:[],quantitative:[],synthesis:{decision:'Compare documented compatibility.',gaps:['Confirm the unsupported systems.']}});

test('structured research accepts only exact observations, allowed source URLs and affirmative verbatim evidence',()=>{
 const p=presentation();validate(p,schema);
 p.competitors.push({observation:research.competitor_findings[1],evidence:[{dimension:'Integration',quote:'software integration',source_url:'https://unrelated.example/'}]});
 p.competitors.push({observation:research.competitor_findings[2],evidence:[{dimension:'Integration',quote:'software integration',source_url:'https://example.com/alpha'}]});
 p.competitors.push({observation:'Invented competitor',evidence:[{dimension:'Integration',quote:'invented evidence',source_url:'https://example.com/alpha'}]});
 p.dimensions.push('Emotional appeal');
 p.competitors[0].evidence.push({dimension:'Integration',quote:'Invented certification',source_url:'https://example.com/alpha'});
 p.messages.push({...p.messages[0],observation:'An observation not in the report'});
 const result=normalize(p,research,['https://example.com/alpha']);
 assert.deepEqual(result.dimensions,['Integration']);
 assert.equal(result.competitors.length,3);assert.equal(result.competitors[0].evidence.length,1);assert.equal(result.competitors[1].evidence.length,0);assert.equal(result.competitors[2].evidence.length,0);assert.equal(result.messages.length,1);
 p.competitors[0].evidence[0].source_url='https://person:password@example.com/alpha';
 const unsupported=normalize(p,research,['https://example.com/alpha']);
 assert.equal(unsupported.competitors[0].evidence.length,0);
 assert.deepEqual(unsupported.dimensions,[]);
 assert.deepEqual(unsupported.synthesis,{decision:'',gaps:[]});
});

test('tracked source links and a separate caveat do not erase documented features',()=>{
 const observation='Alpha: offers software integration; pricing is not published.';
 const p=presentation();
 p.competitors=[{observation,evidence:[
  {dimension:'Integration',quote:'offers software integration',source_url:'https://example.com/alpha?utm_source=search#overview'},
  {dimension:'Integration',quote:'pricing is not published',source_url:'https://example.com/alpha'},
  {dimension:'Integration',quote:'offers software integration',source_url:'https://example.com/alpha?product=another'}
 ]}];
 const result=normalize(p,{...research,competitor_findings:[observation]},['https://example.com/alpha']);
 assert.deepEqual(result.competitors[0].evidence.map(({quote,source_url})=>[quote,source_url]),[
  ['offers software integration','https://example.com/alpha']
 ]);
});

test('quantitative comparisons retain qualifiers and reject fabricated, mismatched or partial numeric matches',()=>{
 const p=presentation();const first={observation:research.competitor_findings[0],value:10,qualifier:'about',source_url:'https://example.com/alpha'},second={observation:research.competitor_findings[1],value:20,qualifier:'',source_url:'https://example.com/alpha'};
 p.quantitative=[{metric:'Supported connectors',unit:'supported connectors',values:[first,second]}];
 const run=()=>normalize(p,research,['https://example.com/alpha']).quantitative;
 assert.equal(run().length,1);assert.equal(run()[0].values[0].qualifier,'about');
 first.qualifier='';assert.equal(run().length,0);
 first.qualifier='about';second.value=0;assert.equal(run().length,0);
 second.value=20;p.quantitative[0].unit='customers';assert.equal(run().length,0);
 p.quantitative[0].unit='supported connector';assert.equal(run().length,0);
});

function view(value,full=false,fallback=null){
 function node(tag,text){return {tag,text,children:[],style:{},attributes:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(name,fn){this[name]=fn;}};}
 const code=fs.readFileSync(path.join(__dirname,'../lib/m360-research-client.js'),'utf8');const context={node,URL};
 vm.runInNewContext(code.slice(code.indexOf(' function strategyVisuals('),code.indexOf(' function reviewPrompt(')),context);
 const root=node('div');if(full)context.render(root,{created_at:'2026-11-03T00:00:00Z',profile_version:2,current_profile_version:3,research:value,sources:['https://example.com/alpha'],forecast:{disclaimer:'Hypothetical only.',rows:[],missing:['investment_budget','expected_conversion_rate']}});else context.strategyVisuals(root,value,['https://example.com/alpha'],fallback);
 const all=e=>[e,...e.children.flatMap(all)];return {root,all};
}

test('older non-industrial reports retain the table template without industrial columns or affirmative negations',()=>{
 const {root,all}=view(research);const cells=all(root);
 assert.ok(cells.some(e=>e.tag==='table'&&e.className==='m360-position-matrix'));
 assert.ok(!cells.some(e=>e.tag==='th'&&e.text==='Land / plots'));
 assert.ok(!cells.some(e=>e.tag==='tr'&&all(e).some(x=>x.text==='Gamma: no software integration is stated.')));
});

test('saved reports display only structured columns backed by a cited observation',()=>{
 const p=presentation();
 p.dimensions.push('Emotional appeal','Regional resonance');
 const {root,all}=view({...research,presentation:p});
 const table=all(root).find(e=>e.className==='m360-position-matrix');
 assert.deepEqual(all(table).filter(e=>e.tag==='th'&&e.scope==='col').map(e=>e.text),['Company','Integration']);
 assert.equal(all(table).filter(e=>e.className==='m360-position-present').length,1);
 assert.equal(all(table).filter(e=>e.className==='m360-position-unknown').length,0);
 assert.ok(all(table).some(e=>e.tag==='span'&&e.text==='software integration'));
});

test('empty structured comparisons recover concrete observations or show evidence without an empty table',()=>{
 const p={...presentation(),dimensions:['Emotional appeal'],competitors:[]};
 const findings=['Alpha: offers industrial plots and warehousing.','Beta: offers industrial plots.'];
 const recovered=view({...research,competitor_findings:findings,presentation:p});
 const table=recovered.all(recovered.root).find(e=>e.className==='m360-position-matrix');
 assert.deepEqual(recovered.all(table).filter(e=>e.tag==='th'&&e.scope==='col').map(e=>e.text),['Company','Land / plots','Warehousing']);
 assert.equal(recovered.all(table).filter(e=>e.className==='m360-position-present').length,3);

 const unsupported='Gamma Infrastructure: no public offering details were stated.';
 const empty=view({...research,competitor_findings:[unsupported],presentation:p});
 const elements=empty.all(empty.root);
 assert.ok(!elements.some(e=>e.className==='m360-position-matrix'));
 assert.ok(elements.some(e=>e.text==='View evidence'));
 assert.ok(elements.some(e=>e.text===unsupported));
 assert.ok(elements.some(e=>e.text?.includes('lacks enough evidence for a feature comparison')));
});

test('empty fresh research renders a labeled earlier comparison with its own sources',()=>{
 const old=presentation(),source='https://example.org/earlier';
 old.comparison_ranked=true;
 old.competitors[0].evidence[0].source_url=source;
 const {root,all}=view({...research,competitor_findings:[]},false,{
  checked_at:'2026-11-04T00:00:00Z',market:'Earlier research region',sources:[source],
  research:{...research,competitor_findings:[research.competitor_findings[0]],presentation:old}
 });
 const elements=all(root);
 assert.ok(elements.some(e=>e.text?.includes('Showing the last usable comparison')));
 assert.ok(elements.some(e=>e.text?.includes('Earlier research region')));
 assert.ok(elements.some(e=>e.tag==='span'&&e.text==='software integration'));
 assert.ok(elements.some(e=>e.tag==='a'&&e.href===source));
});

test('ranked comparison switches feature columns without changing ranks or evidence',()=>{
 const p=presentation();
 p.comparison_ranked=true;
 p.dimensions=['Integration','Offer'];
 p.competitors.push({observation:research.competitor_findings[1],evidence:[{dimension:'Offer',quote:'20 supported connectors',source_url:'https://example.com/alpha'}]});
 const {root,all}=view({...research,presentation:p});
 const elements=all(root),matrix=elements.find(e=>e.className==='m360-position-matrix');
 const [integration,offer,full]=elements.find(e=>e.className==='m360-comparison-options').children;
 const headers=()=>all(matrix).filter(e=>e.scope==='col'&&!e.hidden).map(e=>e.text);
 const ranked=all(matrix).filter(e=>e.className==='m360-comparison-company');
 assert.deepEqual(ranked.map(e=>e.children.map(child=>child.text)),[['01','Alpha'],['02','Beta']]);
 assert.deepEqual(headers(),['Company','Offer']);
 assert.equal(offer.attributes['aria-pressed'],'true');
 const evidence=all(matrix).find(e=>e.tag==='details');evidence.open=true;
 integration.click();
 assert.deepEqual(headers(),['Company','Integration']);
 assert.equal(integration.attributes['aria-pressed'],'true');
 assert.equal(offer.attributes['aria-pressed'],'false');
 full.click();
 assert.deepEqual(headers(),['Company','Integration','Offer']);
 assert.equal(evidence.open,true);
 assert.ok(all(evidence).some(e=>e.text==='Source: Integration'&&e.href==='https://example.com/alpha'));
});

test('each message selection changes its decision and proof, while structured explanations remain source-bound',()=>{
 const p=presentation();const {root,all}=view({...research,presentation:normalize(p,research,['https://example.com/alpha'])});
 const buttons=all(root).filter(e=>e.className==='m360-message-selector');
 assert.ok(all(root).some(e=>e.text==='Which existing systems can this connect to?'));
 buttons[1].click();assert.equal(buttons[1].attributes['aria-pressed'],'true');assert.equal(buttons[0].attributes['aria-pressed'],'false');
 assert.ok(!all(root).some(e=>e.text==='Which existing systems can this connect to?'));
 assert.ok(all(root).some(e=>e.text==='Which tasks will the supplier handle, and where does the buyer take over?'));
 assert.ok(!all(root).some(e=>e.text?.startsWith('Start with this theme:')));
});

test('report retains original text and uncertainties, identifies stale facts and presents friendly planning labels',()=>{
 const {root,all}=view(research,true),elements=all(root);
 assert.equal(elements.filter(e=>e.className==='m360-research-hero').length,0);
 assert.ok(elements.some(e=>e.className==='m360-text-bubble'));
 assert.ok(elements.some(e=>e.className==='m360-report-stale'&&e.attributes.role==='status'));
 assert.ok(elements.some(e=>e.text==='Actual availability needs confirmation.'));
 assert.ok(elements.some(e=>e.text?.includes('Investment budget, Expected conversion rate (%)')));
 assert.ok(!elements.some(e=>e.text?.includes('investment_budget')));
});

test('actions in the same broad stage retain their own supplied deliverables and preparation',()=>{
 const p=presentation(),recommendations=['Create a product landing page','Create a technical website'];
 p.actions=recommendations.map((recommendation,index)=>({recommendation,reason:'Reason '+index,deliverable:'Deliverable '+index,preparation:['Preparation '+index],measurement:'Measurement '+index,source_url:''}));
 const {root,all}=view({...research,recommendations,presentation:p});
 const buttons=all(root).filter(e=>e.tag==='button'&&e.children.some(child=>child.text===recommendations[1]));buttons[0].click();
 assert.ok(all(root).some(e=>e.text==='Deliverable 1'));assert.ok(all(root).some(e=>e.text==='Preparation 1'));assert.ok(!all(root).some(e=>e.text==='Deliverable 0'));
});
