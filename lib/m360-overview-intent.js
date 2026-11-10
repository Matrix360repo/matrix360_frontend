'use strict';

// Keep this function self-contained. The Overview browser bundle includes the same classifier.
module.exports=function resolveOverviewIntent(message){
 const request=String(message||'').trim().split('\n').filter(line=>!/^\s*(?:type of prospects or industry focus|target location for prospect search):/i.test(line)).join(' ').replace(/\s+/g,' ').toLowerCase();
 const advisory=/^(?:why|what|how|when|where|is|are|do|should|would you recommend)\b/.test(request);
 const reel=/\b(?:reels?|short[- ]form videos?|short videos?|storyboards?|motion graphics)\b/.test(request);
 const produce=/\b(?:create|make|produce|generate|render|draft|write|design|prepare|build|need|want|record|edit)\b/.test(request);
 const image=/\b(?:images?|graphics?|posters?|visuals?|banners?)\b/.test(request);
 const channel=[[/\bwhatsapp\b/,'WhatsApp'],[/\blinkedin\b/,'LinkedIn'],[/\binstagram\b/,'Instagram'],
  [/\bfacebook\b/,'Facebook'],[/\bemail\b/,'Email'],[/\byoutube\b/,'YouTube'],[/\btwitter\b/,'X']]
  .find(([pattern])=>pattern.test(request))?.[1]||'';
 if(!advisory&&reel&&produce)return {kind:'reel'};
 if(/\b(?:find|source|search for|generate|get)\b.*\b(?:prospects?|leads?|manufacturers?|suppliers?|distributors?|dentists?|companies|buyers|businesses|contacts?)\b/.test(request)&&!advisory&&!/\b(?:campaign|outreach)\b/.test(request))return {kind:'leads'};
 const outreach=/\b(?:outreach|send|distribute|contact|follow[- ]up sequence)\b/.test(request);
 const campaign=/\bcampaign\b/.test(request);
 if(!advisory&&campaign&&channel==='Email'&&image&&
    /\b(?:find|source|generate)\b.*\b(?:prospects?|leads?)\b/.test(request)&&outreach)return {kind:'email_workflow'};
 if((!advisory&&/\b(?:market research|market analysis|research (?:the |our |a )?(?:market|competitors?|audience)|compare (?:the |our )?competitors?|competitor (?:research|analysis))\b/.test(request))||
    /\bwhich market\b.*\bprioriti[sz]e\b/.test(request))return {kind:'research'};
 if(!advisory&&image&&produce)return {kind:'image',channel};
 if(!advisory&&(outreach||campaign&&channel||/\b(?:email marketing|marketing campaign|campaign calendar|marketing plan)\b/.test(request))&&/\b(?:plan|launch|start|run|send|prepare|draft|create|set up|build|need|want)\b/.test(request))return {kind:'outreach',channel};
 if(!advisory&&campaign&&/\b(?:plan|launch|prepare|build|create|run|start)\b/.test(request))return {kind:'campaign_plan'};
 if(!advisory&&produce&&channel&&/\b(?:copy|posts?|captions?|messages?|emails?)\b/.test(request))return {kind:'copy',channel};
 if(!advisory&&produce&&/\b(?:content|creative|posts?|captions?|copy)\b/.test(request))return {kind:'content'};
 return {kind:'advice'};
};
