export type EmailTemplateData = {
  name: string;
  subject: string;
  body: string;
  logo_url?: string;
  header_color?: string;
  cta_text?: string;
  cta_url?: string;
  sig_name?: string;
  sig_title?: string;
  sig_phone?: string;
  sig_company?: string;
};

export type LeadData = {
  name?: string;
  city?: string;
  website?: string;
  email?: string;
  [key: string]: unknown;
};

function replaceVars(text: string, lead: LeadData): string {
  return text
    .replace(/\{\{nombre_empresa\}\}/g, lead.name || '')
    .replace(/\{\{ciudad\}\}/g, lead.city || '')
    .replace(/\{\{sitio_web\}\}/g, lead.website || '')
    .replace(/\{\{email\}\}/g, lead.email || '');
}

export function renderEmail(template: EmailTemplateData, lead: LeadData): string {
  const color = template.header_color || '#f97316';
  const body = replaceVars(template.body || '', lead);
  const bodyHtml = body.split('\n').map(line => line.trim() ? `<p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.7;">${line}</p>` : '<br>').join('');

  const logoSection = template.logo_url
    ? `<div style="text-align:center;padding:24px 0 16px;">
        <img src="${template.logo_url}" alt="Logo" style="max-height:60px;max-width:200px;object-fit:contain;">
       </div>`
    : `<div style="text-align:center;padding:28px 0 20px;">
        <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${template.sig_company || 'Tu Empresa'}</span>
       </div>`;

  const ctaSection = template.cta_text
    ? `<div style="text-align:center;margin:28px 0;">
        <a href="${template.cta_url || '#'}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.3px;">${template.cta_text}</a>
       </div>`
    : '';

  const sigSection = (template.sig_name || template.sig_company)
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e7eb;">
        <tr>
          <td style="vertical-align:top;">
            <p style="margin:0 0 2px 0;font-size:15px;font-weight:700;color:#111827;">${template.sig_name || ''}</p>
            ${template.sig_title ? `<p style="margin:0 0 2px 0;font-size:13px;color:#6b7280;">${template.sig_title}</p>` : ''}
            ${template.sig_company ? `<p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:${color};">${template.sig_company}</p>` : ''}
            ${template.sig_phone ? `<p style="margin:0;font-size:13px;color:#6b7280;">📞 ${template.sig_phone}</p>` : ''}
          </td>
        </tr>
       </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${replaceVars(template.subject, lead)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:${color};border-radius:12px 12px 0 0;">
              ${logoSection}
            </td>
          </tr>

          <!-- Body card -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 40px 32px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

              ${bodyHtml}

              ${ctaSection}

              ${sigSection}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} ${template.sig_company || 'Tu Empresa'} · Este correo fue enviado a ${lead.email || ''}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
