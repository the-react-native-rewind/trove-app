// Trove email building blocks. One layout for every email Trove sends:
// the Supabase Auth templates (rendered to supabase/templates/*.html by
// supabase/templates/build.ts) and the emails the send-email function sends
// through Resend. Colours and type follow src/theme/tokens.ts and the website.

export const brand = {
  paper: '#F2EAD9',
  surface: '#FBF6EC',
  ink: '#2B2620',
  inkSoft: '#4E453C',
  inkFaint: '#655B50',
  hairline: '#E0D3BC',
  brand: '#3F5638',
  brandDeep: '#2F4228',
  brandSoft: '#E4ECD8',
  sage: '#5F7050',
  honey: '#B6832E',
  terracotta: '#A85A34',
  onBrand: '#FBF6EC',
} as const;

const display = `Fraunces, Georgia, 'Iowan Old Style', 'Palatino Linotype', serif`;
const sans = `'Hanken Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif`;

/** Escape text that came from people (names, circle names, emails). */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function h1(html: string): string {
  return `<h1 style="margin:0 0 18px;font-family:${display};font-size:28px;line-height:1.15;font-weight:600;letter-spacing:-0.5px;color:${brand.ink};">${html}</h1>`;
}

export function p(html: string, opts: { muted?: boolean; size?: number; bold?: boolean } = {}): string {
  const color = opts.muted ? brand.inkFaint : brand.ink;
  const size = opts.size ?? 16;
  const weight = opts.bold ? 600 : 400;
  return `<p style="margin:0 0 14px;font-family:${sans};font-size:${size}px;line-height:1.55;font-weight:${weight};color:${color};">${html}</p>`;
}

/** A bulletproof-ish button: a padded link inside a table cell. `href` is used as-is. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 22px;">
  <tr><td align="center" bgcolor="${brand.brand}" style="border-radius:12px;background:${brand.brand};">
    <a href="${href}" target="_blank" style="display:inline-block;padding:15px 26px;font-family:${sans};font-size:16px;font-weight:600;line-height:1.2;color:${brand.onBrand};text-decoration:none;border-radius:12px;">${label}</a>
  </td></tr>
</table>`;
}

/** Numbered steps. Each item is trusted HTML. */
export function steps(items: string[]): string {
  const rows = items
    .map(
      (item, i) => `<tr>
    <td valign="top" style="padding:0 12px 12px 0;width:28px;">
      <div style="width:26px;height:26px;border-radius:13px;background:${brand.brandSoft};color:${brand.brandDeep};font-family:${sans};font-size:13px;font-weight:700;line-height:26px;text-align:center;">${i + 1}</div>
    </td>
    <td valign="top" style="padding:3px 0 12px;font-family:${sans};font-size:16px;line-height:1.5;color:${brand.ink};">${item}</td>
  </tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 10px;">${rows}</table>`;
}

/** A soft panel, for the circle card in the invite and for fallback links. */
export function panel(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;">
  <tr><td style="background:${brand.paper};border:1px solid ${brand.hairline};border-radius:14px;padding:16px 18px;">${html}</td></tr>
</table>`;
}

export function divider(): string {
  return `<div style="height:1px;line-height:1px;background:${brand.hairline};margin:24px 0 20px;">&nbsp;</div>`;
}

/** Plain link line under a button, for clients that hide buttons. `href` is used as-is. */
export function fallbackLink(href: string, label = 'Button not working? Paste this into your browser:'): string {
  return `<p style="margin:0;font-family:${sans};font-size:13px;line-height:1.5;color:${brand.inkFaint};">${label}<br><a href="${href}" style="color:${brand.brand};word-break:break-all;">${href}</a></p>`;
}

export type LayoutInput = {
  title: string;
  preheader: string;
  body: string;
  /** Why they got this email, shown small in the footer. */
  footerNote: string;
  /** Absolute URL of the Trove mark (the website's /mark.png). */
  markUrl: string;
};

export function layout({ title, preheader, body, footerNote, markUrl }: LayoutInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Hanken+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:${brand.paper}; }
  a { color:${brand.brand}; }
  @media (max-width: 600px) {
    .trove-card-body { padding:28px 22px 26px !important; }
    .trove-outer { padding:20px 10px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${brand.paper};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:${brand.paper};font-size:1px;line-height:1px;">${preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${brand.paper}" style="background:${brand.paper};">
  <tr><td align="center" class="trove-outer" style="padding:36px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td style="padding:0 6px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:10px;"><img src="${markUrl}" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px;"></td>
          <td valign="middle" style="font-family:${display};font-size:28px;line-height:1;font-weight:600;letter-spacing:-0.6px;color:${brand.brandDeep};">Trove</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${brand.surface};border:1px solid ${brand.hairline};border-radius:18px;overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td height="6" style="height:6px;width:41%;background:${brand.sage};font-size:0;line-height:0;border-top-left-radius:18px;">&nbsp;</td>
          <td height="6" style="height:6px;width:25%;background:${brand.honey};font-size:0;line-height:0;">&nbsp;</td>
          <td height="6" style="height:6px;width:34%;background:${brand.terracotta};font-size:0;line-height:0;border-top-right-radius:18px;">&nbsp;</td>
        </tr></table>
        <div class="trove-card-body" style="padding:36px 38px 32px;">
${body}
        </div>
      </td></tr>
      <tr><td style="padding:20px 8px 0;font-family:${sans};font-size:12.5px;line-height:1.6;color:${brand.inkFaint};">
        ${footerNote}<br>
        Trove is made by The React Native Rewind.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
