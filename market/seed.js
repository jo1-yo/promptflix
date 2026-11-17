/* Promptflix Market — seed data.
   Taxonomy, styles, brief lexicon, demo clients. Creators are in creators.js. Prices are USD. */

// Big categories. `ask` is the follow-up question; `options` its answers; each option lists 4 styles to A/B.
const TAXONOMY = {
  biz: { name:"Business & Brand", zh:"商业", blurb:"Ads, launches, demos, brand films.",
    ask:"What are you selling?",
    options:[
      { id:"software", name:"Software / SaaS", styles:["demo","story","stream","explainer"] },
      { id:"consumer", name:"Physical product", styles:["hero","ugc","story","stream"] },
      { id:"food", name:"Food & beverage", styles:["hero","ugc","story","trend"] },
      { id:"fashion", name:"Fashion & beauty", styles:["stream","hero","ugc","story"] },
      { id:"space", name:"Real estate / spaces", styles:["hero","story","explainer","stream"] },
      { id:"service", name:"Service / finance", styles:["explainer","story","ugc","demo"] },
      { id:"launch", name:"Event / launch", styles:["trend","story","hero","stream"] },
    ] },
  film: { name:"Film & Short Film", zh:"电影 · 短片", blurb:"Narrative shorts, spec films, festival pieces.",
    ask:"Which genre?",
    options:[
      { id:"scifi", name:"Sci-fi", styles:["cinematic","surreal","anime","noir"] },
      { id:"drama", name:"Drama", styles:["cinematic","doc","noir","surreal"] },
      { id:"horror", name:"Horror / thriller", styles:["noir","cinematic","surreal","found"] },
      { id:"doc", name:"Documentary-style", styles:["doc","cinematic","found","explainer"] },
      { id:"comedy", name:"Comedy", styles:["ugc","cinematic","anime","trend"] },
    ] },
  duanju: { name:"Duanju", zh:"短剧", blurb:"Vertical micro-drama, 1–3 min episodes, hooks every 15 s.",
    ask:"Which genre?",
    options:[
      { id:"romance", name:"Romance / CEO", styles:["cinematic","soap","anime","surreal"] },
      { id:"revenge", name:"Revenge / 逆袭", styles:["soap","cinematic","noir","trend"] },
      { id:"fantasy", name:"Fantasy / 穿越", styles:["surreal","anime","cinematic","soap"] },
      { id:"suspense", name:"Suspense", styles:["noir","soap","found","cinematic"] },
    ] },
  interactive: { name:"Interactive Film & Games", zh:"互动影游", blurb:"Branching stories, FMV, playable ads, cutscenes.",
    ask:"What format?",
    options:[
      { id:"branching", name:"Branching story", styles:["cinematic","anime","noir","surreal"] },
      { id:"fmv", name:"FMV game footage", styles:["cinematic","found","noir","soap"] },
      { id:"cutscene", name:"Game cutscene / trailer", styles:["cinematic","anime","surreal","hero"] },
      { id:"playable", name:"Playable ad", styles:["trend","explainer","anime","hero"] },
    ] },
  reels: { name:"Reels & Shorts", zh:"短视频", blurb:"Vertical, 6–60 s, built for the feed.",
    ask:"Which platform first?",
    options:[
      { id:"tiktok", name:"TikTok", styles:["trend","ugc","stream","hook"] },
      { id:"ig", name:"Instagram Reels", styles:["hero","stream","ugc","trend"] },
      { id:"shorts", name:"YouTube Shorts", styles:["hook","explainer","ugc","trend"] },
      { id:"xhs", name:"小红书 / Douyin", styles:["ugc","hero","trend","soap"] },
    ] },
  mv: { name:"Music Video", zh:"MV", blurb:"Full tracks, visualizers, lyric films.",
    ask:"What kind of track?",
    options:[
      { id:"pop", name:"Pop / R&B", styles:["stream","cinematic","anime","hero"] },
      { id:"hiphop", name:"Hip-hop / electronic", styles:["stream","trend","noir","surreal"] },
      { id:"indie", name:"Indie / acoustic", styles:["doc","cinematic","surreal","anime"] },
      { id:"visualizer", name:"Visualizer / loop", styles:["stream","surreal","explainer","trend"] },
    ] },
  anim: { name:"Animation & Character", zh:"动画", blurb:"Mascots, 2D/3D, character-led stories.",
    ask:"What look?",
    options:[
      { id:"3d", name:"3D", styles:["hero","cinematic","surreal","explainer"] },
      { id:"2d", name:"2D / illustrated", styles:["anime","explainer","story","trend"] },
      { id:"mascot", name:"Brand mascot", styles:["anime","explainer","ugc","hero"] },
      { id:"kids", name:"Kids / education", styles:["anime","explainer","story","soap"] },
    ] },
};

