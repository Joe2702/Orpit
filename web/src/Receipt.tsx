import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useStore } from './store';
import { api } from './api';
import { isUnsynced, unsyncedMessage } from './lib/offline';
import type { Txn } from './types';

// Receipt photos.
//
// Everything is squeezed client-side before upload: a phone camera JPEG is
// 3-8 MB, and the database behind this app is a free tier. Downscaling to
// 1100px and stepping the JPEG quality down until it fits keeps a readable
// receipt at roughly 60-150 KB.

const MAX_EDGE = 1100;
const MAX_BYTES = 380_000; // stays under the server's 400 KB ceiling

/** Downscale + re-encode any image source to a data URL small enough to store. */
export async function compressFromSrc(url: string): Promise<string> {
  {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image');
    // White underneath: transparent PNGs would otherwise flatten to black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const q of [0.62, 0.5, 0.4, 0.3, 0.22]) {
      const out = canvas.toDataURL('image/jpeg', q);
      if (out.length <= MAX_BYTES) return out;
    }
    throw new Error('That photo is too large — try a closer crop');
  }
}

/** Compress a file chosen through a file input. */
export async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    return await compressFromSrc(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Ask for a receipt the native way — a "Camera or Photos" prompt — falling back
 * to a file input on the web. Returns null if the user backs out.
 *
 * The camera path matters more than it looks: photographing a receipt at the
 * till is the actual use case, and gallery-only meant doing it later or not at
 * all. The plugin launches the system camera by intent, so the app needs no
 * camera permission of its own.
 */
export async function pickReceipt(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    source: CameraSource.Prompt,
    resultType: CameraResultType.DataUrl,
    // Ask the plugin for something already close to our ceiling; the
    // compression below still guarantees the final size.
    quality: 70,
    width: 1400,
    correctOrientation: true,
    promptLabelHeader: 'Receipt',
    promptLabelPhoto: 'Choose from photos',
    promptLabelPicture: 'Take a photo',
  });
  if (!photo?.dataUrl) return null;
  return compressFromSrc(photo.dataUrl);
}

const pickerBox: React.CSSProperties = {
  height: 52,
  borderRadius: 14,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 14.5,
  fontWeight: 600,
  color: 'var(--text)',
  cursor: 'pointer',
};

/**
 * Pick a receipt for a transaction that doesn't exist yet. The compressed data
 * URL is held by the parent and sent along with the create call.
 */
export function ReceiptPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { showToast, haptic } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressImage(file));
      haptic();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not read that photo');
    } finally {
      setBusy(false);
    }
  };

  // Native gets the system "Camera or Photos" sheet; the web falls back to the
  // hidden file input, which is all a browser can offer.
  const choose = async () => {
    if (busy) return;
    if (!Capacitor.isNativePlatform()) {
      fileRef.current?.click();
      return;
    }
    setBusy(true);
    try {
      const data = await pickReceipt();
      if (data) {
        onChange(data);
        haptic();
      }
    } catch (err) {
      // A cancelled picker rejects; that isn't worth a message.
      const msg = err instanceof Error ? err.message : '';
      if (msg && !/cancel/i.test(msg)) showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      {value ? (
        <div>
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 10, background: 'var(--bg)' }}>
            <img src={value} alt="Receipt" style={{ display: 'block', width: '100%', maxHeight: 200, objectFit: 'cover' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div onClick={choose} className="press99" role="button" style={{ ...pickerBox, flex: 1 }}>Replace</div>
            <div onClick={() => onChange(null)} className="press99" role="button" style={{ ...pickerBox, flex: 1, color: 'var(--danger)', borderColor: 'color-mix(in srgb,var(--danger) 35%,var(--border))' }}>Remove</div>
          </div>
        </div>
      ) : (
        <div onClick={choose} className="press99" role="button" style={{ ...pickerBox, opacity: busy ? 0.6 : 1 }}>
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
            <path d="M2.5 6.5h3l1.5-2h5l1.5 2h3v9h-14z" />
            <circle cx="9.5" cy="11" r="3" />
          </svg>
          {busy ? 'Processing…' : 'Attach a receipt'}
        </div>
      )}
    </>
  );
}

/** Attach / view / remove the receipt on a saved transaction. */
export function ReceiptField({ txn }: { txn: Txn }) {
  const { mutate, haptic, showToast, confirm } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [full, setFull] = useState(false);

  // The image lives behind its own endpoint, so fetch it only when a receipt
  // actually exists on this transaction.
  useEffect(() => {
    let live = true;
    if (!txn.photo) {
      setPhoto(null);
      return;
    }
    setLoading(true);
    api
      .txnPhoto(txn.id)
      .then((r) => live && setPhoto(r.photo))
      .catch(() => live && setPhoto(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [txn.id, txn.photo]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again after a removal
    if (!file) return;
    // There's no server-side row to attach to until this transaction syncs.
    if (isUnsynced(txn.id)) {
      showToast(unsyncedMessage());
      return;
    }
    setLoading(true);
    try {
      const data = await compressImage(file);
      setPhoto(data); // show it straight away, before the round trip
      haptic();
      await mutate(() => api.setTxnPhoto(txn.id, data), 'Receipt saved');
    } catch (err) {
      setPhoto(null);
      showToast(err instanceof Error ? err.message : 'Could not save that photo');
    } finally {
      setLoading(false);
    }
  };

  // Same native-first choice as the picker above, then upload immediately.
  const choose = async () => {
    if (loading) return;
    if (isUnsynced(txn.id)) {
      showToast(unsyncedMessage());
      return;
    }
    if (!Capacitor.isNativePlatform()) {
      fileRef.current?.click();
      return;
    }
    setLoading(true);
    try {
      const data = await pickReceipt();
      if (data) {
        setPhoto(data);
        haptic();
        await mutate(() => api.setTxnPhoto(txn.id, data), 'Receipt saved');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg && !/cancel/i.test(msg)) showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const removePhoto = async () => {
    if (!(await confirm({ title: 'Remove this receipt?', message: 'The transaction itself stays.' }))) return;
    haptic();
    setPhoto(null);
    mutate(() => api.setTxnPhoto(txn.id, null), 'Receipt removed').catch(() => {});
  };

  const box: React.CSSProperties = {
    height: 52,
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontSize: 14.5,
    fontWeight: 600,
    color: 'var(--text)',
    cursor: 'pointer',
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />

      {photo ? (
        <div>
          <div onClick={() => setFull(true)} className="press99" role="button" style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer', marginBottom: 10, background: 'var(--bg)' }}>
            <img src={photo} alt="Receipt" style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'cover' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div onClick={choose} className="press99" role="button" style={{ ...box, flex: 1 }}>
              Replace
            </div>
            <div onClick={removePhoto} className="press99" role="button" style={{ ...box, flex: 1, color: 'var(--danger)', borderColor: 'color-mix(in srgb,var(--danger) 35%,var(--border))' }}>
              Remove
            </div>
          </div>
        </div>
      ) : (
        <div onClick={choose} className="press99" role="button" style={{ ...box, opacity: loading ? 0.6 : 1 }}>
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
            <path d="M2.5 6.5h3l1.5-2h5l1.5 2h3v9h-14z" />
            <circle cx="9.5" cy="11" r="3" />
          </svg>
          {loading ? 'Processing…' : 'Attach a receipt'}
        </div>
      )}

      {/* Full-screen view — receipts are only useful if you can read them. */}
      {full && photo && (
        <div
          onClick={() => setFull(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,9,14,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn .2s ease' }}
        >
          <img src={photo} alt="Receipt" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12 }} />
        </div>
      )}
    </>
  );
}
