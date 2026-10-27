import { useState } from 'react';
import { get, put } from '../lib/api';
import { errorMessage, useData } from '../lib/useData';
import type { AgentSettings, LanguageCode } from '../lib/types';
import { LANGUAGE_NAMES, titleCase } from '../lib/format';
import { Badge, Button, Card, Loading, Notice, PageHeader } from '../components/ui';

type Templates = Record<LanguageCode, Record<string, string>>;

const ORDER: LanguageCode[] = ['en', 'hi', 'ta', 'te', 'ml'];

export function LanguagesPage() {
  const settings = useData(() => get<AgentSettings>('/settings'), []);
  const templates = useData(() => get<Templates>('/agent/templates'), []);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [previewLang, setPreviewLang] = useState<LanguageCode>('en');
  const [draft, setDraft] = useState<AgentSettings['languages'] | null>(null);

  const current = draft ?? settings.data?.languages ?? null;

  const save = async () => {
    if (!current) return;
    try {
      await put('/settings/languages', current);
      setNotice({ tone: 'success', text: 'Language settings saved.' });
      setDraft(null);
      void settings.reload();
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    }
  };

  const toggle = (lang: LanguageCode) => {
    if (!current) return;
    const enabled = current.enabled.includes(lang) ? current.enabled.filter((l) => l !== lang) : [...current.enabled, lang];
    setDraft({ ...current, enabled, default: enabled.includes(current.default) ? current.default : enabled[0] ?? 'en' });
  };

  return (
    <>
      <PageHeader title="Five-language settings" subtitle="The agent detects the language a supplier speaks and replies in it." />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="grid grid-2">
        <Card title="Languages" actions={draft && <Button onClick={() => void save()}>Save changes</Button>}>
          {!current ? <Loading /> : (
            <>
              {ORDER.map((lang) => (
                <label key={lang} className="check" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={current.enabled.includes(lang)} onChange={() => toggle(lang)} />
                  <span style={{ flex: 1 }}>{LANGUAGE_NAMES[lang]}</span>
                  {current.default === lang && <Badge tone="purple">Default</Badge>}
                </label>
              ))}
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="default-lang">Default language when the supplier's language is unclear</label>
                <select id="default-lang" value={current.default} onChange={(e) => setDraft({ ...current, default: e.target.value as LanguageCode })}>
                  {current.enabled.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
                </select>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                Language is detected from the script the supplier uses (Devanagari, Tamil, Telugu, Malayalam). Romanised speech keeps the current language.
              </p>
            </>
          )}
        </Card>

        <Card title="Scripts">
          <div className="row" style={{ marginBottom: 12 }}>
            {ORDER.map((lang) => (
              <Button key={lang} variant={previewLang === lang ? 'primary' : 'ghost'} onClick={() => setPreviewLang(lang)}>{LANGUAGE_NAMES[lang]}</Button>
            ))}
          </div>
          <Notice tone="warn">
            Hindi, Tamil, Telugu and Malayalam wording must be reviewed by a native speaker before any live campaign.
          </Notice>
          {!templates.data ? <Loading /> : (
            <dl className="kv">
              {Object.entries(templates.data[previewLang]).map(([key, text]) => (
                <div key={key} style={{ display: 'contents' }}>
                  <dt>{titleCase(key)}</dt>
                  <dd lang={previewLang}>{text}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>
    </>
  );
}