// Styles are the finest grain. Clients pick them A/B; creators are tagged with them.
const STYLES = {
  demo:      { name:"Software demo", desc:"Screen-led. The product does the talking, UI is the hero.", hue:[205,70] },
  story:     { name:"Storytelling", desc:"A character, a problem, a turn. Emotion before features.", hue:[22,80] },
  stream:    { name:"Stream of consciousness", desc:"意识流. Associative, dreamy, image-driven. Mood over message.", hue:[285,60] },
  explainer: { name:"Explainer / motion", desc:"Typography, diagrams, clean motion graphics.", hue:[160,55] },
  hero:      { name:"Product hero", desc:"Macro, slow, glossy. The object as sculpture.", hue:[40,85] },
  ugc:       { name:"UGC / testimonial", desc:"Handheld, face-to-camera, feels like a real customer.", hue:[350,65] },
  trend:     { name:"Trend / meme-native", desc:"Fast cuts, captions, sound-driven, lives in the feed.", hue:[120,65] },
  hook:      { name:"Hook-first", desc:"First 2 seconds do all the work. Retention edit.", hue:[0,75] },
  cinematic: { name:"Cinematic realism", desc:"Anamorphic, graded, film-like performances.", hue:[215,45] },
  surreal:   { name:"Surreal", desc:"Impossible physics, dream logic, AI-native imagery.", hue:[265,75] },
  anime:     { name:"Anime / stylized", desc:"2D-inspired, bold lines, expressive timing.", hue:[330,80] },
  noir:      { name:"Noir / dark", desc:"High contrast, shadows, tension.", hue:[230,25] },
  doc:       { name:"Documentary", desc:"Observational, interview-led, honest.", hue:[90,35] },
  found:     { name:"Found footage", desc:"Security cams, phones, degraded video.", hue:[70,30] },
  soap:      { name:"Soap / melodrama", desc:"Close-ups, big reactions, cliffhanger beats.", hue:[345,55] },
};

