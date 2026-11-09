import React, { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useData } from '../../store';
import { useOpen } from '../../forms/host';
import { t } from '../../i18n';
import { Button } from '../../ui/kit';
import { PageTabs } from '../../layout/Shell';
import { MoneyOverview } from './MoneyOverview';

const Transactions = lazy(() => import('./Transactions').then((m) => ({ default: m.Transactions })));
const Lists = import('./Lists');
const Accounts = lazy(() => Lists.then((m) => ({ default: m.Accounts })));
const Budgets = lazy(() => Lists.then((m) => ({ default: m.Budgets })));
const Goals = lazy(() => Lists.then((m) => ({ default: m.Goals })));
const Bills = lazy(() => Lists.then((m) => ({ default: m.Bills })));
const Categories = lazy(() => Lists.then((m) => ({ default: m.Categories })));

export function Money() {
  const s = useData();
  const open = useOpen();
  const reviewN = s.txns.filter((x) => x.review).length;
  const add = (label: string, run: () => void) => <Button kind="primary" icon="plus" onClick={run}>{label}</Button>;
  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{t('Money')}</h1>
          <div className="page-sub">{t('Every account, budget and bill in one place.')}</div>
        </div>
        <Routes>
          <Route path="accounts" element={add(t('New account'), () => open({ kind: 'account' }))} />
          <Route path="budgets" element={add(t('New budget'), () => open({ kind: 'budget' }))} />
          <Route path="goals" element={add(t('New goal'), () => open({ kind: 'goal' }))} />
          <Route path="bills" element={add(t('New repeating payment'), () => open({ kind: 'bill' }))} />
          <Route path="categories" element={add(t('New category'), () => open({ kind: 'fcat' }))} />
          <Route path="*" element={add(t('New transaction'), () => open({ kind: 'txn' }))} />
        </Routes>
      </div>
      <PageTabs
        tabs={[
          { to: '/money', label: t('Overview'), end: true },
          { to: '/money/transactions', label: t('Transactions'), badge: reviewN },
          { to: '/money/accounts', label: t('Accounts') },
          { to: '/money/budgets', label: t('Budgets') },
          { to: '/money/goals', label: t('Goals') },
          { to: '/money/bills', label: t('Bills & subscriptions') },
          { to: '/money/categories', label: t('Categories') },
        ]}
      />
      <Suspense fallback={<div className="skeleton" style={{ height: 360 }} />}>
        <Routes>
          <Route path="transactions" element={<Transactions />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="goals" element={<Goals />} />
          <Route path="bills" element={<Bills />} />
          <Route path="categories" element={<Categories />} />
          <Route path="*" element={<MoneyOverview />} />
        </Routes>
      </Suspense>
    </div>
  );
}
