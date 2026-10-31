import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { IconPencil, IconTrash } from '../icons';
import { t, tData } from '../i18n';

const COLORS = ['coral', 'indigo', 'teal', 'blue', 'emerald', 'purple', 'pink', 'amber', 'cyan', 'rose'];

// List of categories with add/edit affordances.
export function WCatsSheet() {
  const { state, open } = useStore();
  const cats = state!.wCats;
  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 6px' }}>{t('Categories')}</div>
      <div style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 18, lineHeight: 1.5 }}>{t('Tap a category to rename, recolor, or remove it.')}</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', overflow: 'hidden', marginBottom: 16 }}>
        {cats.map((c, i) => (
          <div role="button" tabIndex={0}
            key={c.id}
            onClick={() => open('wcat', { id: c.id, name: c.name, color: c.color })}
            className="pressRow"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 16px', borderBottom: i === cats.length - 1 ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 4, flex: 'none', background: `var(--${c.color})` }} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{tData(c.name)}</span>
            <IconPencil />
          </div>
        ))}
      </div>
      <div role="button" tabIndex={0}
        onClick={() => open('wcat')}
        className="press99"
        style={{ height: 52, borderRadius: 'calc(16px * var(--sq))', border: '1.5px dashed color-mix(in srgb,var(--indigo) 40%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer' }}
      >
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
        {t('New category')}
      </div>
    </div>
  );
}

// Add/edit a single category.
export function WCatSheet() {
  const { sheetData, open, mutateOpt, state, haptic, showToast, confirm } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [name, setName] = useState<string>(sheetData?.name ?? '');
  const [color, setColor] = useState<string>(sheetData?.color ?? 'coral');
  const canSave = !!name.trim();

  const save = () => {
    if (!canSave) return;
    haptic();
    const body = { name: name.trim(), color };
    if (editId) {
      mutateOpt(
        (s) => ({ ...s, wCats: s.wCats.map((c) => (c.id === editId ? { ...c, ...body } : c)) }),
        () => api.editCategory(editId, body),
        t('Category updated')
      ).catch(() => {});
    } else {
      const tempId = 'tmp_' + Date.now();
      mutateOpt(
        (s) => ({ ...s, wCats: [...s.wCats, { id: tempId, ...body }] }),
        () => api.addCategory(body),
        t('Category added')
      ).catch(() => {});
    }
    open('wcats');
  };

  const del = async () => {
    if (!editId) return;
    if (state!.wCats.length <= 1) {
      showToast(t('Keep at least one category'));
      return;
    }
    if (!(await confirm({ title: t('Delete this category?'), message: t('Workouts in it become uncategorised.') }))) return;
    haptic();
    mutateOpt(
      (s) => ({ ...s, wCats: s.wCats.filter((c) => c.id !== editId) }),
      () => api.deleteCategory(editId),
      t('Category deleted')
    ).catch(() => {});
    open('wcats');
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 20px' }}>
        {editId ? t('Edit category') : t('New category')}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t('Name')}</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('e.g. Swim')}
        style={{ width: '100%', height: 52, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 22 }}
      />
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>{t('Color')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, paddingInlineStart: 2 }}>
        {COLORS.map((c) => (
          <div role="button" tabIndex={0} aria-label={c} aria-pressed={color === c}
            key={c}
            onClick={() => setColor(c)}
            style={{ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flex: 'none', background: `var(--${c})`, transition: 'all .15s', boxShadow: color === c ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : '0 0 0 0 transparent' }}
          />
        ))}
      </div>
      <div role="button" tabIndex={0}
        onClick={save}
        style={{ background: canSave ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 40%,var(--surface))', color: 'var(--on-accent)', height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: canSave ? 'pointer' : 'default', letterSpacing: '-.01em' }}
      >
        {editId ? t('Save changes') : t('Add category')}
      </div>
      {editId && (
        <div role="button" tabIndex={0} onClick={del} className="press99" style={{ height: 52, borderRadius: 'calc(16px * var(--sq))', border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10 }}>
          <IconTrash />
          {t('Delete category')}
        </div>
      )}
    </div>
  );
}
