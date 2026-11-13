window.__ModuleLoader__.load({
  id: 'dsh-plugin-balance',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'deepseek-balance';
    /** Refresh cadence for the wallet read. */
    const REFRESH_MS = 60000;
    /** Destination used until the Host reports its own Platform usage URL. */
    const DEFAULT_USAGE_URL = 'https://platform.deepseek.com/usage';
    /** Style element identity, matched by the disposal path. */
    const CSS_TAG_ID = 'dsh-plugin-balance/ComposerBalance.module.css';

    const en = {
      'pill.title': 'DeepSeek balance',
      'pill.available': 'Available',
      'pill.topUp': 'Top-up credit',
      'pill.bonus': 'Bonus credit',
      'pill.aria': 'DeepSeek balance',
      'pill.openUsage': 'Open usage',
    };

    const zh = {
      'pill.title': 'DeepSeek 余额',
      'pill.available': '可用余额',
      'pill.topUp': '充值余额',
      'pill.bonus': '赠送余额',
      'pill.aria': 'DeepSeek 余额',
      'pill.openUsage': '打开用量页面',
    };

    /** Composer-dock pill geometry copied from the sibling stat pills. */
    const CSS = [
      '.dsb-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);',
      'line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}',
      '.dsb-pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;',
      'color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;',
      'line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;',
      'gap:6px;padding:1px 8px;display:inline-flex}',
      '.dsb-pill svg{flex:none;width:14px;height:14px}',
      '.dsb-label{text-overflow:ellipsis;min-width:0;overflow:hidden}',
      'a.dsb-anchor{color:inherit;text-decoration:none;border-radius:var(--dsw-radius-sm)}',
      'a.dsb-anchor .dsb-pill{cursor:pointer}',
      'a.dsb-anchor:hover .dsb-pill,a.dsb-anchor:focus-visible .dsb-pill{',
      'background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      'a.dsb-anchor:focus-visible{outline:var(--dsw-focus-ring-width) solid ',
      'var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
    ].join('');

    /** Install the pill stylesheet once per page and return its removal. */
    function installStyles() {
      if (typeof document === 'undefined') return () => {};
      const selector = 'style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']';
      if (document.querySelector(selector) !== null) return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-plugin-balance';
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }

    /** Decimal wallet string to integer cents; malformed and non-finite text counts as zero. */
    function toCents(text) {
      const value = Number(text);
      return Number.isFinite(value) ? Math.round(value * 100) : 0;
    }

    /** Whole cents as grouped decimal text, truncating sub-cent credit the way Platform does. */
    function formatCents(cents) {
      const negative = cents < 0;
      const absolute = Math.abs(cents);
      const whole = Math.floor(absolute / 100);
      const fraction = absolute % 100;
      return (negative ? '-' : '') + whole.toLocaleString('en-US') + '.' + String(fraction).padStart(2, '0');
    }

    /**
     * Fold the Host wallet projection into the one currency a compact pill can show.
     * @param balance - Host `getBalance` value, or null while signed out.
     * @returns the leading currency's totals, or null when there is nothing to show.
     */
    function summarize(balance) {
      if (balance === null || typeof balance !== 'object' || balance.status !== 'ready') return null;
      const normal = Array.isArray(balance.value) ? balance.value : [];
      const granted = Array.isArray(balance.bonusWallets) ? balance.bonusWallets : [];
      const order = [];
      const totals = new Map();
      let positive = false;
      const add = (wallet, bucket) => {
        if (wallet === null || typeof wallet !== 'object') return;
        const currency = wallet.currency;
        if (currency !== 'CNY' && currency !== 'USD') return;
        const cents = toCents(wallet.balance);
        if (!totals.has(currency)) {
          totals.set(currency, { topUp: 0, bonus: 0 });
          order.push(currency);
        }
        totals.get(currency)[bucket] += cents;
        if (cents > 0) positive = true;
      };
      for (const wallet of normal) add(wallet, 'topUp');
      for (const wallet of granted) add(wallet, 'bonus');
      if (order.length === 0) return null;
      const currency = order[0];
      const entry = totals.get(currency);
      return {
        currency,
        topUp: entry.topUp,
        bonus: entry.bonus,
        total: entry.topUp + entry.bonus,
        positive,
      };
    }

    /** Amount text for one summary, keeping tiny positive credit visible. */
    function amountText(summary) {
      if (summary.total === 0 && summary.positive) return '<0.01 ' + summary.currency;
      return formatCents(summary.total) + ' ' + summary.currency;
    }

    /** Outline wallet glyph sized by the pill's own CSS. */
    function WalletIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
        h('rect', {
          x: 1.9,
          y: 3.4,
          width: 12.2,
          height: 9.2,
          rx: 2.4,
          stroke: 'currentColor',
          strokeWidth: 1.3,
        }),
        h('path', {
          d: 'M9.2 8h4.9',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
        }),
      );
    }

    /**
     * One composer-dock pill with the account's remaining credit.
     * @param props - balance and usage-URL readers from the plugin scope, plus the slot's translator.
     * @returns the pill link, or null while there is no wallet to report.
     */
    function BalancePill(props) {
      const readBalance = props.readBalance;
      const readUsageUrl = props.readUsageUrl;
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const [state, setState] = React.useState({ phase: 'loading' });
      const [usageUrl, setUsageUrl] = React.useState(DEFAULT_USAGE_URL);

      React.useEffect(() => {
        let alive = true;
        Promise.resolve()
          .then(() => readUsageUrl())
          .then((url) => {
            if (alive && typeof url === 'string' && url !== '') setUsageUrl(url);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [readUsageUrl]);

      React.useEffect(() => {
        let alive = true;
        const load = () => {
          Promise.resolve()
            .then(() => readBalance())
            .then((result) => {
              if (!alive || result === null || typeof result !== 'object') return;
              if (result.ok !== true) return;
              if (result.value === null) {
                setState({ phase: 'signed-out' });
                return;
              }
              if (result.value !== null && typeof result.value === 'object' && result.value.status === 'ready') {
                setState({ phase: 'ready', balance: result.value });
              }
            })
            .catch(() => {});
        };
        load();
        const timer = window.setInterval(load, REFRESH_MS);
        const onVisible = () => {
          if (document.visibilityState === 'visible') load();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
          alive = false;
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
          window.removeEventListener('focus', onVisible);
        };
      }, [readBalance]);

      const summary = state.phase === 'ready' ? summarize(state.balance) : null;
      if (summary === null) return null;

      const total = amountText(summary);
      const tooltip = [
        t('pill.title'),
        t('pill.available') + ': ' + total,
        t('pill.topUp') + ': ' + formatCents(summary.topUp) + ' ' + summary.currency,
        t('pill.bonus') + ': ' + formatCents(summary.bonus) + ' ' + summary.currency,
        '',
        t('pill.openUsage'),
      ].join('\n');

      return h(
        'a',
        {
          className: 'dsb-anchor',
          'data-composer-stat': 'balance',
          href: usageUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          title: tooltip,
          'aria-label': t('pill.aria') + ': ' + total + '. ' + t('pill.openUsage'),
        },
        h(
          'span',
          { className: 'dsb-pill' },
          WalletIcon(),
          h('span', { className: 'dsb-label' }, total),
        ),
      );
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'deepseek-balance: dictionaries');
        ctx.effect(() => installStyles(), 'deepseek-balance: stylesheet');

        /** Build one account-call identity at call time. */
        const clientMetadata = () => {
          const boot = globalThis.__DSH_BOOT__;
          const version = boot !== null && typeof boot === 'object' && boot.release !== null && typeof boot.release === 'object' && typeof boot.release.version === 'string' ? boot.release.version : '1.0.0';
          return {
            version,
            locale: typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : 'en',
            timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
          };
        };

        /** Ask the Host for the signed-in account's wallets. */
        const readBalance = () => {
          const account = ctx.remote !== void 0 && ctx.remote !== null ? ctx.remote.account : void 0;
          if (account === void 0 || account === null || typeof account.getBalance !== 'function') {
            return Promise.resolve({ ok: false });
          }
          return account.getBalance(clientMetadata());
        };

        /** Resolve the Platform usage destination the Host derives from its platform origin. */
        const readUsageUrl = () => {
          const account = ctx.remote !== void 0 && ctx.remote !== null ? ctx.remote.account : void 0;
          if (account === void 0 || account === null || typeof account.getState !== 'function') {
            return Promise.resolve(DEFAULT_USAGE_URL);
          }
          return account.getState().then(
            (result) => {
              const url = result !== null && result !== void 0 && result.ok === true && result.value !== null && typeof result.value === 'object' && result.value.links !== null && typeof result.value.links === 'object' ? result.value.links.usageUrl : void 0;
              return typeof url === 'string' && /^https?:\/\/[^\s]+$/i.test(url) ? url : DEFAULT_USAGE_URL;
            },
            () => DEFAULT_USAGE_URL,
          );
        };

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'deepseek-balance',
              order: 2,
              locale: NS,
              inject: () => ({ readBalance, readUsageUrl }),
            },
            BalancePill,
          ),
        );
      },
    };
  },
});
