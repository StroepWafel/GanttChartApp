import db from './db.js';

function getSystemSettings() {
  const rows = db.prepare('SELECT key, value FROM system_settings').all();
  const out = {};
  for (const r of rows) {
    try {
      out[r.key] = r.value ? JSON.parse(r.value) : null;
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

/** Minimal Mailgun config for sending (API key, domain, region, From address) */
export function getMailgunConfig() {
  const s = getSystemSettings();
  const region = s.email_onboarding_region || 'us';
  const baseUrl = region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  return {
    apiKey: s.email_onboarding_api_key || '',
    domain: s.email_onboarding_domain || '',
    sendingUsername: s.email_onboarding_sending_username || 'onboarding',
    baseUrl,
  };
}

/** Config for password reset emails: Mailgun + reset link base URL */
export function getPasswordResetConfig() {
  const mailgun = getMailgunConfig();
  const s = getSystemSettings();
  return {
    ...mailgun,
    resetBaseUrl: s.password_reset_base_url || s.email_onboarding_login_url || 'https://gantt.yourdomain.ext',
  };
}

/** Full config for onboarding emails */
export function getEmailOnboardingConfig() {
  const s = getSystemSettings();
  const region = s.email_onboarding_region || 'us';
  const baseUrl = region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const useDefaultTemplate = s.email_onboarding_use_default_template !== false;
  const DEFAULT_EMAIL_TEMPLATE = `Hi {{Username}},

Your account for {{app_domain}} is ready.

You can log in with:

Username: {{Username}}
Password: {{password}}

We recommend changing your password after your first login.

Start building your project timelines here: {{login_url}}

– {{your_name}}
Gantt`;
  return {
    enabled: !!s.email_onboarding_enabled,
    apiKey: s.email_onboarding_api_key || '',
    domain: s.email_onboarding_domain || '',
    sendingUsername: s.email_onboarding_sending_username || 'onboarding',
    appDomain: s.email_onboarding_app_domain || 'gantt.yourdomain.ext',
    yourName: s.email_onboarding_your_name || 'The Team',
    loginUrl: s.email_onboarding_login_url || 'https://gantt.yourdomain.ext',
    subject: s.email_onboarding_subject || 'Your Gantt account is ready',
    template: useDefaultTemplate ? DEFAULT_EMAIL_TEMPLATE : (s.email_onboarding_template || DEFAULT_EMAIL_TEMPLATE),
    baseUrl,
  };
}

export function renderOnboardingTemplate(config, { username, password = '(generated when you send)' }) {
  const template = config.template;
  if (!template.includes('{{Username}}') || !template.includes('{{password}}')) {
    throw new Error('Email template must include {{Username}} and {{password}} placeholders');
  }
  let body = template;
  body = body.replace(/\{\{Username\}\}/g, username || '');
  body = body.replace(/\{\{password\}\}/g, password);
  body = body.replace(/\{\{app_domain\}\}/g, config.appDomain);
  body = body.replace(/\{\{login_url\}\}/g, config.loginUrl);
  body = body.replace(/\{\{your_name\}\}/g, config.yourName);
  return body;
}

export async function sendMailgunEmail(config, { to, subject, text }) {
  if (!config.apiKey || !config.domain) {
    throw new Error('Mailgun API key and domain must be configured');
  }
  const fromAddr = `${config.sendingUsername}@${config.domain}`;
  const fromDisplay = `Gantt <${fromAddr}>`;
  const url = `${config.baseUrl}/v3/${config.domain}/messages`;

  const form = new FormData();
  form.append('from', fromDisplay);
  form.append('to', to);
  form.append('subject', subject);
  form.append('text', text);

  const auth = Buffer.from(`api:${config.apiKey}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  const bodyText = await res.text();
  let bodyJson;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    bodyJson = { raw: bodyText };
  }

  return {
    statusCode: res.status,
    status: res.status === 200 ? 'ok' : 'error',
    body: bodyJson,
  };
}
