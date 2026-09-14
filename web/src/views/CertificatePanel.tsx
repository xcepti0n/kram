/**
 * Installing the CA root on a device (DD-41).
 *
 * This host serves HTTPS with a certificate from a CA running inside the
 * container, so browsers warn until that CA is trusted. Trusting it is a
 * per-device, one-time step, and typing a URL on a phone is a poor way to
 * start it — hence a button, on the device already looking at this page.
 *
 * Renders nothing at all when no certificate is published (a plain-HTTP
 * install, or one where Caddy has not issued yet). A button that downloads a
 * 404 is worse than no button.
 */
import { useEffect, useState } from 'react';
import styles from './CertificatePanel.module.css';

interface CaInfo {
  available: boolean;
  fingerprint: string | null;
}

export function CertificatePanel() {
  const [info, setInfo] = useState<CaInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ca-root/info')
      .then((response) => (response.ok ? response.json() : { available: false, fingerprint: null }))
      .then((data: CaInfo) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo({ available: false, fingerprint: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info?.available) return null;

  return (
    <section className={styles.section} data-testid="certificate-panel">
      <h2 className={styles.heading}>This device</h2>
      <p className={styles.description}>
        Kram serves HTTPS using its own certificate authority, which runs on the server. Install it
        once per device and the browser warning goes away for good.
      </p>

      <div className={styles.row}>
        <a
          className={styles.button}
          href="/api/ca-root"
          download="kram-root.crt"
          data-testid="download-certificate"
        >
          Download certificate
        </a>
      </div>

      <ol className={styles.steps}>
        <li>
          <strong>iPhone or iPad</strong> — install the downloaded profile under Settings, then turn
          it on under <em>General → About → Certificate Trust Settings</em>. Both steps are needed;
          the second is easy to miss.
        </li>
        <li>
          <strong>Mac</strong> — open it in Keychain Access under <em>System</em>, then set it to
          Always Trust.
        </li>
        <li>
          <strong>Android</strong> — Settings → Security → Encryption &amp; credentials → Install a
          certificate → CA certificate.
        </li>
      </ol>

      {/* The one check a person can actually perform: compare this against what
          the device shows before trusting it. */}
      {info.fingerprint && (
        <div className={styles.fingerprint}>
          <span className={styles.fingerprintLabel}>SHA-256 fingerprint</span>
          <code className={styles.fingerprintValue}>{info.fingerprint}</code>
          <p className={styles.fingerprintNote}>
            Your device shows this when installing. If it differs, do not trust the certificate.
          </p>
        </div>
      )}
    </section>
  );
}
