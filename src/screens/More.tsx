import { Link } from 'react-router-dom';
import { Icon, Logo, type IconName } from '../components/Icon';
import { useT } from '../i18n';
import { InstallHint } from '../components/InstallHint';

export function More() {
  const t = useT();
  const items: { to: string; icon: IconName; label: string }[] = [
    { to: '/stats', icon: 'chart', label: t('nav.stats') },
    { to: '/favorites', icon: 'star', label: t('nav.favorites') },
    { to: '/logbook', icon: 'book', label: t('nav.logbook') },
    { to: '/settings', icon: 'settings', label: t('nav.settings') },
  ];
  return (
    <div className="page page-narrow">
      <div className="more-head">
        <Logo size={48} />
        <div>
          <h1>Tankradar</h1>
          <p className="muted small">{t('app.tagline')}</p>
        </div>
      </div>
      <InstallHint force />
      <nav className="more-list">
        {items.map((i) => (
          <Link key={i.to} to={i.to}>
            <Icon name={i.icon} /> <span className="grow">{i.label}</span> <Icon name="next" size={18} className="muted" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
