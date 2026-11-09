import React from 'react';
import { useStore } from '../store';
import { t } from '../i18n';
import { Button, Dialog } from '../ui/kit';
import { Icon } from '../ui/Icon';

/** Toasts in the corner, and the "are you sure?" dialog. */
export function Overlays() {
  const { toasts, dismiss, confirming } = useStore();
  return (
    <>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast${x.bad ? ' bad' : ''}`}>
            <Icon name={x.bad ? 'alert' : 'check'} size={16} style={{ color: x.bad ? 'var(--bad)' : 'var(--accent)' }} />
            <span style={{ flex: 1 }}>{x.text}</span>
            {x.action && (
              <button
                className="link"
                onClick={() => {
                  x.action!.run();
                  dismiss(x.id);
                }}
              >
                {x.action.label}
              </button>
            )}
            <button className="btn ghost icon sm" onClick={() => dismiss(x.id)} aria-label={t('Close')}>
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
      {confirming && (
        <Dialog
          title={confirming.title}
          onClose={() => confirming.resolve(false)}
          onSubmit={() => confirming.resolve(true)}
          footer={
            <>
              <span className="spacer" />
              <Button kind="ghost" onClick={() => confirming.resolve(false)}>
                {t('Cancel')}
              </Button>
              <Button kind={confirming.danger ? 'danger solid' : 'primary'} type="submit">
                {confirming.confirm || t('OK')}
              </Button>
            </>
          }
        >
          <div className="muted" style={{ lineHeight: 1.6 }}>
            {confirming.message}
          </div>
        </Dialog>
      )}
    </>
  );
}
