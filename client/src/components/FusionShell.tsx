import { Link, useLocation } from "wouter";
import { ArrowUpRight, Shield, Radio, FileText, Blocks, LockKeyhole, Github } from "lucide-react";
import { REPOSITORY } from "@shared/fusion";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === "true";
export function displayDate(value?: string, withTime = false) {
  if (!value) return "Not available";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}
export function download(content: string, name: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={`external-link ${className}`}>{children}<ArrowUpRight size={14} aria-hidden="true" /></a>;
}
export default function FusionShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const nav = [{ href: "/", name: "Intelligence", icon: Radio }, { href: "/digest", name: "Digest studio", icon: FileText }, { href: "/integrations", name: "Integrations", icon: Blocks }];
  return <div className="console-shell">
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand"><span className="brand-mark"><Shield size={22} strokeWidth={1.7} /></span><span>GLOBAL<span className="brand-fusion">FUSION</span><small>by midnghtsapphire</small></span></Link>
      <nav aria-label="Main navigation">{nav.map(({ href, name, icon: Icon }) => <Link href={href} key={href} className={`nav-link ${location === href ? "active" : ""}`} aria-current={location === href ? "page" : undefined}><Icon size={15} /><span>{name}</span></Link>)}</nav>
      <a className="header-github" href={REPOSITORY} target="_blank" rel="noopener noreferrer" aria-label="Global Fusion on GitHub"><Github size={20} /></a>
    </div></header>
    <div className="context-bar"><div className="page-width"><span><span className="status-dot" />PUBLIC INTELLIGENCE CONSOLE</span><span><LockKeyhole size={12} /> Read-only · No sign-in required</span></div></div>
    <main id="main" className="page-width" tabIndex={-1}>{children}</main>
    <footer className="site-footer page-width"><div><Shield size={15} /><span>Global Fusion <span className="muted">/ Independent intelligence, official sources.</span></span></div><div><Link href="/privacy">Privacy & support</Link><ExternalLink href={REPOSITORY}>Open source</ExternalLink></div><p>Not affiliated with CISA or the FBI. Operational priorities are heuristic triage labels, not official severity ratings.</p></footer>
  </div>;
}
export function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: ReactNode }) {
  return <section className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="heading-description">{text}</p></div>{action}</section>;
}
export function QueryError({ retry }: { retry: () => void }) {
  return <section className="empty-state" role="alert"><Radio size={26} /><h2>Signal temporarily unavailable</h2><p>Official sources could not be collected. No invented intelligence is shown. Please retry shortly or visit the official sources directly.</p><div className="flex flex-wrap gap-3 justify-center"><Button onClick={retry}>Retry collection</Button><ExternalLink href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog">CISA KEV</ExternalLink><ExternalLink href="https://www.ic3.gov/PSA">FBI IC3</ExternalLink></div></section>;
}
