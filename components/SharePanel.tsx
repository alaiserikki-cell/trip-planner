"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, QrCode, Share2 } from "lucide-react";
import { copyText } from "@/lib/client";
import { prettyDeadline } from "@/lib/dates";

export function inviteMessage(tripName: string, url: string, deadline: string) {
  return `Let's actually plan "${tripName}" 🧳 Tap your name, or add it if it's not there, and fill this in (takes 3 min, only you see your answers): ${url}\nPlease do it by ${prettyDeadline(deadline)}.`;
}

export default function SharePanel({ url, tripName, deadline, defaultOpen }: { url: string; tripName: string; deadline: string; defaultOpen: boolean }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const message = inviteMessage(tripName, url, deadline);

  const native = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: tripName, text: message });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    if (await copyText(message)) flash();
  };
  const flash = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-ghost w-full py-3 text-sm">
        <Share2 size={16} /> Share the trip link
      </button>
    );
  }

  return (
    <div className="card rise space-y-4 p-5">
      <div>
        <p className="font-display text-lg font-bold">Send this to the group</p>
        <p className="text-sm text-muted">One link for everyone. Friends pick their name, or add it if you didn&apos;t.</p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-sunk px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-sm">{url.replace(/^https?:\/\//, "")}</span>
        <button
          onClick={async () => (await copyText(url)) && flash()}
          className="shrink-0 text-sm font-semibold text-brand"
          aria-label="Copy link"
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn py-3 text-sm text-white"
          style={{ background: "#1faa53" }}
        >
          <WhatsAppIcon /> WhatsApp
        </a>
        <button onClick={native} className="btn btn-dark py-3 text-sm">
          <Share2 size={16} /> {copied ? "Copied!" : "Other apps"}
        </button>
      </div>
      <button onClick={() => setShowQr((s) => !s)} className="flex w-full items-center justify-center gap-2 text-sm font-medium text-muted">
        <QrCode size={16} /> {showQr ? "Hide QR code" : "Show QR code"}
      </button>
      {showQr && (
        <div className="flex justify-center rounded-2xl bg-white p-4">
          <QRCodeSVG value={url} size={180} level="M" />
        </div>
      )}
    </div>
  );
}

export function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}