// Keyword lexicon used to read a free-text brief into (category, product, styles). A real deployment swaps this for an LLM call.
const LEXICON = [
  [/\b(saas|software|app|dashboard|platform|api|login|onboarding|feature)\b/i, {cat:"biz", opt:"software"}],
  [/\b(coffee|drink|beverage|snack|food|restaurant|cafe|tea|beer|wine)\b/i, {cat:"biz", opt:"food"}],
  [/\b(skincare|serum|makeup|beauty|fashion|sneaker|apparel|clothing|jewel)/i, {cat:"biz", opt:"fashion"}],
  [/\b(apartment|hotel|real estate|office|space|interior|architect)/i, {cat:"biz", opt:"space"}],
  [/\b(bank|fintech|insurance|loan|consult|law|clinic|agency)\b/i, {cat:"biz", opt:"service"}],
  [/\b(launch|keynote|event|conference|festival)\b/i, {cat:"biz", opt:"launch"}],
  [/\b(product|gadget|headphone|bottle|device|hardware|toy)\b/i, {cat:"biz", opt:"consumer"}],
  [/\b(short film|festival|screenplay|scene|protagonist)\b/i, {cat:"film", opt:"drama"}],
  [/\b(sci-?fi|space ship|robot|future|cyber)/i, {cat:"film", opt:"scifi"}],
  [/\b(horror|thriller|scary|haunt)/i, {cat:"film", opt:"horror"}],
  [/(短剧|duanju|micro-?drama|episode|cliffhanger|ceo|逆袭|穿越)/i, {cat:"duanju", opt:"revenge"}],
  [/\b(interactive|branching|fmv|game|cutscene|playable|trailer)\b/i, {cat:"interactive", opt:"cutscene"}],
  [/\b(tiktok|reel|shorts|vertical|9:16|feed|viral)\b/i, {cat:"reels", opt:"tiktok"}],
  [/(小红书|douyin|xiaohongshu)/i, {cat:"reels", opt:"xhs"}],
  [/\b(music video|mv|track|song|album|artist|lyrics)\b/i, {cat:"mv", opt:"pop"}],
  [/\b(animat|cartoon|mascot|character|3d|2d)/i, {cat:"anim", opt:"3d"}],
  // styles
  [/\b(demo|walkthrough|screen|ui)\b/i, {style:"demo"}],
  [/\b(story|narrative|emotional|journey|character)\b/i, {style:"story"}],
  [/(意识流|dream|abstract|mood|poetic|ethereal|surreal)/i, {style:"stream"}],
  [/\b(explain|motion graphics|typography|diagram|how it works)\b/i, {style:"explainer"}],
  [/\b(macro|glossy|hero shot|slow motion|premium|luxury)\b/i, {style:"hero"}],
  [/\b(ugc|testimonial|review|creator-style|handheld|authentic)\b/i, {style:"ugc"}],
  [/\b(trend|meme|fast cuts|captions|sound)\b/i, {style:"trend"}],
  [/\b(hook|retention|first 2 seconds)\b/i, {style:"hook"}],
  [/\b(cinematic|anamorphic|film look|35mm)\b/i, {style:"cinematic"}],
  [/\b(anime|stylized|illustrated)\b/i, {style:"anime"}],
  [/\b(noir|dark|shadow|moody)\b/i, {style:"noir"}],
  [/\b(documentary|interview|observational)\b/i, {style:"doc"}],
  [/\b(found footage|security cam|cctv)\b/i, {style:"found"}],
];

// Client backgrounds (used for creator ↔ client affinity).
const CLIENT_TYPES = [
  { id:"startup", name:"Startup / SaaS" }, { id:"dtc", name:"DTC / consumer brand" }, { id:"agency", name:"Agency (for a client)" },
  { id:"studio", name:"Studio / production company" }, { id:"label", name:"Label / artist" }, { id:"indie", name:"Individual / indie" },
];

const REGIONS = [["americas","Americas"],["emea","Europe, Africa & Middle East"],["apac","Asia-Pacific"]];
const TZS = ["UTC-8","UTC-7","UTC-6","UTC-5","UTC-3","UTC+0","UTC+1","UTC+2","UTC+3","UTC+4","UTC+5:30","UTC+7","UTC+8","UTC+9","UTC+10","UTC+12"];
const TOOLS = ["Sora","Veo","Kling","Runway","Hailuo","Seedance","Midjourney","Martini","Blender","After Effects","Unreal"];

// Creators and DISCOVERED live in creators.js (real people from the Notion list; regenerate, don't hand-edit).

// Demo merchant accounts. Sign in with these emails to skip or replay onboarding. Creators claim their crawled profile on the creator site.
const USERS = [
  { id:"u_mia", role:"client", name:"Mia Chen", org:"Lumen Coffee", type:"dtc", email:"mia@lumen.coffee", onboarded:false },
  { id:"u_dev", role:"client", name:"Dev Raman", org:"Northstar", type:"startup", email:"dev@northstar.app", onboarded:true, verified:true,
    profile:{ role:"Head of Growth", website:"northstar.app", size:"11-50", type:"startup", industry:"Fintech SaaS", goal:"Launch film for our new invoicing product", budget:"2000-5000", cadence:"monthly", cat:"biz", opt:"software", styles:["story","demo"] } },
  { id:"u_admin", role:"admin", name:"Promptflix team", email:"team@promptflix.demo" },
];

const SAMPLE_CLIP = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"; // CC0 sample used by "Use a sample clip"
