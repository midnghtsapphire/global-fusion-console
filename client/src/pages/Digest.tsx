import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Copy, Download, FileText, Play, CheckCircle2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { displayDate, download, PageHeading, QueryError, STATIC_MODE } from "@/components/FusionShell";
export default function Digest() {
  const [turnText, setTurnText] = useState("1");
  const [turn, setTurn] = useState(1);
  const input = useMemo(() => ({ turn }), [turn]);
  const query = trpc.intelligence.render.useQuery(input, { staleTime: 600000, retry: 1, refetchOnWindowFocus: false });
  const digest = query.data;
  const valid = /^[1-9]\d{0,5}$/.test(turnText) && Number(turnText) <= 999999;
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); }
    catch { toast.error("Clipboard unavailable. Use Download instead."); }
  }
  return <><PageHeading eyebrow="DIGEST STUDIO / LOCAL PREVIEW" title="Make the signal shareable." text="One collection. One source-grounded report. Six platform-specific drafts, ready for your review—not automatically published." />
    <div className="preview-notice"><CheckCircle2 size={20} /><div><strong>Local preview only. No archive is written.</strong><p>This turn number labels your preview. It does not advance or modify Audrey’s archived TURN002. Nothing is saved to your account or posted to any social platform.</p></div></div>
    {STATIC_MODE && digest && <div className="snapshot-banner"><Clock3 size={18} /><div><strong>Snapshot generated {displayDate(digest.analysis.generated_at_utc, true)}</strong><p>Fixed report preview for turn 1. Refresh intelligence via workflow/rebuild, not this browser.</p></div></div>}
    <section className="panel studio-control"><div><p className="eyebrow">PREVIEW CONFIGURATION</p><h2>Your briefing, your turn.</h2></div><div className="turn-control"><label htmlFor="turn">Preview turn</label><Input id="turn" type="number" min="1" max="999999" step="1" value={turnText} disabled={STATIC_MODE} onChange={e => setTurnText(e.target.value)} /><Button disabled={!valid || query.isFetching || STATIC_MODE} onClick={() => { if (turn === Number(turnText)) query.refetch(); else setTurn(Number(turnText)); }}><Play size={14} />Generate preview</Button></div></section>
    {!valid && <p className="amber text-sm mt-3" role="alert">Enter a whole number from 1 to 999999.</p>}
    {query.isError ? <QueryError retry={() => query.refetch()} /> : query.isLoading ? <Skeleton className="h-96 rounded-xl mt-6" aria-label="Preparing the report preview" /> : digest && <>
      {digest.warning && <div className="warning-banner" role="status">{digest.warning}</div>}
      <div className="studio-grid"><section className="panel report-panel"><header className="section-header"><div><p className="eyebrow">GENERATED REPORT / TURN {digest.turn.toString().padStart(3, "0")}</p><h2>Operational intelligence brief</h2></div><FileText size={20} className="teal" /></header><div className="report-tools"><span>Collected {displayDate(digest.analysis.generated_at_utc, true)}</span><div><Button size="sm" variant="outline" onClick={() => download(digest.markdown, `global-fusion-preview-turn${digest.turn}.md`, "text/markdown")}><Download size={14} />Markdown</Button><Button size="sm" variant="outline" onClick={() => download(JSON.stringify(digest, null, 2), `global-fusion-preview-turn${digest.turn}.json`, "application/json")}><Download size={14} />JSON</Button></div></div><div className="report-content"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: props => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{digest.markdown}</ReactMarkdown></div></section>
      <aside className="studio-aside"><div className="panel export-note"><p className="eyebrow">BEFORE YOU SHARE</p><h3>Human judgment stays in the loop.</h3><p>Verify source dates, organizational exposure, and the recommended remediation. These drafts are a starting point, not a substitute for a security assessment.</p><div className="export-note-rule" /><span className="read-only-tag">READ-ONLY COLLECTION</span><p>Downloads are created in your browser. No report archive, account, publishing token, or paid language model is required.</p><Button variant="outline" onClick={() => copy(digest.markdown)}><Copy size={14} />Copy complete report</Button></div></aside></div>
      <section className="panel social-panel"><header className="section-header"><div><p className="eyebrow">SIX CHANNELS / ZERO AUTO-POSTING</p><h2>Social drafts</h2></div><Button variant="outline" size="sm" onClick={() => download(digest.social_drafts.map(d => `# ${d.platform}\n\n${d.text}`).join("\n\n---\n\n"), `global-fusion-social-turn${digest.turn}.md`, "text/markdown")}><Download size={14} />Download all</Button></header><Tabs defaultValue={digest.social_drafts[0]?.platform ?? "none"}><div className="tabs-scroll"><TabsList className="social-tabs">{digest.social_drafts.map(draft => <TabsTrigger value={draft.platform} key={draft.platform}>{draft.platform}</TabsTrigger>)}</TabsList></div>{digest.social_drafts.map(draft => <TabsContent value={draft.platform} key={draft.platform}><div className="draft-toolbar"><span className="read-only-tag">UNPUBLISHED DRAFT</span><div><Button variant="ghost" size="sm" onClick={() => copy(draft.text)}><Copy size={14} />Copy</Button><Button variant="ghost" size="sm" onClick={() => download(draft.text, `global-fusion-${draft.platform.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-turn${digest.turn}.txt`)}><Download size={14} />Download</Button></div></div><pre className="draft-text">{draft.text}</pre><p className="draft-footnote">Review and publish manually in {draft.platform}. Global Fusion never posts on your behalf.</p></TabsContent>)}</Tabs></section>
    </>}
  </>;
}
